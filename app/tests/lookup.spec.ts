import { chatResponseBody, expect, test } from './evidence';

test('live named restaurant lookup reads web sources without booking filters', async ({ page }) => {
	test.skip(
		process.env.RUN_LIVE_JOURNEY !== '1',
		'One real named lookup; no reservation inspection or booking.'
	);
	test.setTimeout(180_000);
	test
		.info()
		.annotations.push({ type: 'failureFamily', description: 'retrieval.named_venue_lookup' });
	await page.goto('/');
	await page
		.getByLabel('Your reservation request')
		.fill(
			'What do you think of Izakaya Mai in San Mateo, California? Look it up on the web and read its menu or restaurant details. I want information, not a reservation check.'
		);
	const response = page.waitForResponse((response) => response.url().endsWith('/api/chat'));
	await page.getByRole('button', { name: 'Send message' }).click();
	const body = await chatResponseBody(await response, page);
	const events = body
		.split('\n')
		.filter((line) => line.startsWith('data: {'))
		.map((line) => JSON.parse(line.slice(6)));
	expect(events.some((event) => event.type === 'finish')).toBe(true);
	expect(events.some((event) => event.type === 'error')).toBe(false);
	const calls = events.filter(
		(event) => event.type === 'tool-input-available' && event.toolName === 'execute'
	);
	expect(calls.some((event) => event.input.name === 'reservations.find')).toBe(false);
	const lookup = calls.find((event) => event.input.name === 'places.lookup');
	expect(lookup).toBeTruthy();
	expect(lookup.input.input.restaurant).toMatch(/Izakaya Mai/i);
	expect(lookup.input.input.date).toBeUndefined();
	expect(lookup.input.input.partySize).toBeUndefined();
	const result = events.find(
		(event) => event.type === 'tool-output-available' && event.toolCallId === lookup.toolCallId
	)?.output;
	expect(result?.error).toBeUndefined();
	expect(result.pages.length).toBeGreaterThan(0);
	expect(
		result.readings.some(
			(reading: { content?: string }) => reading.content && /mai|sushi|menu/i.test(reading.content)
		)
	).toBe(true);
	await expect(page.locator('.prose').last()).toContainText(/Mai|sushi|menu/i);
});
