import { env } from '$env/dynamic/private';
import * as Sentry from '@sentry/sveltekit';
import { findReservationPages, prepareReservation } from './reservations';
import { rankPlaces } from './ranking';

type SearchContext = { preferredCuisines: string[] };

type Capability = {
	description: string;
	input: Record<string, string>;
	run: (
		input: Record<string, unknown>,
		onBrowserSession?: (event: { open: boolean; id: string; venue: string }) => Promise<void>,
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
	const query = repeatedCity
		? [place.slice(0, -city.length).trim(), city, ...rest].join(', ')
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
	followup: {
		description:
			'Ask the user for missing information and end this turn. Render a reply field, with optional short choices. Do not use for facts you can find with another capability.',
		input: {
			question: 'One concise question for the user',
			options: 'Optional array of up to four short answer choices; free text is always available',
			calendarView: 'Optional month, day, or time when a calendar helps answer the question',
			date: 'Optional YYYY-MM-DD date to open the calendar on'
		},
		run: ({ question, options, calendarView, date }) => {
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
			if (calendarView !== undefined && !['month', 'day', 'time'].includes(String(calendarView)))
				return { error: 'Choose month, day, or time for the calendar.' };
			if (
				date !== undefined &&
				(typeof date !== 'string' ||
					!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
					!Number.isFinite(Date.parse(`${date}T00:00:00Z`)) ||
					new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date)
			)
				return { error: 'Provide a valid calendar date.' };
			return {
				kind: 'followup',
				question: question.trim(),
				options: options ?? [],
				...(calendarView ? { calendarView } : {}),
				...(date ? { date } : {})
			};
		}
	},
	'reservations.prepare': {
		description:
			'Recheck the user-selected SevenRooms time and advance to provider checkout. Stops before guest details, payment, or final booking submission. Only available after the user chooses Continue to checkout.',
		input: {
			venue: 'Selected venue',
			date: 'Selected YYYY-MM-DD date',
			partySize: 'Selected guest count',
			time: 'Selected time',
			experience: 'Selected SevenRooms experience, if the time appears under more than one',
			sourceUrl: 'SevenRooms page from the verified search result'
		},
		run: (input) =>
			prepareReservation(input as Parameters<typeof prepareReservation>[0], env.BROWSERBASE_API_KEY)
	},
	'reservations.find': {
		description:
			'Find nearby restaurants or cafés in a public area and their reservation pages in one call. A matching SevenRooms page may show expanded times for a specified date and party size. Place listings and other booking links are not verified availability. Call separately for each stop in a multi-stop plan. No booking is made.',
		input: {
			restaurant: 'Restaurant or café name from places.search, if known',
			area: 'Public neighborhood and city, such as West Village, New York City',
			kind: 'restaurant or cafe; defaults to restaurant',
			cuisine:
				'Optional cuisine explicitly requested by the user; used only when supported by a place category',
			date: 'Optional requested date as YYYY-MM-DD',
			partySize: 'Optional number of guests, 1–12',
			calendarView: 'Optional month, day, or time view for the reservation calendar'
		},
		run: async (input, onBrowserSession, context) => {
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
			'Find restaurants or cafés inside a named neighborhood or city using Geoapify. Call once for each distinct area; each result belongs only to its resolved area. Does not show reservation availability.',
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
