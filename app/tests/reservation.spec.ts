import { chatResponseBody, expect, test } from './evidence';
import Browserbase from '@browserbasehq/sdk';
import { chromium } from '@playwright/test';
import { createUIMessageStream, createUIMessageStreamResponse } from 'ai';
import { decodeJwt } from 'jose';
import { reservationCase as sample } from './reservation-case';

test('repeated place searches update one map per area', async ({ page }) => {
	let calls = 0;
	await page.route('https://maps.geoapify.com/**', (route) =>
		route.fulfill({
			json: { version: 8, sources: {}, layers: [{ id: 'background', type: 'background' }] }
		})
	);
	await page.route('**/api/chat', async (route) => {
		calls++;
		if (calls === 3)
			expect(route.request().postDataJSON().selectedPlace.name).toBe('Updated venue');
		const response = createUIMessageStreamResponse({
			stream: createUIMessageStream({
				execute: ({ writer }) => {
					writer.write({ type: 'start' });
					const results =
						calls === 1
							? [
									['San Mateo', 'Old venue'],
									['San Mateo', 'Latest venue'],
									['West Village', 'Other stop']
								]
							: [['San Mateo', calls === 2 ? 'Updated venue' : '']];
					for (const [index, [area, name]] of results.entries()) {
						const toolCallId = `places-${calls}-${index}`;
						writer.write({
							type: 'tool-input-available',
							toolCallId,
							toolName: 'execute',
							input: { name: 'places.search', input: { area } }
						});
						writer.write({
							type: 'tool-output-available',
							toolCallId,
							output: {
								area,
								attribution: 'Geoapify',
								places: name ? [{ id: name, name, lat: 37.56 + calls / 100, lon: -122.32 }] : []
							}
						});
					}
					writer.write({ type: 'text-start', id: 'answer' });
					writer.write({ type: 'text-delta', id: 'answer', delta: `Search ${calls} complete.` });
					writer.write({ type: 'text-end', id: 'answer' });
					writer.write({ type: 'finish' });
				}
			})
		});
		await route.fulfill({
			status: 200,
			headers: Object.fromEntries(response.headers),
			body: await response.text()
		});
	});
	await page.goto('/');
	const send = async (text: string) => {
		await page.getByLabel('Your reservation request').fill(text);
		await page.getByRole('button', { name: 'Send message' }).click();
		await expect(page.getByText(`Search ${calls} complete.`)).toBeVisible();
	};
	await send('Find dinner in San Mateo and West Village.');
	await expect(page.getByRole('region', { name: 'Places found' })).toHaveCount(2);
	await expect(page.getByRole('button', { name: 'Old venue', exact: true })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Select Latest venue', exact: true })).toHaveCount(
		1
	);
	const canvas = page.getByLabel('Restaurant map').first().locator('canvas');
	await canvas.evaluate((node) => node.setAttribute('data-probe', 'original'));
	await send('Refine San Mateo.');
	await expect(page.getByRole('region', { name: 'Places found' })).toHaveCount(2);
	await expect(page.getByRole('button', { name: 'Select Latest venue', exact: true })).toHaveCount(
		0
	);
	await expect(page.getByRole('button', { name: 'Select Updated venue', exact: true })).toHaveCount(
		1
	);
	await expect(canvas).toHaveAttribute('data-probe', 'original');
	await page.getByRole('button', { name: 'Updated venue', exact: true }).click();
	await send('Check another cuisine.');
	await expect(page.getByRole('region', { name: 'Places found' })).toHaveCount(1);
	await expect(page.getByRole('button', { name: 'Other stop', exact: true })).toHaveCount(1);
	await page.getByRole('button', { name: 'New chat' }).click();
	await expect(page.getByRole('region', { name: 'Places found' })).toHaveCount(0);
});

test('chat sends only the newest message and preserves history on oversized rejection', async ({
	page
}) => {
	test.info().annotations.push({ type: 'transportFault', description: 'expected_http_413' });
	let calls = 0;
	const requests: Array<{
		messages: Array<{ role: string; parts: Array<{ text?: string }> }>;
	}> = [];
	await page.route('**/api/chat', async (route) => {
		calls++;
		requests.push(route.request().postDataJSON());
		if (calls === 4) {
			await route.fulfill({ status: 413, body: 'Rejected' });
			return;
		}
		const response = createUIMessageStreamResponse({
			stream: createUIMessageStream({
				execute: ({ writer }) => {
					writer.write({ type: 'start' });
					writer.write({ type: 'text-start', id: `answer-${calls}` });
					writer.write({ type: 'text-delta', id: `answer-${calls}`, delta: `Answer ${calls}.` });
					writer.write({ type: 'text-end', id: `answer-${calls}` });
					writer.write({ type: 'finish' });
				}
			})
		});
		await route.fulfill({
			status: 200,
			headers: Object.fromEntries(response.headers),
			body: await response.text()
		});
	});
	await page.goto('/');
	for (let turn = 1; turn <= 3; turn++) {
		await page.getByLabel('Your reservation request').fill(`Earlier request ${turn}.`);
		await page.getByRole('button', { name: 'Send message' }).click();
		await expect(page.getByText(`Answer ${turn}.`)).toBeVisible();
	}
	const latest = 'Find dinner for two tomorrow.';
	await page.getByLabel('Your reservation request').fill(latest);
	await page.getByRole('button', { name: 'Send message' }).click();
	await expect(page.getByRole('alert')).toContainText(
		'This chat is still too long. Start a new chat.'
	);
	expect(calls, 'Do not repeat an unchanged newest-message request').toBe(4);
	expect(requests.every((request) => request.messages.length === 1)).toBe(true);
	expect(requests[3].messages[0].parts[0].text).toBe(latest);
	await expect(page.getByRole('button', { name: 'Retry', exact: true })).toHaveCount(0);
	for (let turn = 1; turn <= 3; turn++) {
		await expect(page.getByText(`Earlier request ${turn}.`)).toBeVisible();
		await expect(page.getByText(`Answer ${turn}.`)).toBeVisible();
	}
	await expect(page.getByText(latest)).toHaveCount(1);
	await page.getByRole('button', { name: 'New chat', exact: true }).click();
	await expect(page.getByRole('alert')).toHaveCount(0);
});

test('chat shows rate limit and streamed model errors', async ({ page }) => {
	test.info().annotations.push({
		type: 'transportFault',
		description: 'expected_http_429_and_stream_error'
	});
	let calls = 0;
	await page.route('**/api/chat', async (route) => {
		calls++;
		if (calls === 1) {
			await route.fulfill({ status: 429, body: 'Rejected' });
			return;
		}
		const response = createUIMessageStreamResponse({
			stream: createUIMessageStream({
				execute: ({ writer }) => {
					writer.write({ type: 'start' });
					writer.write({ type: 'error', errorText: 'The model is busy. Please retry shortly.' });
				}
			})
		});
		await route.fulfill({
			status: 200,
			headers: Object.fromEntries(response.headers),
			body: await response.text()
		});
	});
	await page.goto('/');
	await page.getByLabel('Your reservation request').fill('Find dinner.');
	await page.getByRole('button', { name: 'Send message' }).click();
	await expect(page.getByRole('alert')).toContainText('Too many requests. Try again shortly.');
	await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
	expect(calls).toBe(1);
	await page.getByRole('button', { name: 'New chat' }).click();
	await page.getByLabel('Your reservation request').fill('Find dinner.');
	await page.getByRole('button', { name: 'Send message' }).click();
	await expect(page.getByRole('alert')).toContainText('The model is busy. Please retry shortly.');
	await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
	expect(calls).toBe(2);
});

test('answers calendar and text questions without duplicate sends', async ({ page }) => {
	let calls = 0;
	await page.route('**/api/chat', async (route) => {
		calls++;
		const body = route.request().postDataJSON();
		if (calls === 2) {
			expect(body.selectedDate).toBe(sample.date);
			expect(body.selectedSlot).toEqual({
				venue: sample.venue,
				date: sample.date,
				partySize: sample.partySize,
				time: sample.times[0]
			});
			expect(body.messages.at(-1).parts[0].text).toContain(sample.times[0]);
		}
		if (calls === 6) {
			expect(body.selectedSlot ?? null).toBeNull();
			expect(body.messages.at(-1).parts[0].text).toBe('6:30 PM on 2026-09-28');
		}
		if (calls === 4) {
			expect(body.messages.at(-1).parts[0].text).toBe('West Village');
		}
		if (calls === 14) {
			expect(body.selectedDate ?? null).toBeNull();
			expect(body.messages.at(-1).parts[0].text).toContain('in 2026-09. Help me choose a day.');
		}
		if (calls === 16) expect(body.messages.at(-1).parts[0].text).toContain('on 2026-09-29.');
		if (calls === 10) expect(body.messages.at(-1).parts[0].text).toBe('2026-09');
		if (calls === 12) expect(body.messages.at(-1).parts[0].text).toBe('2026-09-29');
		const response = createUIMessageStreamResponse({
			stream: createUIMessageStream({
				execute: ({ writer }) => {
					writer.write({ type: 'start' });
					if ([1, 5, 13, 15].includes(calls)) {
						writer.write({
							type: 'tool-input-available',
							toolCallId: 'reservation-search',
							toolName: 'execute',
							input: { name: 'reservations.find', input: sample }
						});
						writer.write({
							type: 'tool-output-available',
							toolCallId: 'reservation-search',
							output: {
								request: { venue: sample.venue, date: sample.date, partySize: sample.partySize },
								...(calls === 13
									? { calendarView: 'month' }
									: calls === 15
										? { calendarView: 'day' }
										: {}),
								inspection: {
									visibleTimes: calls === 1 ? sample.times : [],
									checkedAt: new Date().toISOString(),
									complete: true
								},
								availability: 'Visible times for the requested date and party.'
							}
						});
					}
					if ([3, 5, 7, 9, 11].includes(calls)) {
						writer.write({
							type: 'tool-input-available',
							toolCallId: `followup-${calls}`,
							toolName: 'execute',
							input: { name: 'followup', input: {} }
						});
						writer.write({
							type: 'tool-output-available',
							toolCallId: `followup-${calls}`,
							output: {
								kind: 'followup',
								responseType:
									calls >= 9 ? 'date' : calls === 7 ? 'partySize' : calls === 3 ? 'text' : 'time',
								date: '2026-09-28',
								time: '16:00',
								calendarView: calls === 9 ? 'month' : calls === 11 ? 'day' : 'time',
								question:
									calls === 7
										? 'How many guests?'
										: calls === 3
											? 'What neighborhood?'
											: 'Which time works for you?',
								options:
									calls === 7
										? ['1 guest', '2 guests', '4 guests', '6 guests']
										: calls === 3
											? ['West Village', 'Chelsea']
											: []
							}
						});
					} else {
						writer.write({ type: 'text-start', id: `answer-${calls}` });
						writer.write({
							type: 'text-delta',
							id: `answer-${calls}`,
							delta: calls === 1 ? 'Here are the checked times.' : 'Selection received.'
						});
						writer.write({ type: 'text-end', id: `answer-${calls}` });
					}
					writer.write({ type: 'finish' });
				}
			})
		});
		await route.fulfill({
			status: 200,
			headers: Object.fromEntries(response.headers),
			body: await response.text()
		});
	});

	await page.goto('/');
	await expect(page.getByLabel('Your reservation request')).toBeVisible();
	await page.getByLabel('Your reservation request').fill('Find a table for two at Ai Fiori.');
	await page.getByRole('button', { name: 'Send message' }).click();
	const calendar = page.getByRole('region', { name: 'Reservation calendar' });
	await expect(calendar.getByRole('button', { name: sample.times[0] })).toBeVisible();
	await expect(calendar.getByRole('button', { name: sample.times[1] })).toBeVisible();
	await expect(page.getByRole('textbox', { name: 'Reply to the agent' })).toHaveCount(0);
	await expect(page.getByRole('group', { name: 'Calendar view' })).toHaveCount(0);
	await expect(page.getByLabel('Time', { exact: true })).toHaveCount(0);
	await calendar.getByRole('button', { name: sample.times[0] }).click();
	expect(calls, 'Choosing a verified slot is local, without another model turn.').toBe(1);
	await expect(page.getByLabel('Your reservation request')).toBeFocused();
	await page
		.getByLabel('Your reservation request')
		.fill(
			`I choose ${sample.venue} on ${sample.date} at ${sample.times[0]} for ${sample.partySize} guests.`
		);
	await page.getByRole('button', { name: 'Send message' }).click();
	await expect(page.getByText('Selection received.')).toBeVisible();
	await expect(calendar).toHaveCount(0);
	await expect(page.getByText(/Earlier availability\s+check/)).toBeVisible();
	expect(calls).toBe(2);
	await page.getByRole('button', { name: 'New chat' }).click();
	await page.getByLabel('Your reservation request').fill('Find brunch.');
	await page.getByRole('button', { name: 'Send message' }).click();
	await expect(page.getByRole('group', { name: 'Calendar view' })).toHaveCount(0);
	await page.getByRole('button', { name: 'West Village', exact: true }).click();
	await expect(page.getByText('Selection received.')).toBeVisible();
	expect(calls).toBe(4);
	await page.getByRole('button', { name: 'New chat' }).click();
	await page.getByLabel('Your reservation request').fill('Adjust September 28 at 4 pm.');
	await page.getByRole('button', { name: 'Send message' }).click();
	await expect(page.getByLabel('Date', { exact: true })).toHaveCount(0);
	await expect(page.getByRole('group', { name: 'Calendar view' })).toHaveCount(0);
	await expect(page.getByText('Monday, September 28', { exact: true })).toBeVisible();
	await expect(page.getByLabel('Time', { exact: true })).toHaveValue('16:00');
	await expect(page.getByRole('region', { name: 'Reservation calendar' })).toHaveCount(0);
	await page.getByLabel('Time', { exact: true }).fill('18:30');
	await page.getByRole('button', { name: 'Use time', exact: true }).focus();
	await page.keyboard.press('Enter');
	await expect(page.getByText('Selection received.')).toBeVisible();
	await expect(page.getByLabel('Your reservation request')).toBeFocused();
	expect(calls).toBe(6);
	await page.getByRole('button', { name: 'New chat' }).click();
	await page.getByLabel('Your reservation request').fill('Find a table.');
	await page.getByRole('button', { name: 'Send message' }).click();
	await expect(page.getByRole('group', { name: 'Calendar view' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: '4 guests', exact: true })).toBeVisible();
	await page.getByRole('button', { name: '2 guests', exact: true }).click();
	await expect(page.getByText('Selection received.')).toBeVisible();
	expect(calls).toBe(8);
	await page.getByRole('button', { name: 'New chat' }).click();
	await page.getByLabel('Your reservation request').fill('Help me choose a month.');
	await page.getByRole('button', { name: 'Send message' }).click();
	await expect(page.getByRole('button', { name: 'September 2026', exact: true })).toBeVisible();
	await expect(page.getByLabel('Time', { exact: true })).toHaveCount(0);
	await page.getByRole('button', { name: 'September 2026', exact: true }).click();
	await expect(page.getByText('Selection received.')).toBeVisible();
	expect(calls).toBe(10);
	await page.getByRole('button', { name: 'New chat' }).click();
	await page.getByLabel('Your reservation request').fill('Which day in September?');
	await page.getByRole('button', { name: 'Send message' }).click();
	await expect(page.getByRole('group', { name: 'Calendar view' })).toHaveCount(0);
	await expect(page.getByLabel('Daily calendar timeline')).toHaveCount(0);
	await page.getByRole('button', { name: 'Tuesday, September 29, 2026', exact: true }).click();
	await expect(page.getByText('Selection received.')).toBeVisible();
	expect(calls).toBe(12);
	await page.getByRole('button', { name: 'New chat' }).click();
	await page.getByLabel('Your reservation request').fill('Check another month.');
	await page.getByRole('button', { name: 'Send message' }).click();
	await expect(page.getByRole('group', { name: 'Calendar view' })).toHaveCount(0);
	await page.getByRole('button', { name: 'September 2026', exact: true }).click();
	await expect(page.getByText('Selection received.').last()).toBeVisible();
	expect(calls).toBe(14);
	await page.getByRole('button', { name: 'New chat' }).click();
	await page.getByLabel('Your reservation request').fill('Check another day.');
	await page.getByRole('button', { name: 'Send message' }).click();
	await expect(page.getByLabel('Time', { exact: true })).toHaveCount(0);
	await page.getByRole('button', { name: 'Tuesday, September 29, 2026', exact: true }).click();
	await expect(page.getByText('Selection received.').last()).toBeVisible();
	expect(calls).toBe(16);
});

test('expired reservation times require a new check', async ({ page }) => {
	let calls = 0;
	await page.route('**/api/chat', async (route) => {
		calls++;
		if (calls === 2) {
			const message = route.request().postDataJSON().messages.at(-1);
			expect(message.parts[0].text).toBe(
				`Please check ${sample.venue} for ${sample.partySize} guests on ${sample.date}.`
			);
		}
		const response = createUIMessageStreamResponse({
			stream: createUIMessageStream({
				execute: ({ writer }) => {
					writer.write({ type: 'start' });
					if (calls === 1) {
						writer.write({
							type: 'tool-input-available',
							toolCallId: 'expired-search',
							toolName: 'execute',
							input: { name: 'reservations.find', input: sample }
						});
						writer.write({
							type: 'tool-output-available',
							toolCallId: 'expired-search',
							output: {
								request: { venue: sample.venue, date: sample.date, partySize: sample.partySize },
								inspection: {
									visibleTimes: sample.times,
									checkedAt: new Date(Date.now() - 120_000).toISOString(),
									complete: true
								}
							}
						});
					}
					writer.write({ type: 'finish' });
				}
			})
		});
		await route.fulfill({
			status: 200,
			headers: Object.fromEntries(response.headers),
			body: await response.text()
		});
	});

	await page.goto('/');
	await page.getByLabel('Your reservation request').fill('Find a table for two at Ai Fiori.');
	await page.getByRole('button', { name: 'Send message' }).click();
	const calendar = page.getByRole('region', { name: 'Reservation calendar' });
	await expect(calendar.getByText('Times need a fresh check.')).toBeVisible();
	await expect(calendar.getByRole('button', { name: sample.times[0] })).toHaveCount(0);
	const refreshed = page.waitForResponse((response) => response.url().endsWith('/api/chat'));
	await calendar.getByRole('button', { name: 'Check again' }).click();
	expect(await chatResponseBody(await refreshed, page)).toContain('"type":"finish"');
	await expect(page.getByRole('button', { name: 'Send message' })).toBeDisabled();
	await expect.poll(() => calls).toBe(2);
});

test('live reservation search reaches the checkout handoff', async ({ page }) => {
	test.skip(
		process.env.RUN_LIVE_RESERVATION !== '1',
		'Set RUN_LIVE_RESERVATION=1 and LIVE_RESERVATION_DATE to run against SevenRooms.'
	);
	const date = process.env.LIVE_RESERVATION_DATE;
	expect(date, 'Set LIVE_RESERVATION_DATE=YYYY-MM-DD for a future date with inventory.').toMatch(
		/^\d{4}-\d{2}-\d{2}$/
	);
	test.setTimeout(300_000);
	let sessionId: string | undefined;
	await page.goto('/');
	await page
		.getByLabel('Your reservation request')
		.fill(
			`Find every dinner time for two at Ai Fiori in New York City on ${date}, 7–9 PM. Show only times verified on the reservation page.`
		);
	await page.getByRole('button', { name: 'Send message' }).click();
	try {
		const calendar = page.getByRole('region', { name: 'Reservation calendar' });
		await expect(calendar).toBeVisible({ timeout: 100_000 });
		await expect(calendar.getByRole('tab')).toHaveCount(0);
		const time = calendar.getByRole('button', { name: /^[78]:\d{2} PM(?: · .+)?$/ }).first();
		await expect(time, 'The agent must expose a provider-verified time.').toBeVisible();
		const chosenTime = (await time.innerText()).split(' · ')[0];
		await time.click();
		await expect(page.getByRole('button', { name: 'Continue to checkout' })).toBeEnabled({
			timeout: 30_000
		});
		await page.getByRole('button', { name: 'Continue to checkout' }).click();
		const checkout = page.getByRole('link', { name: 'View checkout in live browser' });
		await expect(checkout).toBeVisible({
			timeout: 100_000
		});
		await expect(page.getByText('No booking was submitted.')).toBeVisible();
		await page.screenshot({ path: 'tests/local/reservation-checkout-handoff.png', fullPage: true });
		const href = (await checkout.getAttribute('href'))!;
		const ticket = new URL(href, page.url()).searchParams.get('ticket');
		const claims = decodeJwt(ticket!);
		sessionId = (claims.sid as string | undefined) ?? undefined;
		expect(typeof claims.pid).toBe('string');
		expect(sessionId).toBeTruthy();
		const response = await page.request.get(href, {
			maxRedirects: 0
		});
		expect(response.status()).toBe(302);
		expect(new URL(response.headers().location).hostname).toMatch(/(^|\.)browserbase\.com$/);
		const views = await new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY }).sessions.debug(
			sessionId!
		);
		const expectedView = new URL(
			views.pages.find((target) => target.id === claims.pid)!.debuggerFullscreenUrl
		);
		const actualView = new URL(response.headers().location);
		expect(actualView.searchParams.get('wss')!.split('?')[0]).toBe(
			expectedView.searchParams.get('wss')!.split('?')[0]
		);
		// Read the actual retained provider page independently of the agent's checkout claim.
		const session = await new Browserbase({
			apiKey: process.env.BROWSERBASE_API_KEY
		}).sessions.retrieve(sessionId!);
		expect(session.connectUrl).toBeTruthy();
		const remote = await chromium.connectOverCDP(session.connectUrl!);
		try {
			const provider = remote
				.contexts()
				.flatMap((context) => context.pages())
				.find((target) => /(sevenrooms|opentable)\.com/.test(target.url()));
			expect(
				provider,
				'The retained session must contain the actual provider checkout.'
			).toBeTruthy();
			await provider!.screenshot({
				path: 'tests/local/reservation-provider-review.png',
				fullPage: true
			});
			await expect(provider!.getByRole('textbox', { name: /first name/i })).toBeVisible();
			await expect(provider!.getByRole('textbox', { name: /first name/i })).toHaveValue('');
			await expect(provider!.getByRole('textbox', { name: /last name/i })).toHaveValue('');
			await expect(provider!.locator('body')).toContainText('Ai Fiori');
			await expect(provider!.locator('body')).toContainText(chosenTime);
			await expect(provider!.locator('body')).toContainText(
				new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
					month: 'short',
					day: 'numeric',
					timeZone: 'UTC'
				})
			);
			await expect(provider!.locator('body')).toContainText('2 people');
			await expect(
				provider!.getByRole('button', { name: 'Complete reservation', exact: true })
			).toBeVisible();
			await test
				.info()
				.attach('provider-review', {
					body: await provider!.locator('body').innerText(),
					contentType: 'text/plain'
				});
		} finally {
			await remote.close();
		}
	} finally {
		await test.info().attach('reservation-transcript', {
			body: await page.locator('main').innerText(),
			contentType: 'text/plain'
		});
		if (sessionId && process.env.BROWSERBASE_API_KEY) {
			await new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY }).sessions.update(
				sessionId,
				{ status: 'REQUEST_RELEASE' }
			);
		}
	}
});

test('browser preview displays streamed frames and closes with inspection', async ({ page }) => {
	const frames = [
		'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAAqADAAQAAAABAAAAAgAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgAAgACAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMAHBwcHBwcMBwcMEQwMDBEXERERERcdFxcXFxcdIt0dHR0dHSLi4uLi4uLi6enp6enp8PDw8PD29vb29vb29vb2//bAEMBIiQkODQ4YDQ0YOWbf5vl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5f/dAAQAAf/aAAwDAQACEQMRAD8AxfMk/vH86TzJP7x/Om0Uhn//2Q==',
		'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAAqADAAQAAAABAAAAAgAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgAAgACAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMAHBwcHBwcMBwcMEQwMDBEXERERERcdFxcXFxcdIt0dHR0dHSLi4uLi4uLi6enp6enp8PDw8PD29vb29vb29vb2//bAEMBIiQkODQ4YDQ0YOWbf5vl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5f/dAAQAAf/aAAwDAQACEQMRAD8ApYFGBQOlLUjP/9k='
	];
	let calls = 0;
	await page.route('**/api/chat', async (route) => {
		calls++;
		const response = createUIMessageStreamResponse({
			stream: createUIMessageStream({
				execute: ({ writer }) => {
					writer.write({ type: 'start' });
					if (calls === 1)
						writer.write({
							type: 'data-browser',
							data: {
								open: true,
								id: 'preview',
								venue: 'Test venue',
								viewPath: '/api/reservations/view?ticket=fixture'
							},
							transient: true
						});
					writer.write({
						type: 'data-browser',
						data:
							calls < 3
								? { id: 'preview', image: frames[calls - 1] }
								: { id: 'preview', open: false },
						transient: true
					});
					writer.write({ type: 'text-start', id: 'text' });
					writer.write({ type: 'text-delta', id: 'text', delta: `Step ${calls}.` });
					writer.write({ type: 'text-end', id: 'text' });
					writer.write({ type: 'finish' });
				}
			})
		});
		await route.fulfill({
			status: 200,
			headers: Object.fromEntries(response.headers),
			body: await response.text()
		});
	});
	await page.goto('/');
	for (let step = 1; step <= 3; step++) {
		await page.getByLabel('Your reservation request').fill(`Inspect step ${step}`);
		await page.getByRole('button', { name: 'Send message' }).click();
		await expect(page.getByText(`Step ${step}.`, { exact: true })).toBeVisible();
		const open = page.getByRole('button', { name: 'Open live reservation browser' });
		if (step === 3) {
			await expect(open).toHaveCount(0);
			break;
		}
		await expect(page.getByRole('dialog')).toHaveCount(0);
		await open.click();
		const image = page.getByRole('img', { name: 'Browser inspection of Test venue' });
		await expect(image).toHaveAttribute('src', frames[step - 1]);
		await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBe(2);
		await expect(page.locator('iframe')).toHaveCount(0);
		await page.keyboard.press('Escape');
		await expect(open).toBeFocused();
	}
});
