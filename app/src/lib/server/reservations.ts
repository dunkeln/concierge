import { browserbase, Stagehand } from '@browserbasehq/stagehand';
import * as Sentry from '@sentry/sveltekit';

type ReservationQuery = {
	restaurant?: unknown;
	area?: unknown;
	kind?: unknown;
	date?: unknown;
	partySize?: unknown;
};

export async function findReservationPages(
	input: ReservationQuery,
	keys: { browserbase?: string }
) {
	const restaurantInput = typeof input.restaurant === 'string' ? input.restaurant.trim() : '';
	const area = typeof input.area === 'string' ? input.area.trim() : '';
	const restaurant =
		area && restaurantInput.toLowerCase().endsWith(`, ${area.toLowerCase()}`)
			? restaurantInput.slice(0, -area.length - 2).trim()
			: restaurantInput;
	if ((!restaurant && !area) || restaurantInput.length > 100 || area.length > 100) {
		return { error: 'Provide a venue or public neighborhood/city (up to 100 characters).' };
	}
	if (input.kind !== undefined && input.kind !== 'restaurant' && input.kind !== 'cafe') {
		return { error: 'Choose restaurant or cafe.' };
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
		const query = [
			restaurant,
			area,
			input.kind === 'cafe' ? 'cafe reservations' : 'restaurant reservations'
		]
			.filter(Boolean)
			.join(' ');
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
					parsed.searchParams.delete('party_size');
					return [{ title, url: parsed.toString() }];
				} catch {
					return [];
				}
			})
			.slice(0, 5);
		const result: {
			pages: typeof pages;
			inspection?: unknown;
			availability: string;
			request: { venue: string; date: string | null; partySize: number | null };
		} = {
			pages,
			availability: 'Not checked for the requested date and party size.',
			request: {
				venue: restaurant || area,
				date: typeof input.date === 'string' ? input.date : null,
				partySize: typeof input.partySize === 'number' ? input.partySize : null
			}
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
		if (!sevenrooms || typeof input.date !== 'string' || typeof input.partySize !== 'number')
			return result;
		const inspectSpan = Sentry.startInactiveSpan({ name: 'sevenrooms.inspect', op: 'browser' });
		let inspectionStage = 'launch';

		try {
			const browser = await browserbase.launch({ apiKey: browserbaseKey });
			try {
				inspectionStage = 'attach';
				const stagehand = await Stagehand.create({ browser });
				try {
					inspectionStage = 'navigate';
					const [page] = await browser.context.pages();
					const filteredUrl = new URL(sevenrooms.url);
					filteredUrl.searchParams.set('date', input.date);
					filteredUrl.searchParams.set('party_size', String(input.partySize));
					await page.goto(filteredUrl.toString());
					const requestedDate = new Date(`${input.date}T00:00:00Z`).toLocaleDateString('en-US', {
						timeZone: 'UTC',
						month: 'short',
						day: 'numeric'
					});
					inspectionStage = 'verify_filters';
					let tree = '';
					for (let attempt = 0; attempt < 8; attempt++) {
						tree = (await page.snapshot()).formattedTree;
						if (
							tree.includes(`button: Date ${requestedDate}`) &&
							tree.includes(`button: Guests ${input.partySize} Guests`) &&
							(/button: \d{1,2}:\d{2} [AP]M/.test(tree) ||
								tree.includes('No availability on this date'))
						)
							break;
						await new Promise((resolve) => setTimeout(resolve, 1_000));
					}
					const selectedDate = /button: Date ([A-Za-z]{3} \d{1,2})/.exec(tree)?.[1] ?? null;
					const selectedPartySize = Number(/button: Guests (\d+) Guests/.exec(tree)?.[1]) || null;
					const selectedUrlDate = new URL(await page.url()).searchParams.get('date');
					const filtersMatch =
						selectedDate === requestedDate &&
						selectedUrlDate === input.date &&
						selectedPartySize === input.partySize;
					if (!filtersMatch) {
						inspectSpan.setAttribute('outcome', 'filter_mismatch');
						result.availability =
							'Provider filters could not be verified; these are candidate links only.';
						return result;
					}
					sevenrooms.url = filteredUrl.toString();
					inspectionStage = 'extract_times';
					const readCards = () =>
						page.evaluate(() => {
							const buttons = [...document.querySelectorAll('button')];
							const visible = (button: Element) =>
								button.getClientRects().length > 0 &&
								getComputedStyle(button).visibility === 'visible';
							const experiences = [...document.querySelectorAll('h3')].flatMap((heading) => {
								let card = heading as HTMLElement;
								while (card.parentElement?.querySelectorAll('h3').length === 1) {
									card = card.parentElement;
								}
								if (card.innerText.includes('No availability on this date')) return [];
								const cardButtons = [...card.querySelectorAll('button')].filter(visible);
								const times = [
									...new Set(
										cardButtons
											.map((button) => button.textContent?.trim() ?? '')
											.filter((label) => /^\d{1,2}:\d{2} [AP]M$/.test(label))
									)
								];
								const more = cardButtons.find((button) =>
									/^\d+ More times$/.test(button.textContent?.trim() ?? '')
								);
								return times.length || more
									? [
											{
												name: heading.textContent?.trim() ?? '',
												times,
												moreButtonIndex: more ? buttons.indexOf(more) : -1
											}
										]
									: [];
							});
							return experiences;
						});
					let experiences = await readCards();
					for (let attempt = 0; attempt < 12; attempt++) {
						const more = experiences.find((experience) => experience.moreButtonIndex >= 0);
						if (!more) break;
						await page.locator('button').nth(more.moreButtonIndex).click();
						experiences = await readCards();
					}
					const visibleTimes = [...new Set(experiences.flatMap((experience) => experience.times))];
					inspectSpan.setAttribute('reservation.visible_time_count', visibleTimes.length);
					result.inspection = {
						url: filteredUrl.toString(),
						venue: restaurant,
						selectedDate,
						selectedPartySize,
						checkedAt: new Date().toISOString(),
						experiences: experiences.map(({ name, times }) => ({ name, times })),
						visibleTimes,
						complete: !experiences.some((experience) => experience.moreButtonIndex >= 0)
					};
					if (visibleTimes.length) {
						result.availability =
							'Visible times for the requested date and party; availability may change.';
					} else {
						result.availability = 'No times verified for the selected date and party.';
					}
				} finally {
					await stagehand.close();
				}
			} finally {
				await browser.close();
			}
		} catch (cause) {
			inspectSpan.setAttribute('outcome', 'inspection_error');
			Sentry.withScope((scope) => {
				scope.setTag('reservation.inspection_stage', inspectionStage);
				scope.setTag('reservation.error_type', cause instanceof Error ? cause.name : 'unknown');
				Sentry.captureMessage('SevenRooms page inspection failed', 'warning');
			});
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
