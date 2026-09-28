import { env } from '$env/dynamic/private';
import * as Sentry from '@sentry/sveltekit';
import { findReservationPages, prepareReservation } from './reservations';
import { rankPlaces } from './profile/rank';
import Browserbase from '@browserbasehq/sdk';
import { publicHttps } from './public-url';
import { extractMenu } from './menu';

type SearchContext = { preferredCuisines: string[] };

type Capability = {
	description: string;
	input: Record<string, string>;
	run: (
		input: Record<string, unknown>,
		onBrowserSession?: (event: {
			open: boolean;
			id: string;
			venue: string;
			image?: string;
		}) => Promise<void>,
		context?: SearchContext
	) => unknown | Promise<unknown>;
};

type GeoapifyArea = {
	name?: string;
	suburb?: string;
	district?: string;
	city?: string;
	state?: string;
	state_code?: string;
	country?: string;
	formatted?: string;
	place_id?: string;
	lat?: number;
	lon?: number;
	result_type?: string;
};

type GeoapifyPlace = {
	geometry?: { coordinates?: number[] };
	properties?: { place_id?: string; name?: string; formatted?: string; categories?: string[] };
};

const areaCache = new Map<string, GeoapifyArea>();

async function geoapifyJson(url: URL, span: string) {
	url.searchParams.set('apiKey', env.GEOAPIFY_API_KEY);
	const response = await Sentry.startSpan({ name: span, op: 'http.client' }, () =>
		fetch(url, { signal: AbortSignal.timeout(12_000) })
	);
	if (!response.ok) throw new Error(`Geoapify ${response.status}`);
	return response.json();
}

function matchesArea(query: string, area: GeoapifyArea) {
	const normalize = (value: string) =>
		value
			.toLowerCase()
			.replace(/\bmt\b\.?/g, 'mount')
			.replace(/\bcity\b/g, '')
			.replace(/[^a-z0-9]+/g, ' ')
			.trim();
	const [place, context] = query.split(',');
	return (
		[
			area.name,
			area.suburb,
			area.district,
			area.city,
			area.formatted?.split(',')[0],
			area.suburb && area.city ? `${area.suburb} ${area.city}` : undefined
		].some((value) => value && normalize(value) === normalize(place)) &&
		(!context ||
			normalize(area.formatted ?? '').includes(normalize(context)) ||
			[area.state, area.state_code, area.country].some(
				(value) => value && normalize(value) === normalize(context)
			))
	);
}

async function resolveArea(name: string) {
	const key = name.toLocaleLowerCase();
	const cached = areaCache.get(key);
	if (cached) return cached;
	const [place, city, ...rest] = name.split(',').map((part) => part.trim());
	const repeatedCity = city && place.toLowerCase().endsWith(` ${city.toLowerCase()}`);
	const downtownCalifornia = /^downtown (.+),\s*(?:california|ca)$/i.exec(name);
	const query = repeatedCity
		? [place.slice(0, -city.length).trim(), city, ...rest].join(', ')
		: downtownCalifornia
			? `${place}, ${downtownCalifornia[1]}, California`
			: name;
	const url = new URL('https://api.geoapify.com/v1/geocode/search');
	url.searchParams.set('text', query);
	url.searchParams.set('format', 'json');
	url.searchParams.set('limit', '5');
	const data = (await geoapifyJson(url, 'geoapify.geocode')) as { results?: GeoapifyArea[] };
	const matches = data.results?.filter(
		(result) =>
			result.place_id &&
			Number.isFinite(result.lat) &&
			Number.isFinite(result.lon) &&
			['suburb', 'district', 'city', 'locality'].includes(result.result_type ?? '') &&
			matchesArea(query, result)
	);
	const requested = query.split(',')[0].toLowerCase();
	const area =
		matches?.find((result) => result.formatted?.toLowerCase().startsWith(`${requested},`)) ??
		matches?.[0];
	if (area) {
		if (areaCache.size >= 100) areaCache.delete(areaCache.keys().next().value!);
		areaCache.set(key, area);
	}
	return area;
}

async function geoapifySearch(
	area: unknown,
	kind: unknown = 'restaurant',
	options: { venue?: unknown; cuisine?: unknown; preferredCuisines?: string[] } = {}
) {
	if (typeof area !== 'string' || area.trim().length < 3 || area.length > 100) {
		return { error: 'Provide a neighborhood or city name (up to 100 characters).' };
	}
	const name = area.trim();
	if (/\b\d{1,6}\s+[a-z]/i.test(name) || /[-+]?\d+(?:\.\d+)?\s*,\s*[-+]?\d+(?:\.\d+)?/.test(name)) {
		return { error: 'Use a public neighborhood or city, not a street address or coordinates.' };
	}
	if (kind !== 'restaurant' && kind !== 'cafe') {
		return { error: 'Choose restaurant or cafe.' };
	}
	if (
		(options.venue !== undefined &&
			(typeof options.venue !== 'string' || options.venue.length > 100)) ||
		(options.cuisine !== undefined &&
			(typeof options.cuisine !== 'string' || options.cuisine.length > 40))
	)
		return { error: 'Provide a short venue or cuisine name.' };
	if (!env.GEOAPIFY_API_KEY) return { error: 'Place search is not configured.' };

	try {
		const location = await resolveArea(name);
		if (!location?.place_id) return { error: 'Area not found or ambiguous. Include the city.' };
		const url = new URL('https://api.geoapify.com/v2/places');
		url.searchParams.set('categories', kind === 'cafe' ? 'catering.cafe' : 'catering.restaurant');
		url.searchParams.set('filter', `place:${location.place_id}`);
		url.searchParams.set('bias', `proximity:${location.lon},${location.lat}`);
		url.searchParams.set('limit', '25');
		const result = (await geoapifyJson(url, 'geoapify.places')) as { features?: GeoapifyPlace[] };
		if (!Array.isArray(result.features)) throw new Error('Invalid place results.');
		const places = result.features.flatMap((feature) => {
			const coordinates = feature.geometry?.coordinates;
			const {
				place_id: id,
				name: placeName,
				formatted: address,
				categories
			} = feature.properties ?? {};
			if (
				!id ||
				!placeName ||
				!Array.isArray(coordinates) ||
				!Number.isFinite(coordinates[0]) ||
				!Number.isFinite(coordinates[1])
			)
				return [];
			return [
				{
					id,
					name: placeName,
					address,
					categories: categories ?? [],
					lon: coordinates[0],
					lat: coordinates[1]
				}
			];
		});
		Sentry.getActiveSpan()?.setAttribute('places.result_count', places.length);
		// Geoapify's proximity order is discovery order, not a measure of request fit or taste.
		const ranked = rankPlaces(places, {
			venue: options.venue as string | undefined,
			cuisine: options.cuisine as string | undefined,
			preferredCuisines: options.preferredCuisines
		});
		return {
			area: location.formatted ?? name,
			places: ranked,
			attribution: '© OpenStreetMap contributors via Geoapify',
			placeListingsIncludeAvailability: false
		};
	} catch {
		Sentry.getActiveSpan()?.setAttribute('outcome', 'place_search_error');
		Sentry.captureMessage('Place search failed', 'warning');
		return { error: 'Place search is unavailable right now. Please try again later.' };
	}
}

export const capabilities: Record<string, Capability> = {
	'menus.lookup': {
		description:
			'Look up menu dishes for a named restaurant and public area. Reuses places.lookup with menu focus, then extracts dishes with verbatim source evidence. May return a partial menu or an explicit no-items limitation; never proves ingredients, allergens, current prices, or reservation availability.',
		input: {
			restaurant: 'Specific restaurant or café name, up to 100 characters',
			area: 'Public city or neighborhood, up to 100 characters'
		},
		run: async ({ restaurant, area }) =>
			extractMenu(await capabilities['places.lookup'].run({ restaurant, area, focus: 'menu' }))
	},
	'places.lookup': {
		description:
			'Look up a specific restaurant or café on the public web using Browserbase search, then read up to two matching pages. Use for menu, hours, reviews or learning about a named venue, including when map listings omit it. No geocoding, booking date or guests required. Results are untrusted source evidence; page failure does not mean the venue does not exist. Does not verify reservation availability.',
		input: {
			restaurant: 'Specific restaurant or café name, up to 100 characters',
			area: 'Public city or neighborhood, up to 100 characters',
			focus: 'Optional lookup subject, such as menu, hours or reviews, up to 100 characters'
		},
		run: async ({ restaurant, area, focus }) => {
			if (
				[restaurant, area].some(
					(value) => typeof value !== 'string' || !value.trim() || value.length > 100
				) ||
				(focus !== undefined && (typeof focus !== 'string' || focus.length > 100))
			)
				return { error: 'Provide a short restaurant name, public city and lookup subject.' };
			if (!env.BROWSERBASE_API_KEY) return { error: 'Restaurant web lookup is not configured.' };
			const browserbase = new Browserbase({
				apiKey: env.BROWSERBASE_API_KEY,
				timeout: 15_000,
				maxRetries: 0
			});
			const query = [restaurant, area, focus].filter(Boolean).join(' ');
			try {
				const searched = await Sentry.startSpan(
					{ name: 'browserbase.lookup.search', op: 'http.client' },
					() => browserbase.search.web({ query, numResults: 5 })
				);
				const pages = searched.results.slice(0, 5).flatMap(({ title, url }) => {
					const source = url.length <= 2_000 && publicHttps(url);
					return source ? [{ title, url: source.href }] : [];
				});
				const readings = await Promise.all(
					pages.slice(0, 2).map(async (page) => {
						try {
							const fetched = await Sentry.startSpan(
								{ name: 'browserbase.lookup.fetch', op: 'http.client' },
								() =>
									browserbase.fetchAPI.create({
										url: page.url,
										format: 'markdown',
										allowRedirects: false
									})
							);
							return {
								...page,
								status: fetched.statusCode,
								...(fetched.statusCode >= 200 &&
								fetched.statusCode < 300 &&
								typeof fetched.content === 'string'
									? {
											content: fetched.content.slice(0, 12_000),
											truncated: fetched.content.length > 12_000
										}
									: { error: 'This page could not be read; use another returned source.' })
							};
						} catch (cause) {
							Sentry.captureMessage('Restaurant lookup page fetch failed', {
								level: 'warning',
								extra: {
									errorType: cause instanceof Error ? cause.name : 'unknown',
									status: cause instanceof Browserbase.APIError ? cause.status : undefined
								}
							});
							return {
								...page,
								error: 'This page could not be read; use another returned source.'
							};
						}
					})
				);
				return {
					restaurant,
					area,
					query,
					pages,
					readings,
					checkedAt: new Date().toISOString(),
					placeListingsIncludeAvailability: false
				};
			} catch (cause) {
				Sentry.captureMessage('Restaurant web lookup search failed', {
					level: 'warning',
					extra: {
						errorType: cause instanceof Error ? cause.name : 'unknown',
						status: cause instanceof Browserbase.APIError ? cause.status : undefined
					}
				});
				return { error: 'Restaurant web lookup is unavailable right now.' };
			}
		}
	},
	followup: {
		description:
			'Ask the user for missing information and end this turn. The footer accepts replies; supply short answer choices for non-calendar questions and an explicit responseType. Write guest-count choices as natural labels such as "1 person", "2 people", or "4 guests", not bare numbers or letter prefixes. Do not use for facts you can find with another capability.',
		input: {
			question: 'One concise question for the user',
			responseType: 'text, partySize, date, or time: the missing detail this question asks for',
			options:
				'Optional array of up to four short answer labels, sent verbatim as replies. For partySize use "1 person", "2 people", "4 guests", etc., without A/B/C/D prefixes; free text is always available',
			calendarView:
				'Missing calendar detail: month if month is unknown, day if month is known but day is unknown, time if date is known but time is unknown. Shows only that picker; pass known date/time as presets.',
			date: 'Calendar preset: known YYYY-MM-DD, or YYYY-MM when calendarView is month/day. A month preset does not select a booking day.',
			time: 'Known local HH:mm time from the conversation to prefill the calendar'
		},
		run: ({ question, responseType = 'text', options, calendarView, date, time }) => {
			if (typeof question !== 'string' || !question.trim() || question.length > 300)
				return { error: 'Provide one question of at most 300 characters.' };
			if (
				options !== undefined &&
				(!Array.isArray(options) ||
					options.length > 4 ||
					!options.every(
						(option) => typeof option === 'string' && option.trim() && option.length <= 80
					))
			)
				return { error: 'Provide up to four short answer choices.' };
			if (!['text', 'partySize', 'date', 'time'].includes(String(responseType)))
				return { error: 'Choose text, partySize, date, or time as responseType.' };
			if (calendarView !== undefined && !['date', 'time'].includes(String(responseType)))
				return { error: 'Calendars are only available for date or time questions.' };
			if (calendarView !== undefined && !['month', 'day', 'time'].includes(String(calendarView)))
				return { error: 'Choose month, day, or time for the calendar.' };
			if (
				calendarView !== undefined &&
				((responseType === 'time' && calendarView !== 'time') ||
					(responseType === 'date' && calendarView === 'time'))
			)
				return { error: 'Use time for time questions, or month/day for date questions.' };
			// A month anchors the picker only; reservations still require the user's chosen day.
			if (
				typeof date === 'string' &&
				/^\d{4}-(0[1-9]|1[0-2])$/.test(date) &&
				(calendarView === 'month' || calendarView === 'day')
			)
				date = `${date}-01`;
			if (calendarView === 'time' && date === undefined)
				return { error: 'Provide the known date before asking for its time.' };
			if (
				date !== undefined &&
				(typeof date !== 'string' ||
					!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
					!Number.isFinite(Date.parse(`${date}T00:00:00Z`)) ||
					new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date)
			)
				return { error: 'Provide a valid calendar date.' };
			if (
				time !== undefined &&
				(typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
			)
				return { error: 'Provide a valid HH:mm calendar time.' };
			return {
				kind: 'followup',
				question: question.trim(),
				responseType,
				options: options?.length
					? options.map((option: string) =>
							responseType === 'partySize' && /^\d+$/.test(option.trim())
								? `${option.trim()} ${Number(option) === 1 ? 'person' : 'people'}`
								: option
						)
					: responseType === 'partySize'
						? ['1 person', '2 people', '4 guests', '6 guests']
						: [],
				...(calendarView ? { calendarView } : {}),
				...(date ? { date } : {}),
				...(time ? { time } : {})
			};
		}
	},
	'reservations.prepare': {
		description:
			'Recheck the user-selected time on its reservation page and advance to checkout. Stops before guest details, payment, or final booking submission. Only available after the user chooses Continue to checkout.',
		input: {
			venue: 'Selected venue',
			date: 'Selected YYYY-MM-DD date',
			partySize: 'Selected guest count',
			time: 'Selected time',
			experience: 'Selected seating experience, if the time appears under more than one',
			sourceUrl: 'Reservation page from the verified search result'
		},
		run: (input) =>
			prepareReservation(input as Parameters<typeof prepareReservation>[0], env.BROWSERBASE_API_KEY)
	},
	'reservations.find': {
		description:
			'Find restaurants or cafés and inspect their reservation pages in a browser, across booking providers. Reuse the venue, area, and sourceUrl from this conversation; a prior booking link takes precedence over new search. With date and partySize, the browser sets and verifies filters and reads visible times. Include startTime/endTime for a window plus 30 minutes nearby. Report observed blocks or incomplete inspection; links alone do not prove availability. Call separately for each reservation stop. No booking is made.',
		input: {
			restaurant: 'Restaurant or café name from places.search, if known',
			area: 'Public neighborhood and city, such as West Village, New York City',
			sourceUrl:
				'Optional public HTTPS reservation link from this conversation; inspect this destination first',
			bookingProvider:
				'Optional booking provider requested by the user; otherwise search across providers',
			kind: 'restaurant or cafe; defaults to restaurant',
			cuisine:
				'Optional cuisine explicitly requested by the user; guides booking-page search and prioritizes supported place categories',
			date: 'Optional complete booking date YYYY-MM-DD. For YYYY-MM, ask for the day with followup instead; do not search again or invent a day.',
			partySize: 'Optional number of guests, 1–12',
			startTime: 'Optional requested window start, local 24-hour HH:mm; provide with endTime',
			endTime:
				'Optional requested window end, local 24-hour HH:mm; exact provider times within 30 minutes on either side are shown',
			calendarView: 'Optional month, day, or time view for the reservation calendar'
		},
		run: async (input, onBrowserSession, context) => {
			if (typeof input.date === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(input.date))
				return capabilities.followup.run({
					question: 'Which day works for you?',
					responseType: 'date',
					calendarView: 'day',
					date: input.date
				});
			if (
				input.calendarView !== undefined &&
				!['month', 'day', 'time'].includes(String(input.calendarView))
			)
				return { error: 'Choose month, day, or time for the calendar.' };
			const [reservation, discovery] = await Promise.all([
				findReservationPages(input, { browserbase: env.BROWSERBASE_API_KEY }, onBrowserSession),
				input.area
					? geoapifySearch(input.area, input.kind, {
							venue: input.restaurant,
							cuisine: input.cuisine,
							preferredCuisines: context?.preferredCuisines
						})
					: null
			]);
			return discovery && 'places' in discovery
				? {
						...reservation,
						...(input.calendarView ? { calendarView: input.calendarView } : {}),
						area: discovery.area,
						places: discovery.places,
						attribution: discovery.attribution,
						placeListingsIncludeAvailability: false
					}
				: {
						...reservation,
						...(input.calendarView ? { calendarView: input.calendarView } : {}),
						...(discovery && 'error' in discovery ? { placeSearchError: discovery.error } : {})
					};
		}
	},
	'places.search': {
		description:
			'Find restaurants or cafés inside a named neighborhood or city. Call once for each distinct area; each result belongs only to its resolved area. Does not show reservation availability.',
		input: {
			area: 'Public neighborhood and city, such as West Village, New York City; no private addresses',
			kind: 'restaurant or cafe; defaults to restaurant',
			restaurant: 'Optional exact venue name to prioritize',
			cuisine:
				'Optional cuisine explicitly requested by the user; used only when supported by a place category'
		},
		run: ({ area, kind, restaurant, cuisine }, _onBrowserSession, context) =>
			geoapifySearch(area, kind, {
				venue: restaurant,
				cuisine,
				preferredCuisines: context?.preferredCuisines
			})
	},
	'clock.now': {
		description: 'Get the current date and time in an IANA timezone.',
		input: { timezone: 'IANA timezone, such as America/New_York or UTC' },
		run: ({ timezone }) => {
			if (typeof timezone !== 'string' || timezone.length > 64) {
				return { error: 'Provide a valid timezone.' };
			}
			try {
				return {
					timezone,
					now: new Intl.DateTimeFormat('en-US', {
						timeZone: timezone,
						dateStyle: 'full',
						timeStyle: 'long'
					}).format(new Date())
				};
			} catch {
				return { error: 'Provide a valid timezone.' };
			}
		}
	},
	'weather.current': {
		description:
			'Get current outdoor temperature and conditions at a public place coordinate returned by places.search. Not a forecast.',
		input: {
			latitude: 'Latitude from a public places.search result',
			longitude: 'Longitude from a public places.search result',
			unit: 'C or F; defaults to C'
		},
		run: async ({ latitude, longitude, unit = 'C' }) => {
			if (
				typeof latitude !== 'number' ||
				!Number.isFinite(latitude) ||
				latitude < -90 ||
				latitude > 90 ||
				typeof longitude !== 'number' ||
				!Number.isFinite(longitude) ||
				longitude < -180 ||
				longitude > 180 ||
				(unit !== 'C' && unit !== 'F')
			) {
				return { error: 'Provide valid public place coordinates and C or F units.' };
			}
			if (!env.GOOGLE_WEATHER_API_KEY) return { error: 'Weather is not configured.' };
			try {
				const url = new URL('https://weather.googleapis.com/v1/currentConditions:lookup');
				url.searchParams.set('location.latitude', String(latitude));
				url.searchParams.set('location.longitude', String(longitude));
				url.searchParams.set('unitsSystem', unit === 'F' ? 'IMPERIAL' : 'METRIC');
				const response = await fetch(url, {
					headers: { 'X-Goog-Api-Key': env.GOOGLE_WEATHER_API_KEY },
					signal: AbortSignal.timeout(8_000)
				});
				if (!response.ok) throw new Error('Weather request failed.');
				const data = (await response.json()) as {
					currentTime?: string;
					temperature?: { degrees?: number; unit?: string };
					feelsLikeTemperature?: { degrees?: number };
					weatherCondition?: { description?: { text?: string } };
				};
				if (!Number.isFinite(data.temperature?.degrees))
					throw new Error('Invalid weather response.');
				return {
					latitude,
					longitude,
					temperature: data.temperature!.degrees,
					feelsLike: data.feelsLikeTemperature?.degrees,
					unit: data.temperature!.unit,
					condition: data.weatherCondition?.description?.text,
					observedAt: data.currentTime,
					checkedAt: new Date().toISOString(),
					attribution: 'Source: Includes weather data from Google'
				};
			} catch {
				return { error: 'Current weather is unavailable right now.' };
			}
		}
	}
};
