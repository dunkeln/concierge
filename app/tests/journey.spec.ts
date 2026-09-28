import { readFileSync } from 'node:fs';
import { test, expect, chatResponseBody } from './evidence';

test('live cuisine reservation journey', async ({ page, baseURL }) => {
	test.skip(
		process.env.RUN_LIVE_JOURNEY !== '1',
		'Use bun run test:e2e:live; live model/provider calls cost money.'
	);
	test.setTimeout(300_000);
	const journey: { request: string; date: string; partySize: number } = JSON.parse(
		readFileSync(process.env.E2E_CASE ?? 'tests/local/journey.json', 'utf8')
	);
	expect(journey.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	expect(journey.partySize).toBeGreaterThan(0);
	const turns: {
		type: string;
		input?: { name?: string; input?: { restaurant?: string; date?: string; partySize?: number } };
	}[][] = [];
	let chatRequests = 0;
	page.on('request', (request) => {
		if (new URL(request.url()).pathname === '/api/chat' && request.method() === 'POST')
			chatRequests++;
	});
	const completeTurn = async (action: () => Promise<void>) => {
		const pending = page.waitForResponse(
			(response) =>
				new URL(response.url()).pathname === '/api/chat' && response.request().method() === 'POST',
			{ timeout: 120_000 }
		);
		await action();
		const response = await pending;
		expect(response.status()).toBe(200);
		const body = await chatResponseBody(response, page);
		const events = body
			.split('\n')
			.filter((line) => line.startsWith('data: ') && line !== 'data: [DONE]')
			.map((line) => JSON.parse(line.slice(6)));
		turns.push(events);
		expect(events.some((event) => event.type === 'finish')).toBe(true);
		expect(events.some((event) => event.type === 'error')).toBe(false);
		await expect(page.getByRole('alert')).toHaveCount(0);
	};
	const send = async (text: string) =>
		completeTurn(async () => {
			const composer = page.getByLabel('Your reservation request');
			await composer.fill(text);
			await expect(composer).toHaveValue(text);
			await page.getByRole('button', { name: 'Send message' }).click();
		});
	await test.step('Load authenticated home and submit the request', async () => {
		await page.goto('/');
		expect(new URL(page.url()).origin).toBe(baseURL);
		await expect(page.getByLabel('Your reservation request')).toBeEditable();
		await send(journey.request);
	});
	await test.step('Choose a month and receive a day picker', async () => {
		const targetYear = Number(journey.date.slice(0, 4));
		const grid = page.getByLabel('Choose month', { exact: true });
		await expect(grid).toBeVisible();
		const year = Number((await grid.locator('..').locator('strong').innerText()).trim());
		for (let step = 0; step < Math.abs(targetYear - year); step++)
			await page
				.getByRole('button', {
					name: targetYear > year ? 'Next year' : 'Previous year',
					exact: true
				})
				.click();
		const monthLabel = new Intl.DateTimeFormat('en-US', {
			month: 'long',
			year: 'numeric',
			timeZone: 'UTC'
		}).format(new Date(`${journey.date}T12:00:00Z`));
		await completeTurn(() => page.getByRole('button', { name: monthLabel, exact: true }).click());
		const label = new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeZone: 'UTC' }).format(
			new Date(`${journey.date}T12:00:00Z`)
		);
		await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
	});
	await test.step('Choose a day and supply guests', async () => {
		const label = new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeZone: 'UTC' }).format(
			new Date(`${journey.date}T12:00:00Z`)
		);
		await completeTurn(() => page.getByRole('button', { name: label, exact: true }).click());
		await send(String(journey.partySize));
	});
	await test.step('Check a named venue with the chosen day and guests', async () => {
		expect(chatRequests, 'One request per committed reply').toBe(4);
		await expect(page.getByRole('region', { name: 'Places found' })).toHaveCount(1);
		const calls = turns
			.flat()
			.filter(
				(event) =>
					event.type === 'tool-input-available' && event.input?.name === 'reservations.find'
			)
			.flatMap((event) => (event.input?.input ? [event.input.input] : []));
		expect(
			calls.some(
				(input) =>
					input.restaurant && input.date === journey.date && input.partySize === journey.partySize
			)
		).toBe(true);
		expect(
			calls.filter((input) => input.date).every((input) => /^\d{4}-\d{2}-\d{2}$/.test(input.date!))
		).toBe(true);
		// Inventory can be unavailable. This checks follow-through, never requires or submits a booking.
	});
	await test.step('Restore the completed turn after refresh', async () => {
		await page.reload();
		await expect(page.getByRole('alert')).toHaveCount(0);
		await expect(page.getByRole('status')).toHaveCount(0);
		const composer = page.getByLabel('Your reservation request');
		await composer.fill('Thanks');
		await expect(page.getByRole('button', { name: 'Send message' })).toBeEnabled();
		expect(chatRequests).toBe(4);
	});
});

test('live pending turn survives page reload during delivery', async ({ page, baseURL }) => {
	test.skip(process.env.RUN_LIVE_JOURNEY !== '1', 'Opt-in live lifecycle check.');
	test.setTimeout(60_000);
	test.info().annotations.push({ type: 'fault', description: 'page_reload_during_delivery' });
	let calls = 0;
	page.on('request', (request) => {
		if (new URL(request.url()).pathname === '/api/chat' && request.method() === 'POST') calls++;
	});
	await page.goto('/');
	expect(new URL(page.url()).origin).toBe(baseURL);
	const prompt = 'Reply with the single word marigold. Do not use tools.';
	await page.getByLabel('Your reservation request').fill(prompt);
	const pending = page.waitForResponse(
		(response) => new URL(response.url()).pathname === '/api/chat'
	);
	await page.getByRole('button', { name: 'Send message' }).click();
	const response = await pending;
	expect(response.status()).toBe(200);
	const interrupted = chatResponseBody(response, page).catch((cause: Error) => cause.message);
	await page.reload();
	expect(await interrupted).toBe('Page replaced during chat response delivery.');
	await expect(page.locator('main')).toContainText(prompt);
	await expect(page.locator('main .prose')).toHaveText(/^\s*marigold[.!]?\s*$/i, {
		timeout: 45_000
	});
	await expect(page.getByRole('status')).toHaveCount(0);
	await expect(page.getByRole('alert')).toHaveCount(0);
	await page.getByLabel('Your reservation request').fill('Thanks');
	await expect(page.getByRole('button', { name: 'Send message' })).toBeEnabled();
	expect(calls, 'Reload recovery must not repeat generation').toBe(1);
});

for (const fault of ['response_lost_after_commit', 'response_interrupted_after_commit']) {
	test(`live completed turn survives ${fault}`, async ({ page, baseURL, evidence }) => {
		test.skip(process.env.RUN_LIVE_JOURNEY !== '1', 'Opt-in live lifecycle check.');
		test.setTimeout(60_000);
		test.info().annotations.push({ type: 'fault', description: fault });
		let calls = 0;
		let savedText = '';
		await page.route('**/api/chat', async (route) => {
			calls++;
			const response = await route.fetch({
				timeout: 45_000,
				headers: { ...route.request().headers(), 'x-e2e-run-id': evidence }
			});
			const traceId = response.headers()['x-sentry-trace-id'];
			if (traceId) test.info().annotations.push({ type: 'trace', description: traceId });
			expect(response.status()).toBe(200);
			const body = await response.text();
			const events = body
				.split('\n')
				.filter((line) => line.startsWith('data: {'))
				.map((line) => JSON.parse(line.slice(6)));
			expect(events.some((event) => event.type === 'finish')).toBe(true);
			savedText = events
				.filter((event) => event.type === 'text-delta')
				.map((event) => event.delta)
				.join('');
			expect(savedText.trim()).not.toBe('');
			// The upstream response and durable save completed; the browser receives neither headers nor body.
			if (fault === 'response_lost_after_commit') await route.abort('failed');
			else {
				// Keep the committed assistant ID but interrupt its content. Equal IDs do not prove equal state.
				const chunks = [
					events.find((event) => event.type === 'start'),
					{ type: 'text-start', id: 'partial' },
					{ type: 'text-delta', id: 'partial', delta: 'Unfinished' },
					{ type: 'text-end', id: 'partial' },
					{ type: 'error', errorText: 'The assistant stopped before finishing. Please retry.' }
				];
				await route.fulfill({
					status: 200,
					headers: response.headers(),
					body: chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('')
				});
			}
		});
		await page.goto('/');
		expect(new URL(page.url()).origin).toBe(baseURL);
		await page
			.getByLabel('Your reservation request')
			.fill('Reply with the single word marigold. Do not use tools.');
		await page.getByRole('button', { name: 'Send message' }).click();
		await expect.poll(() => savedText, { timeout: 45_000 }).not.toBe('');
		await expect(page.locator('main')).toContainText(savedText.trim(), { timeout: 15_000 });
		await expect(page.getByRole('alert')).toHaveCount(0);
		await page.reload();
		await expect(page.locator('main')).toContainText(savedText.trim());
		const id = new URL(page.url()).searchParams.get('chat');
		const invalid = await page.request.get(`/api/chats/${id}?before=${Number.MAX_SAFE_INTEGER}`);
		expect(invalid.status()).toBe(400);
		await page.getByLabel('Your reservation request').fill('Thanks');
		await expect(page.getByRole('button', { name: 'Send message' })).toBeEnabled();
		expect(calls, 'Recovery must not repeat generation').toBe(1);
	});
}
