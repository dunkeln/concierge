import { env } from '$env/dynamic/private';
import * as Sentry from '@sentry/sveltekit';
import { findReservationPages, prepareReservation } from './reservations';

type Capability = {
	description: string;
	input: Record<string, string>;
	run: (input: Record<string, unknown>) => unknown | Promise<unknown>;
};

type MapboxFeature = {
	geometry?: { coordinates?: number[] };
	properties?: {
		mapbox_id?: string;
		name?: string;
		full_address?: string;
		poi_category?: string[];
	};
};

type OsmArea = {
	display_name?: string;
	lat?: string;
	lon?: string;
	boundingbox?: string[];
};

const areaCache = new Map<string, OsmArea>();
// ponytail: This limiter is per process; use a hosted geocoder or shared limiter before deploying at scale.
let nextNominatimRequestAt = 0;
let nominatimQueue: Promise<unknown> = Promise.resolve();

async function resolveArea(name: string) {
	const key = name.toLocaleLowerCase();
	const cached = areaCache.get(key);
	if (cached) return cached;
	const request = nominatimQueue.then(async () => {
		const queuedCached = areaCache.get(key);
		if (queuedCached) return queuedCached;
		const delay = Math.max(0, nextNominatimRequestAt - Date.now());
		if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
		nextNominatimRequestAt = Date.now() + 1_100;
		const url = new URL(env.NOMINATIM_SEARCH_URL || 'https://nominatim.openstreetmap.org/search');
		url.search = new URLSearchParams({ q: name, format: 'jsonv2', limit: '1' }).toString();
		const response = await Sentry.startSpan({ name: 'osm.resolve_area', op: 'http.client' }, () =>
			fetch(url, {
				headers: {
					'User-Agent': 'ConciergePearl/0.1 (https://concierge-pearl.vercel.app)',
					Referer: 'https://concierge-pearl.vercel.app/'
				},
				signal: AbortSignal.timeout(8_000)
			})
		);
		if (!response.ok) throw new Error('Area lookup failed.');
		const results = (await response.json()) as OsmArea[];
		const area = results[0];
		if (area) {
			if (areaCache.size >= 100) areaCache.delete(areaCache.keys().next().value!);
			areaCache.set(key, area);
		}
		return area;
	});
	nominatimQueue = request.then(
		() => undefined,
		() => undefined
	);
	return request;
}

async function mapboxCall(name: string, args: Record<string, unknown>) {
	const response = await Sentry.startSpan({ name: `mapbox.${name}`, op: 'http.client' }, () =>
		fetch('https://mcp.mapbox.com/mcp', {
			method: 'POST',
			headers: {
				authorization: `Bearer ${env.MAPBOX_ACCESS_TOKEN}`,
				accept: 'application/json, text/event-stream',
				'content-type': 'application/json'
			},
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: 1,
				method: 'tools/call',
				params: { name, arguments: args }
			}),
			signal: AbortSignal.timeout(12_000)
		})
	);
	if (!response.ok) throw new Error('Mapbox request failed.');
	const body = await response.text();
	const data = response.headers.get('content-type')?.includes('text/event-stream')
		? JSON.parse(
				body
					.split(/\r?\n/)
					.find((line) => line.startsWith('data: '))
					?.slice(6) ?? ''
			)
		: JSON.parse(body);
	if (data.error || data.result?.isError) throw new Error('Mapbox search failed.');
	const result = data.result?.structuredContent as
		{ features?: MapboxFeature[]; attribution?: string } | undefined;
	if (!Array.isArray(result?.features)) throw new Error('Invalid Mapbox response.');
	return { features: result.features, attribution: result.attribution };
}

async function mapboxSearch(area: unknown, kind: unknown = 'restaurant') {
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
	if (!env.MAPBOX_ACCESS_TOKEN) return { error: 'Mapbox search is not configured.' };

	try {
		const location = await resolveArea(name);
		const latitude = Number(location?.lat);
		const longitude = Number(location?.lon);
		if (!location || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
			return { error: 'Area not found.' };
		}
		const bounds = location.boundingbox?.map(Number);
		const result = await mapboxCall('category_search_tool', {
			category: kind === 'cafe' ? 'coffee' : 'restaurant',
			limit: 25,
			proximity: { longitude, latitude },
			...(bounds?.length === 4 && bounds.every(Number.isFinite)
				? {
						bbox: {
							minLongitude: bounds[2],
							minLatitude: bounds[0],
							maxLongitude: bounds[3],
							maxLatitude: bounds[1]
						}
					}
				: {})
		});
		const places = result.features.flatMap((feature) => {
			const coordinates = feature.geometry?.coordinates;
			const {
				mapbox_id: id,
				name: placeName,
				full_address: address,
				poi_category: categories
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
				{ id, name: placeName, address, categories, lon: coordinates[0], lat: coordinates[1] }
			];
		});
		Sentry.getActiveSpan()?.setAttribute('places.result_count', places.length);
		return {
			area: location.display_name ?? name,
			places,
			attribution: result.attribution ?? '© Mapbox and its suppliers',
			availability: 'Not provided by Mapbox'
		};
	} catch {
		Sentry.getActiveSpan()?.setAttribute('outcome', 'place_search_error');
		Sentry.captureMessage('Place search failed', 'warning');
		return { error: 'Place search is unavailable right now. Please try again later.' };
	}
}

export const capabilities: Record<string, Capability> = {
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
			'Find reservation pages for a named restaurant or café, or search a public area directly as a fallback. A matching SevenRooms page may show expanded times for a specified date and party size. Many cafés have no reservation inventory. No booking is made.',
		input: {
			restaurant: 'Restaurant or café name from places.search, if known',
			area: 'Public neighborhood and city, such as West Village, New York City',
			kind: 'restaurant or cafe; defaults to restaurant',
			date: 'Optional requested date as YYYY-MM-DD',
			partySize: 'Optional number of guests, 1–12'
		},
		run: (input) =>
			findReservationPages(input, {
				browserbase: env.BROWSERBASE_API_KEY
			})
	},
	'places.search': {
		description:
			'Find restaurants or cafés in a named neighborhood or city. OpenStreetMap resolves the area and Mapbox searches venues inside it. Call once for each distinct area; each result belongs only to its resolved area. Does not show reservation availability.',
		input: {
			area: 'Public neighborhood and city, such as West Village, New York City; no private addresses',
			kind: 'restaurant or cafe; defaults to restaurant'
		},
		run: ({ area, kind }) => mapboxSearch(area, kind)
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
					attribution: 'Source: Includes weather data from Google'
				};
			} catch {
				return { error: 'Current weather is unavailable right now.' };
			}
		}
	}
};
