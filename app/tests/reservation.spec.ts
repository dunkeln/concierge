import { expect, test } from '@playwright/test';
import Browserbase from '@browserbasehq/sdk';
import { createUIMessageStream, createUIMessageStreamResponse } from 'ai';
import { decodeJwt } from 'jose';
import { reservationCase as sample } from './reservation-case';

test('chat shows actionable request errors', async ({ page }) => {
	let calls = 0;
	await page.route('**/api/chat', async (route) => {
		calls++;
		if (calls === 3) {
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
			return;
		}
		await route.fulfill({ status: calls === 1 ? 413 : 429, body: 'Rejected' });
	});
	await page.goto('/');
	await page.getByLabel('Your reservation request').fill('Find dinner.');
	await page.getByRole('button', { name: 'Send message' }).click();
	await expect(page.getByRole('alert')).toContainText('This chat is too long. Start a new chat.');
	await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0);
	await page.getByRole('button', { name: 'New chat' }).click();
	await page.getByLabel('Your reservation request').fill('Find dinner.');
	await page.getByRole('button', { name: 'Send message' }).click();
	await expect(page.getByRole('alert')).toContainText('Too many requests. Try again shortly.');
	await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
	await page.getByRole('button', { name: 'New chat' }).click();
	await page.getByLabel('Your reservation request').fill('Find dinner.');
	await page.getByRole('button', { name: 'Send message' }).click();
	await expect(page.getByRole('alert')).toContainText('The model is busy. Please retry shortly.');
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
		if (calls === 4) {
			expect(body.messages.at(-1).parts[0].text).toBe('West Village');
		}
		const response = createUIMessageStreamResponse({
			stream: createUIMessageStream({
				execute: ({ writer }) => {
					writer.write({ type: 'start' });
					if (calls === 1) {
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
								inspection: {
									visibleTimes: sample.times,
									checkedAt: new Date().toISOString(),
									complete: true
								},
								availability: 'Visible times for the requested date and party.'
							}
						});
					}
					if (calls === 1 || calls === 3) {
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
								question: calls === 1 ? 'Which time works for you?' : 'What neighborhood?',
								options: calls === 3 ? ['West Village', 'Chelsea'] : []
							}
						});
					} else {
						writer.write({ type: 'text-start', id: `answer-${calls}` });
						writer.write({
							type: 'text-delta',
							id: `answer-${calls}`,
							delta: 'Selection received.'
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
	await expect(page.getByRole('textbox', { name: 'Reply to the agent' })).toBeVisible();
	await expect(
		page.locator('[data-slot="message"]', { has: page.getByText('Which time works for you?') })
	).toHaveAttribute('data-align', 'end');
	await calendar.getByLabel('Date').fill('2026-09-29');
	expect(calls).toBe(1);
	await calendar.getByLabel('Date').fill(sample.date);
	await calendar.getByRole('button', { name: sample.times[0] }).click();
	await expect(page.getByText('Selection received.')).toBeVisible();
	await expect(calendar.getByRole('button', { name: sample.times[0] })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	expect(calls).toBe(2);
	await page.getByRole('button', { name: 'New chat' }).click();
	await page.getByLabel('Your reservation request').fill('Find brunch.');
	await page.getByRole('button', { name: 'Send message' }).click();
	await page.getByRole('textbox', { name: 'Reply to the agent' }).fill('West Village');
	await page.getByRole('button', { name: 'Send', exact: true }).click();
	await expect(page.getByText('Selection received.')).toBeVisible();
	expect(calls).toBe(4);
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
	await calendar.getByRole('button', { name: 'Check again' }).click();
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
	test.setTimeout(180_000);
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
		await expect(calendar.getByLabel('Date')).toHaveValue(date!);
		const time = calendar.getByRole('button', { name: /^[78]:\d{2} PM(?: · .+)?$/ }).first();
		await expect(time, 'The agent must expose a provider-verified time.').toBeVisible();
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
		const href = (await checkout.getAttribute('href'))!;
		const ticket = new URL(href, page.url()).searchParams.get('ticket');
		sessionId = (decodeJwt(ticket!).sid as string | undefined) ?? undefined;
		expect(sessionId).toBeTruthy();
		const response = await page.request.get(href, {
			maxRedirects: 0
		});
		expect(response.status()).toBe(302);
		expect(new URL(response.headers().location).hostname).toMatch(/(^|\.)browserbase\.com$/);
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
