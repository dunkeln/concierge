import { test as base, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import type { Page, Response, Request } from '@playwright/test';

// Chromium can leave response.text() pending when navigation discards an active SSE fetch.
export async function chatResponseBody(response: Response, page: Page): Promise<string> {
	let navigated!: (request: Request) => void;
	const replaced = new Promise<never>((_, reject) => {
		navigated = (request) => {
			if (request.isNavigationRequest() && request.frame() === page.mainFrame())
				reject(new Error('Page replaced during chat response delivery.'));
		};
		page.on('request', navigated);
	});
	try {
		return await Promise.race([response.text(), replaced]);
	} finally {
		page.off('request', navigated);
	}
}

// Traces contain authenticated traffic. Keep them local; export only the bounded case below.
export function redact(value: unknown): unknown {
	if (typeof value === 'string')
		return value
			.replace(/\b(?:cookie|set-cookie|authorization):[^\r\n]*/gi, '[credential header]')
			.replace(/data:image\/[^\s"']+/g, '[image]')
			.replace(/([?&](?:ticket|token|key|apiKey|api_key)=)[^\s&"')]+/gi, '$1[redacted]')
			.replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g, '[token]');
	if (Array.isArray(value)) return value.map(redact);
	if (value && typeof value === 'object')
		return Object.fromEntries(
			Object.entries(value)
				.filter(
					([key]) =>
						!/^(?:image|viewPath|cookie|authorization|password|secret|token|email|phone)$/i.test(
							key
						)
				)
				.map(([key, item]) => [key, redact(item)])
		);
	return value;
}

export const test = base.extend<{ evidence: string }>({
	evidence: [
		async ({ page }, use, info) => {
			const runId = randomUUID();
			await page.route('**/api/chat', (route) =>
				route.fallback({
					headers: { ...route.request().headers(), 'x-e2e-run-id': runId }
				})
			);
			const requests: unknown[] = [];
			const responses: {
				status: number;
				traceId?: string;
				bodyError?: string;
				events: Record<string, unknown>[];
			}[] = [];
			const browserErrors: string[] = [];
			const pending: Promise<void>[] = [];
			page.on('pageerror', (error) =>
				browserErrors.push(String(redact(error.stack ?? error.message)))
			);
			page.on('request', (request) => {
				if (new URL(request.url()).pathname === '/api/chat' && request.method() === 'POST')
					requests.push(redact(request.postDataJSON()));
			});
			page.on('response', (response) => {
				if (new URL(response.url()).pathname !== '/api/chat') return;
				const capture: (typeof responses)[number] = {
					status: response.status(),
					traceId: response.headers()['x-sentry-trace-id'],
					events: [] as Record<string, unknown>[]
				};
				responses.push(capture);
				pending.push(
					(async () => {
						try {
							const body = await chatResponseBody(response, page);
							for (const line of body.split('\n')) {
								if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
								const event = JSON.parse(line.slice(6));
								if (event.type !== 'data-browser')
									capture.events.push(redact(event) as Record<string, unknown>);
							}
						} catch (cause) {
							capture.bodyError = String(redact(cause instanceof Error ? cause.message : cause));
						}
					})()
				);
			});
			await use(runId);
			await Promise.race([
				Promise.allSettled(pending),
				new Promise((resolve) => setTimeout(resolve, 2000))
			]);
			const calls = responses.flatMap((response) =>
				response.events.flatMap((event) => {
					if (event.type !== 'tool-input-available') return [];
					const input = event.input as { name?: string; input?: Record<string, unknown> };
					return [{ tool: event.toolName, ...(event.toolName === 'execute' ? input : { input }) }];
				})
			);
			const text = responses
				.flatMap((response) =>
					response.events.filter((event) => event.type === 'text-delta').map((event) => event.delta)
				)
				.join('');
			const caseData = {
				input: { request: info.title, observation: { text, calls, providerOutcome: null } },
				expected: {},
				metadata: {
					source: info.file,
					capturedAt: new Date().toISOString(),
					runId,
					mode:
						info.annotations.find((item) => item.type === 'mode')?.description ??
						(info.title.startsWith('live ') ? 'live' : 'mocked'),
					status: info.status,
					expectedStatus: info.expectedStatus,
					traceIds: [
						...new Set(
							[
								...responses.map((response) => response.traceId),
								...info.annotations
									.filter((item) => item.type === 'trace')
									.map((item) => item.description)
							].filter(Boolean)
						)
					],
					fault: info.annotations.find((item) => item.type === 'fault')?.description,
					transportFault: info.annotations.find((item) => item.type === 'transportFault')
						?.description,
					requests,
					responses,
					browserErrors,
					browserObserved: !info.annotations.some(
						(item) => item.type === 'mode' && item.description === 'api'
					),
					browserEngine: page.context().browser()?.browserType().name() ?? null,
					failure: redact(info.errors.map((error) => error.message))
				}
			};
			await info.attach('e2e-case', {
				body: JSON.stringify(caseData, null, 2),
				contentType: 'application/json'
			});
		},
		{ auto: true }
	]
});
export { expect };
