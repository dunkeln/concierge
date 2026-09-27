import { expect, test } from '@playwright/test';
import { createUIMessageStream, createUIMessageStreamResponse } from 'ai';
import { reservationCase as sample } from './reservation-case';

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
									checkedAt: sample.checkedAt,
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
