import { env } from '$env/dynamic/private';
import * as Sentry from '@sentry/sveltekit';
import { findReservationPages } from './reservations';

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
		place_formatted?: string;
		bbox?: number[];
		poi_category?: string[];
	};
};

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

async function mapboxSearch(area: unknown) {
	if (typeof area !== 'string' || area.trim().length < 3 || area.length > 100) {
		return { error: 'Provide a neighborhood or city name (up to 100 characters).' };
	}
	const name = area.trim();
	if (/\b\d{1,6}\s+[a-z]/i.test(name) || /[-+]?\d+(?:\.\d+)?\s*,\s*[-+]?\d+(?:\.\d+)?/.test(name)) {
		return { error: 'Use a public neighborhood or city, not a street address or coordinates.' };
	}
	if (!env.MAPBOX_ACCESS_TOKEN) return { error: 'Mapbox search is not configured.' };

	try {
		const areaResult = await mapboxCall('search_and_geocode_tool', {
			q: name,
			types: ['neighborhood', 'locality', 'place', 'city']
		});
		const location = areaResult.features[0];
		const center = location?.geometry?.coordinates;
		if (!center || !Number.isFinite(center[0]) || !Number.isFinite(center[1])) {
			return { error: 'Area not found.' };
		}
		const bbox = location.properties?.bbox;
		const result = await mapboxCall('category_search_tool', {
			category: 'restaurant',
			limit: 25,
			proximity: { longitude: center[0], latitude: center[1] },
			...(bbox?.length === 4 && bbox.every(Number.isFinite)
				? {
						bbox: {
							minLongitude: bbox[0],
							minLatitude: bbox[1],
							maxLongitude: bbox[2],
							maxLatitude: bbox[3]
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
			area: [location.properties?.name, location.properties?.place_formatted]
				.filter(Boolean)
				.join(', '),
			places,
			attribution: result.attribution ?? '© Mapbox and its suppliers',
			availability: 'Not provided by Mapbox'
		};
	} catch {
		Sentry.getActiveSpan()?.setAttribute('outcome', 'mapbox_error');
		Sentry.captureMessage('Mapbox place search failed', 'warning');
		return { error: 'Mapbox place search is unavailable right now. Please try again later.' };
	}
}

export const capabilities: Record<string, Capability> = {
	'reservations.find': {
		description:
			'Find reservation pages for a named restaurant, or search a public area directly as a fallback. A matching SevenRooms page may show expanded times for a specified date and party size. No booking is made.',
		input: {
			restaurant: 'Restaurant name from places.search, if known',
			area: 'Public neighborhood and city, such as West Village, New York City',
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
			'Find restaurants in a named neighborhood or city using Mapbox. Does not show reservation availability.',
		input: {
			area: 'Public neighborhood and city, such as West Village, New York City; no private addresses'
		},
		run: ({ area }) => mapboxSearch(area)
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
