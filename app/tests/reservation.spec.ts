import { expect, test } from '@playwright/test';
import { createUIMessageStream, createUIMessageStreamResponse } from 'ai';
import { reservationCase as sample } from './reservation-case';

test('shows verified times and sends the selected slot as intent', async ({ page }) => {
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
					writer.write({ type: 'text-start', id: `answer-${calls}` });
					writer.write({
						type: 'text-delta',
						id: `answer-${calls}`,
						delta:
							calls === 1 ? 'These times were visible; no booking was made.' : 'Selection received.'
					});
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
	await expect(page.getByLabel('Your reservation request')).toBeVisible();
	await page.getByLabel('Your reservation request').fill('Find a table for two at Ai Fiori.');
	await page.getByRole('button', { name: 'Send message' }).click();
	const calendar = page.getByRole('region', { name: 'Reservation calendar' });
	await expect(calendar.getByRole('button', { name: sample.times[0] })).toBeVisible();
	await expect(calendar.getByRole('button', { name: sample.times[1] })).toBeVisible();
	await calendar.getByRole('button', { name: sample.times[0] }).click();
	await expect(calendar.getByRole('button', { name: sample.times[0] })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await page.getByLabel('Your reservation request').fill('I picked that time. What happens next?');
	await page.getByRole('button', { name: 'Send message' }).click();
	await expect(page.getByText('Selection received.')).toBeVisible();
	expect(calls).toBe(2);
});
