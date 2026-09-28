import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, rmSync } from 'node:fs';
import { test, expect } from './evidence';

type Probe = {
	input: {
		request: string;
		observation: {
			status: number;
			events: {
				type: string;
				toolName?: string;
				input?: { name?: string; input?: Record<string, unknown> };
			}[];
		};
	};
	metadata: { id: string; traceId?: string; scores: Record<string, number | null> };
};

test('live tool choice follows advertised capabilities and user constraints', async ({
	baseURL,
	evidence
}) => {
	test.info().annotations.push({ type: 'failureFamily', description: 'planning.tool_selection' });
	test.skip(
		process.env.RUN_LIVE_JOURNEY !== '1',
		'Four reviewed live API probes; no judge or booking.'
	);
	test.setTimeout(900_000);
	rmSync('tests/local/tool-selection-observed.json', { force: true });
	let commandError: unknown;
	try {
		const result = await promisify(execFile)('node', ['tests/tool-selection.eval.ts'], {
			env: { ...process.env, RUN_TOOL_SELECTION_LIVE: '1', TOOL_SELECTION_BASE_URL: baseURL },
			timeout: 870_000
		});
		console.log(result.stdout);
	} catch (cause) {
		commandError = cause;
	}
	const cases: Probe[] = JSON.parse(
		readFileSync('tests/local/tool-selection-observed.json', 'utf8')
	);
	await test.info().attach('e2e-case', {
		contentType: 'application/json',
		body: JSON.stringify({
			input: {
				request: test.info().title,
				observation: {
					text: '',
					calls: cases.flatMap((item) =>
						item.input.observation.events
							.filter(
								(event) => event.type === 'tool-input-available' && event.toolName === 'execute'
							)
							.map((event) => event.input)
					)
				}
			},
			metadata: {
				runId: evidence,
				mode: 'live',
				status:
					cases.every((item) =>
						Object.values(item.metadata.scores ?? {}).every((score) => score !== 0)
					) && !commandError
						? 'passed'
						: 'failed',
				expectedStatus: 'passed',
				browserErrors: [],
				browserObserved: false,
				traceIds: cases.flatMap((item) => (item.metadata.traceId ? [item.metadata.traceId] : [])),
				requests: cases.map((item) => ({
					messages: [{ role: 'user', parts: [{ text: item.input.request }] }]
				})),
				responses: cases.map((item) => item.input.observation)
			}
		})
	});
	expect(cases).toHaveLength(4);
	for (const item of cases)
		await test.step(item.metadata.id, async () => {
			expect(
				Object.keys(item.metadata.scores),
				'Captured structural scores must exist'
			).not.toHaveLength(0);
			for (const [name, score] of Object.entries(item.metadata.scores))
				expect(score, name).not.toBe(0);
		});
	expect(commandError).toBeUndefined();
});
