import { browserbase, Stagehand, type ClientLLM } from '@browserbasehq/stagehand';
import OpenAI from 'openai';
import * as Sentry from '@sentry/sveltekit';
import { z } from 'zod/v4';

type ReservationQuery = {
	restaurant?: unknown;
	area?: unknown;
	date?: unknown;
	partySize?: unknown;
};

const pageSchema = z.object({
	visibleTimes: z.array(z.string())
});

function makeModel(apiKey: string): ClientLLM {
	const openrouter = new OpenAI({ apiKey, baseURL: 'https://openrouter.ai/api/v1' });
	return {
		generate: async (request) => {
			if (request.responseFormat?.type !== 'json_schema') {
				throw new Error('Stagehand requires a structured response.');
			}
			const response = await openrouter.responses.create({
				model: 'openai/gpt-4.1-mini',
				instructions: request.systemPrompt,
				input: request.messages.map((message) => ({
					role: message.role,
					content: (Array.isArray(message.content) ? message.content : [message.content]).map(
						(block) => {
							if (block.type === 'text') return { type: 'input_text' as const, text: block.text };
							if (block.type === 'image')
								return {
									type: 'input_image' as const,
									image_url: `data:${block.mimeType};base64,${block.data}`,
									detail: 'auto' as const
								};
							throw new Error('Unsupported Stagehand message content.');
						}
					)
				})) as unknown as Parameters<typeof openrouter.responses.create>[0]['input'],
				text: {
					format: {
						type: 'json_schema',
						name: request.responseFormat.name,
						schema: request.responseFormat.schema as Record<string, unknown>,
						strict: true
					}
				}
			});
			return {
				role: 'assistant',
				content: { type: 'text', text: response.output_text },
				outputFormat: 'json_schema',
				structuredContent: JSON.parse(response.output_text)
			};
		}
	};
}

export async function findReservationPages(
	input: ReservationQuery,
	keys: { browserbase?: string; openrouter?: string }
) {
	const restaurant = typeof input.restaurant === 'string' ? input.restaurant.trim() : '';
	const area = typeof input.area === 'string' ? input.area.trim() : '';
	if ((!restaurant && !area) || restaurant.length > 100 || area.length > 100) {
		return { error: 'Provide a restaurant or public neighborhood/city (up to 100 characters).' };
	}
	if (
		input.date !== undefined &&
		(typeof input.date !== 'string' ||
			!/^\d{4}-\d{2}-\d{2}$/.test(input.date) ||
			Number.isNaN(new Date(`${input.date}T00:00:00Z`).getTime()) ||
			new Date(`${input.date}T00:00:00Z`).toISOString().slice(0, 10) !== input.date)
	) {
		return { error: 'Use an ISO date (YYYY-MM-DD).' };
	}
	if (
		input.partySize !== undefined &&
		(!Number.isInteger(input.partySize) ||
			(input.partySize as number) < 1 ||
			(input.partySize as number) > 12)
	) {
		return { error: 'Party size must be 1–12.' };
	}
	if (!keys.browserbase) return { error: 'Reservation page search is not configured.' };
	const browserbaseKey = keys.browserbase;

	try {
		const query = [restaurant, area, 'restaurant reservations'].filter(Boolean).join(' ');
		if (query.length > 160) return { error: 'Shorten the restaurant or area name.' };
		const platformResults = restaurant
			? await Sentry.startSpan({ name: 'browserbase.search.sevenrooms', op: 'http.client' }, () =>
					browserbase.search({
						apiKey: browserbaseKey,
						query: `${restaurant} ${area} reservations site:sevenrooms.com/explore`,
						numResults: 5
					})
				)
			: null;
		const match = platformResults?.results.find(
			({ title, url }) =>
				title
					.replace(/^Reservation at /i, '')
					.trim()
					.toLowerCase() === restaurant.toLowerCase() &&
				/^https:\/\/www\.sevenrooms\.com\/explore\//.test(url)
		);
		const searched = match
			? { results: [match] }
			: await Sentry.startSpan({ name: 'browserbase.search.pages', op: 'http.client' }, () =>
					browserbase.search({ apiKey: browserbaseKey, query, numResults: 5 })
				);
		const pages = searched.results
			.flatMap(({ title, url }) => {
				try {
					const parsed = new URL(url);
					if (parsed.protocol !== 'https:') return [];
					parsed.searchParams.delete('date');
					parsed.searchParams.delete('seats');
					return [{ title, url: parsed.toString() }];
				} catch {
					return [];
				}
			})
			.slice(0, 5);
		const result: { pages: typeof pages; inspection?: unknown; availability: string } = {
			pages,
			availability: 'Not checked for the requested date and party size.'
		};
		Sentry.getActiveSpan()?.setAttribute('reservation.page_count', pages.length);

		// ponytail: one supported browser flow; add adapters only after another platform is proven.
		const venue = restaurant.toLowerCase();
		const sevenrooms = pages.find(({ title, url }) => {
			const host = new URL(url).hostname;
			return (
				(host === 'sevenrooms.com' || host === 'www.sevenrooms.com') &&
				url.includes('/explore/') &&
				venue.length > 0 &&
				title
					.replace(/^Reservation at /i, '')
					.trim()
					.toLowerCase() === venue
			);
		});
		if (!sevenrooms || !keys.openrouter) return result;
		const openrouterKey = keys.openrouter;
		const inspectSpan = Sentry.startInactiveSpan({ name: 'sevenrooms.inspect', op: 'browser' });

		try {
			const browser = await browserbase.launch({ apiKey: browserbaseKey });
			try {
				const stagehand = await Stagehand.create({ browser, model: makeModel(openrouterKey) });
				try {
					const [page] = await browser.context.pages();
					await page.goto(sevenrooms.url);
					let tree = '';
					for (let attempt = 0; attempt < 8; attempt++) {
						tree = (await page.snapshot()).formattedTree;
						if (
							tree.includes('Search for reservations') &&
							(/button: \d{1,2}:\d{2} [AP]M/.test(tree) ||
								tree.includes('No availability on this date'))
						)
							break;
						await new Promise((resolve) => setTimeout(resolve, 1_000));
					}
					if (!tree.includes('Search for reservations')) return result;
					if (input.partySize !== undefined) {
						await stagehand.act('Click the Guests selector in the reservation search controls.');
						await stagehand.act(`Select ${input.partySize} guests from the open menu.`);
					}
					if (typeof input.date === 'string') {
						await stagehand.act('Click the Date selector in the reservation search controls.');
						const requested = new Date(`${input.date}T00:00:00Z`).toLocaleDateString('en-US', {
							timeZone: 'UTC',
							month: 'long',
							day: 'numeric',
							year: 'numeric'
						});
						await stagehand.act(`Select ${requested} in the open date picker.`);
					}
					const requestedDate =
						typeof input.date === 'string'
							? new Date(`${input.date}T00:00:00Z`).toLocaleDateString('en-US', {
									timeZone: 'UTC',
									month: 'short',
									day: 'numeric'
								})
							: null;
					for (let attempt = 0; attempt < 8; attempt++) {
						tree = (await page.snapshot()).formattedTree;
						if (
							(!requestedDate || tree.includes(`button: Date ${requestedDate}`)) &&
							(input.partySize === undefined ||
								tree.includes(`button: Guests ${input.partySize} Guests`)) &&
							(/button: \d{1,2}:\d{2} [AP]M/.test(tree) ||
								tree.includes('No availability on this date'))
						)
							break;
						await new Promise((resolve) => setTimeout(resolve, 1_000));
					}
					const selectedDate = /button: Date ([A-Za-z]{3} \d{1,2})/.exec(tree)?.[1] ?? null;
					const selectedPartySize = Number(/button: Guests (\d+) Guests/.exec(tree)?.[1]) || null;
					const filtersMatch =
						(!requestedDate || selectedDate === requestedDate) &&
						(input.partySize === undefined || selectedPartySize === input.partySize);
					if (!filtersMatch) return result;
					if (!/button: \d{1,2}:\d{2} [AP]M/.test(tree)) {
						result.availability = 'No times were visible for the selected date and party.';
						return result;
					}
					const inspected = await stagehand.extract(
						'From this reservation page only, extract times explicitly visible as bookable buttons. Do not infer or invent times.',
						pageSchema
					);
					const visibleTimes = [
						...new Set(
							inspected.data.visibleTimes.filter((time) => tree.includes(`button: ${time}`))
						)
					];
					inspectSpan.setAttribute('reservation.visible_time_count', visibleTimes.length);
					result.inspection = {
						url: sevenrooms.url,
						venue: restaurant,
						selectedDate,
						selectedPartySize,
						visibleTimes,
						complete: false
					};
					if (requestedDate && input.partySize !== undefined && visibleTimes.length) {
						result.availability =
							'Visible times for the requested date and party; more times may be hidden.';
					}
				} finally {
					await stagehand.close();
				}
			} finally {
				await browser.close();
			}
		} catch {
			inspectSpan.setAttribute('outcome', 'inspection_error');
			Sentry.captureMessage('SevenRooms page inspection failed', 'warning');
			result.availability =
				'Reservation page inspection was unavailable; these are candidate links only.';
		} finally {
			inspectSpan.end();
		}
		return result;
	} catch {
		Sentry.captureMessage('Reservation page search failed', 'warning');
		return { error: 'Reservation page search is unavailable right now.' };
	}
}
