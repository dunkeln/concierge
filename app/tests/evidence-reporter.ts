import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as Sentry from '@sentry/sveltekit';
import { sentryDsn } from '../src/lib/sentry';
import type { TestStep } from '@playwright/test/reporter';
import type { Capture } from './e2e.eval';
import { randomUUID } from 'node:crypto';
import { redact } from './evidence';

export default class EvidenceReporter implements Reporter {
	private cases: Capture[] = [];
	constructor() {
		if (process.env.E2E_REPORT_SENTRY === '1')
			Sentry.init({
				dsn: process.env.SENTRY_DSN ?? sentryDsn,
				environment: 'e2e',
				defaultIntegrations: false
			});
	}
	onTestEnd(test: TestCase, result: TestResult) {
		const attachment = result.attachments.find((item) => item.name === 'e2e-case');
		if (!attachment && result.status === 'skipped') return;
		const capture: Capture = attachment
			? JSON.parse(attachment.body?.toString() ?? readFileSync(attachment.path!, 'utf8'))
			: {
					input: { request: test.title, observation: { text: '', calls: [] } },
					metadata: {
						runId: randomUUID(),
						mode: 'setup',
						status: result.status,
						expectedStatus: test.expectedStatus,
						traceIds: [],
						browserErrors: [],
						browserObserved: false,
						requests: [],
						responses: []
					}
				};
		const failedSteps = (steps: TestStep[]): string[] =>
			steps.flatMap((step) => [
				...(step.error && step.category === 'test.step' ? [step.title] : []),
				...failedSteps(step.steps)
			]);
		capture.metadata.failedSteps = failedSteps(result.steps);
		capture.metadata.durationMs = result.duration;
		capture.metadata.failureFamilies = [
			...(result.status !== test.expectedStatus
				? test.annotations
						.filter((item) => item.type === 'failureFamily')
						.flatMap((item) => (item.description ? [item.description] : []))
				: []),
			...(capture.metadata.responses.some(
				(response) => response.bodyError === 'Page replaced during chat response delivery.'
			)
				? ['execution.page_replaced_during_delivery']
				: []),
			...(result.status !== test.expectedStatus ? ['journey.incomplete'] : []),
			...(capture.metadata.browserErrors.length ? ['presentation.browser_exception'] : []),
			...(!capture.metadata.transportFault &&
			capture.metadata.requests.length &&
			(capture.metadata.responses.length !== capture.metadata.requests.length ||
				capture.metadata.responses.some(
					(response) =>
						response.status !== 200 ||
						!response.events.some((event) => event.type === 'finish') ||
						response.events.some((event) => event.type === 'error')
				))
				? ['execution.chat_transport_incomplete']
				: []),
			...(capture.metadata.mode === 'live' &&
			capture.input.observation.calls.some(
				(call) =>
					call.name === 'reservations.find' &&
					call.input?.date &&
					!/^\d{4}-\d{2}-\d{2}$/.test(String(call.input.date))
			)
				? ['schema.partial_date']
				: [])
		];
		if (result.status !== test.expectedStatus && process.env.E2E_REPORT_SENTRY === '1') {
			capture.metadata.sentryEventId = Sentry.captureException(
				new Error(`Playwright failed: ${test.title}`),
				{
					fingerprint: ['playwright', test.title],
					tags: {
						'e2e.run_id': capture.metadata.runId,
						'e2e.mode': capture.metadata.mode,
						'e2e.browser': capture.metadata.browserEngine ?? 'not_observed',
						'e2e.status': result.status
					},
					contexts: {
						e2e: {
							assertion: String(redact(result.errors[0]?.message ?? ''))
								.replace(/\x1b\[[0-9;]*m/g, '')
								.slice(0, 1000),
							traceIds: capture.metadata.traceIds,
							failedSteps: capture.metadata.failedSteps,
							failureFamilies: capture.metadata.failureFamilies,
							artifactDirectory: result.attachments.find((item) => item.path)?.path,
							durationMs: result.duration
						}
					}
				}
			);
		}
		this.cases.push(capture);
	}
	async onEnd() {
		if (!this.cases.length) return; // Listing tests must not erase the latest observed cohort.
		const delivered = process.env.E2E_REPORT_SENTRY === '1' ? await Sentry.flush(5000) : null;
		for (const capture of this.cases)
			if (capture.metadata.sentryEventId) capture.metadata.sentryFlushed = delivered;
		mkdirSync('tests/local/e2e-captures', { recursive: true });
		for (const capture of this.cases)
			writeFileSync(
				`tests/local/e2e-captures/${capture.metadata.runId}.json`,
				JSON.stringify(capture, null, 2)
			);
		writeFileSync('tests/local/e2e-cases.json', JSON.stringify(this.cases, null, 2));
	}
}
