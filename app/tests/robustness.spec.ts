import { createUIMessageStream, createUIMessageStreamResponse } from 'ai';
import { expect, test } from './evidence';
import type { Route } from '@playwright/test';

async function answer(route: Route, text: string) {
	const response = createUIMessageStreamResponse({
		stream: createUIMessageStream({
			execute: ({ writer }) => {
				writer.write({ type: 'start' });
				writer.write({ type: 'text-start', id: 'answer' });
				writer.write({ type: 'text-delta', id: 'answer', delta: text });
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
}

test('composer ignores blank and IME Enter while Shift Enter preserves a newline', async ({
	page
}) => {
	const requests: { messages: { parts: { text: string }[] }[] }[] = [];
	await page.route('**/api/chat', async (route) => {
		requests.push(route.request().postDataJSON());
		await answer(route, 'Keyboard reply received.');
	});
	await page.goto('/');
	const composer = page.getByLabel('Your reservation request');
	const send = page.getByRole('button', { name: 'Send message' });
	await composer.fill('   ');
	await expect(send).toBeDisabled();
	await composer.press('Enter');
	await composer.fill('Dinner');
	await expect(send).toBeEnabled();
	await composer.dispatchEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true });
	await expect(composer).toHaveValue('Dinner');
	await composer.press('Shift+Enter');
	await composer.press('End');
	await composer.pressSequentially('for two');
	await expect(composer).toHaveValue('Dinner\nfor two');
	expect(requests).toHaveLength(0);
	await composer.press('Enter');
	await expect(page.getByText('Keyboard reply received.', { exact: true })).toBeVisible();
	expect(requests).toHaveLength(1);
	expect(requests[0].messages.at(-1)?.parts[0].text).toBe('Dinner\nfor two');
	await expect(composer).toHaveValue('');
});

test('pending response blocks duplicate submits and New chat without discarding the next draft', async ({
	page
}) => {
	let calls = 0;
	let release!: () => void;
	const pending = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route('**/api/chat', async (route) => {
		calls++;
		if (calls === 1) await pending;
		await answer(route, `Controlled answer ${calls}.`);
	});
	await page.goto('/');
	const composer = page.getByLabel('Your reservation request');
	await composer.fill('First request');
	await expect(page.getByRole('button', { name: 'Send message' })).toBeEnabled();
	await composer.evaluate((node: HTMLTextAreaElement) => {
		node.form!.requestSubmit();
		node.form!.requestSubmit();
	});
	await expect.poll(() => calls).toBe(1);
	await expect(page.getByRole('button', { name: 'New chat', exact: true })).toBeDisabled();
	await composer.fill('Next draft');
	await expect(page.getByRole('button', { name: 'Send message' })).toBeDisabled();
	await composer.press('Enter');
	expect(calls).toBe(1);
	release();
	await expect(page.getByText('Controlled answer 1.', { exact: true })).toBeVisible();
	await expect(composer).toHaveValue('Next draft');
	await expect(page.getByRole('button', { name: 'Send message' })).toBeEnabled();
	await composer.press('Enter');
	await expect(page.getByText('Controlled answer 2.', { exact: true })).toBeVisible();
	expect(calls).toBe(2);
	await expect(page.getByText('First request', { exact: true })).toHaveCount(1);
	await expect(page.getByText('Next draft', { exact: true })).toHaveCount(1);
	await page.getByRole('button', { name: 'New chat', exact: true }).click();
	await expect(page.getByText('Controlled answer 1.', { exact: true })).toHaveCount(0);
	await expect(composer).toHaveValue('');
	await expect(page).toHaveURL((url) => !url.searchParams.has('chat'));
});

for (const [status, message, retry] of [
	[401, 'Your session expired. Sign in again.', false],
	[409, 'This chat is still responding in another tab. Try again shortly.', true],
	[503, 'Chat service is unavailable. Try again later.', true]
] as const) {
	test(`HTTP ${status} exposes the appropriate recovery action and preserves the user request`, async ({
		page
	}) => {
		test
			.info()
			.annotations.push({ type: 'transportFault', description: `expected_http_${status}` });
		const requests: { messages: { id: string; parts: { text: string }[] }[] }[] = [];
		await page.route('**/api/chat', async (route) => {
			requests.push(route.request().postDataJSON());
			if (requests.length === 1) await route.fulfill({ status, body: 'Rejected' });
			else await answer(route, 'Retry completed.');
		});
		await page.goto('/');
		await page.getByLabel('Your reservation request').fill('Keep this request');
		await page.getByRole('button', { name: 'Send message' }).click();
		await expect(page.getByRole('alert')).toContainText(message);
		await expect(page.getByText('Keep this request', { exact: true })).toHaveCount(1);
		expect(requests).toHaveLength(1);
		if (retry) {
			await page.getByRole('button', { name: 'Retry', exact: true }).click();
			await expect(page.getByText('Retry completed.', { exact: true })).toBeVisible();
			await expect(page.getByRole('alert')).toHaveCount(0);
			await expect(page.getByText('Keep this request', { exact: true })).toHaveCount(1);
			expect(requests).toHaveLength(2);
			expect(requests[1].messages.at(-1)?.id).toBe(requests[0].messages.at(-1)?.id);
			await page.getByLabel('Your reservation request').fill('Another request');
			await expect(page.getByRole('button', { name: 'Send message' })).toBeEnabled();
		} else {
			await expect(page.getByRole('button', { name: 'Retry', exact: true })).toHaveCount(0);
			await expect(
				page.getByRole('alert').getByRole('link', { name: 'Sign in', exact: true })
			).toHaveAttribute('href', '/login');
		}
	});
}

test('mobile followup choices are stacked, submit once, and disappear after the reply', async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	let calls = 0;
	let release!: () => void;
	const pending = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route('**/api/chat', async (route) => {
		calls++;
		if (calls > 1) {
			expect(route.request().postDataJSON().messages.at(-1).parts[0].text).toBe('4 guests');
			await pending;
			await answer(route, 'Four guests received.');
			return;
		}
		const response = createUIMessageStreamResponse({
			stream: createUIMessageStream({
				execute: ({ writer }) => {
					writer.write({ type: 'start' });
					writer.write({
						type: 'tool-input-available',
						toolCallId: 'guests',
						toolName: 'execute',
						input: { name: 'followup', input: {} }
					});
					writer.write({
						type: 'tool-output-available',
						toolCallId: 'guests',
						output: {
							kind: 'followup',
							responseType: 'partySize',
							question: 'How many guests?',
							options: ['2 guests', '4 guests']
						}
					});
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
	await page.getByLabel('Your reservation request').fill('Dinner for friends');
	await page.getByRole('button', { name: 'Send message' }).click();
	const followup = page.getByRole('region', { name: 'Follow-up response' });
	await expect(followup).toHaveCount(1);
	const two = followup.getByRole('button', { name: '2 guests' });
	const four = followup.getByRole('button', { name: '4 guests' });
	const [first, second, region] = await Promise.all([
		two.boundingBox(),
		four.boundingBox(),
		followup.boundingBox()
	]);
	expect(second!.y).toBeGreaterThanOrEqual(first!.y + first!.height);
	expect(Math.abs(second!.x + second!.width - region!.x - region!.width)).toBeLessThan(2);
	await four.evaluate((button: HTMLButtonElement) => {
		button.click();
		button.click();
	});
	await expect.poll(() => calls).toBe(2);
	await expect(followup).toHaveCount(0);
	release();
	await expect(page.getByText('Four guests received.', { exact: true })).toBeVisible();
	await expect(page.getByText('4 guests', { exact: true })).toHaveCount(1);
	await expect(page.getByLabel('Your reservation request')).toHaveAttribute(
		'placeholder',
		'What are you planning?'
	);
	expect(calls).toBe(2);
});

test('invalid browser events cannot open a preview or inject an external view link', async ({
	page
}) => {
	await page.route('**/api/chat', async (route) => {
		const response = createUIMessageStreamResponse({
			stream: createUIMessageStream({
				execute: ({ writer }) => {
					writer.write({ type: 'start' });
					for (const data of [
						{ id: 'external', open: true, venue: 'External', viewPath: 'https://example.com/' },
						{ id: 'script', open: true, venue: 'Script', viewPath: 'javascript:alert(1)' },
						{ id: 'orphan', image: 'data:image/jpeg;base64,AAAA' },
						{ id: 'missing', open: true, viewPath: '/api/reservations/view?ticket=fixture' }
					])
						writer.write({ type: 'data-browser', data, transient: true });
					writer.write({ type: 'text-start', id: 'answer' });
					writer.write({ type: 'text-delta', id: 'answer', delta: 'Invalid events ignored.' });
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
	await page.getByLabel('Your reservation request').fill('Inspect fixture');
	await page.getByRole('button', { name: 'Send message' }).click();
	await expect(page.getByText('Invalid events ignored.', { exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Open live reservation browser' })).toHaveCount(0);
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await expect(page.locator('main a[href^="javascript:"]')).toHaveCount(0);
});

test('live committed answer replaces same-ID partial text after clean EOF', async ({
	page,
	baseURL,
	evidence
}) => {
	test
		.info()
		.annotations.push({
			type: 'failureFamily',
			description: 'execution.saved_response_reconciliation'
		});
	test.skip(process.env.RUN_LIVE_JOURNEY !== '1', 'Opt-in one no-tools model call.');
	test.setTimeout(60_000);
	test.info().annotations.push({ type: 'fault', description: 'clean_eof_after_commit' });
	let calls = 0;
	let savedText = '';
	await page.route('**/api/chat', async (route) => {
		calls++;
		const response = await route.fetch({
			timeout: 45_000,
			headers: { ...route.request().headers(), 'x-e2e-run-id': evidence }
		});
		expect(response.status()).toBe(200);
		const traceId = response.headers()['x-sentry-trace-id'];
		if (traceId) test.info().annotations.push({ type: 'trace', description: traceId });
		const events = (await response.text())
			.split('\n')
			.filter((line) => line.startsWith('data: {'))
			.map((line) => JSON.parse(line.slice(6)));
		expect(events.some((event) => event.type === 'finish')).toBe(true);
		const start = events.find((event) => event.type === 'start');
		expect(start.messageId).toBeTruthy();
		savedText = events
			.filter((event) => event.type === 'text-delta')
			.map((event) => event.delta)
			.join('')
			.trim();
		expect(savedText).not.toBe('');
		// Real storage has committed the full answer; a proxy closes delivery cleanly with the same assistant ID.
		await route.fulfill({
			status: 200,
			headers: response.headers(),
			body: [
				start,
				{ type: 'text-start', id: 'partial' },
				{ type: 'text-delta', id: 'partial', delta: 'Unfinished' },
				{ type: 'text-end', id: 'partial' }
			]
				.map((event) => `data: ${JSON.stringify(event)}\n\n`)
				.join('')
		});
	});
	await page.goto('/');
	expect(new URL(page.url()).origin).toBe(baseURL);
	await page
		.getByLabel('Your reservation request')
		.fill('Reply with the single word marigold. Do not use tools.');
	await page.getByRole('button', { name: 'Send message' }).click();
	await expect.poll(() => savedText, { timeout: 45_000 }).not.toBe('');
	await expect(page.locator('main .prose')).toHaveText(savedText, { timeout: 10_000 });
	await expect(page.getByRole('alert')).toHaveCount(0);
	await expect(page.getByRole('status')).toHaveCount(0);
	await page.getByLabel('Your reservation request').fill('Thanks');
	await expect(page.getByRole('button', { name: 'Send message' })).toBeEnabled();
	expect(calls, 'Saved-answer recovery must not repeat generation').toBe(1);
});

test('preview external view remains reachable from dialog keyboard focus', async ({ page }) => {
	test
		.info()
		.annotations.push({
			type: 'failureFamily',
			description: 'presentation.preview_keyboard_navigation'
		});
	await page.route('**/api/chat', async (route) => {
		const response = createUIMessageStreamResponse({
			stream: createUIMessageStream({
				execute: ({ writer }) => {
					writer.write({ type: 'start' });
					writer.write({
						type: 'data-browser',
						data: {
							id: 'keyboard-preview',
							open: true,
							venue: 'Fixture',
							viewPath: '/api/reservations/view?ticket=fixture'
						},
						transient: true
					});
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
	await page.getByLabel('Your reservation request').fill('Inspect keyboard fixture');
	await page.getByRole('button', { name: 'Send message' }).click();
	const trigger = page.getByRole('button', { name: 'Open live reservation browser' });
	await trigger.click();
	const dialog = page.getByRole('dialog', { name: 'Live reservation browser' });
	const close = dialog.getByRole('button', { name: 'Close live reservation browser' }).last();
	const external = dialog.getByRole('link', { name: 'Open in a tab' });
	await expect(close).toBeFocused();
	await page.keyboard.press('Shift+Tab');
	await expect(external).toBeFocused();
	await page.keyboard.press('Tab');
	await expect(close).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(dialog).toHaveCount(0);
	await expect(trigger).toBeFocused();
});
