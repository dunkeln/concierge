import { readFileSync } from 'node:fs';
import { Eval } from 'braintrust';

export type Capture = {
	input: {
		request: string;
		observation: { text: string; calls: { name?: string; input?: Record<string, unknown> }[] };
	};
	metadata: {
		status: string;
		expectedStatus: string;
		mode: string;
		fault?: string;
		transportFault?: string;
		runId: string;
		traceIds: string[];
		sentryEventId?: string;
		browserErrors: string[];
		browserObserved?: boolean;
		browserEngine?: string | null;
		durationMs?: number;
		failureFamilies?: string[];
		failedSteps?: string[];
		sentryFlushed?: boolean | null;
		requests: unknown[];
		responses: { status: number; bodyError?: string; events: { type: string }[] }[];
	};
};
const captures: Capture[] = JSON.parse(
	readFileSync(process.env.E2E_EVAL_CASES ?? new URL('./local/e2e-cases.json', import.meta.url), 'utf8')
);
if (!captures.length) throw new Error('Run Playwright first; no E2E captures to score.');
Eval('Concierge', {
	experimentName: `observed-browser-journeys-${new Date().toISOString().replace(/[:.]/g, '-')}`,
	data: captures.map(({ input, metadata }) => ({
		input: {
			...input,
			request:
				metadata.requests
					.flatMap((request) => {
						const messages = (
							request as { messages?: { role?: string; parts?: { text?: string }[] }[] }
						).messages;
						return (
							messages
								?.filter((message) => message.role === 'user')
								.at(-1)
								?.parts?.flatMap((part) => (part.text ? [part.text] : [])) ?? []
						);
					})
					.join('\n') || input.request,
			browser: {
				status: metadata.status,
				expectedStatus: metadata.expectedStatus,
				mode: metadata.mode,
				browserObserved: metadata.browserObserved !== false,
				fault: metadata.fault ?? null,
				transportFault: metadata.transportFault ?? null,
				requestCount: metadata.requests.length,
				browserErrorCount:
					metadata.browserObserved === false ? null : metadata.browserErrors.length,
				responses: metadata.responses.map((response) => ({
					status: response.status,
					events: response.events.map(({ type }) => ({ type }))
				}))
			}
		},
		// Only identifiers go to metadata. Raw responses and requests stay in local artifacts.
		metadata: {
			testName: input.request,
			runId: metadata.runId,
			mode: metadata.mode,
			browserEngine: metadata.browserEngine ?? null,
			fault: metadata.fault ?? null,
			transportFault: metadata.transportFault ?? null,
			traceIds: metadata.traceIds,
			traceUrls: metadata.traceIds.map(
				(id) => `https://concierge-vn.sentry.io/explore/traces/trace/${id}`
			),
			sentryEventId: metadata.sentryEventId ?? null,
			failedSteps: metadata.failedSteps ?? [],
			failureFamilies: metadata.failureFamilies ?? [],
			durationMs: metadata.durationMs ?? null
		}
	})),
	task: ({ observation, browser }) => ({ observation, browser }),
	scores: [
		function testContractCompleted({ output }) {
			return output.browser.status === 'skipped'
				? null
				: Number(output.browser.status === output.browser.expectedStatus);
		},
		function browserJourneyCompleted({ output }) {
			return output.browser.status === 'skipped' || !output.browser.browserObserved
				? null
				: Number(output.browser.status === output.browser.expectedStatus);
		},
		function chatTransportCompleted({ output }) {
			if (output.browser.fault || output.browser.transportFault) return null; // Injected faults have their own assertions.
			const { requestCount, responses } = output.browser;
			if (!requestCount) return null;
			return Number(
				responses.length === requestCount &&
					responses.every(
						(response) =>
							response.status === 200 &&
							response.events.some((event) => event.type === 'finish') &&
							!response.events.some((event) => event.type === 'error')
					)
			);
		},
		function durableResponseRecovered({ output }) {
			return output.browser.fault
				? Number(output.browser.status === output.browser.expectedStatus)
				: null;
		},
		function noBrowserException({ output }) {
			return output.browser.status === 'skipped' || output.browser.browserErrorCount === null
				? null
				: Number(!output.browser.browserErrorCount);
		},
		function completeReservationDate({ output }) {
			if (output.browser.mode !== 'live') return null;
			const calls = output.observation.calls.filter(
				(call) => call.name === 'reservations.find' && call.input?.date
			);
			if (calls.some((call) => !/^\d{4}-\d{2}-\d{2}$/.test(String(call.input?.date)))) return 0;
			if (
				output.browser.responses.some(
					(response) => !response.events.some((event) => event.type === 'finish')
				)
			)
				return null;
			return calls.length ? 1 : null;
		}
	]
});
