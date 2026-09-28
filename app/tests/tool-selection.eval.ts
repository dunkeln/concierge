import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { request } from '@playwright/test';
import { Eval } from 'braintrust';
import { redact } from './evidence.ts';

type Event = {
	type: string;
	toolCallId?: string;
	toolName?: string;
	input?: { name?: string; input?: Record<string, unknown> };
	output?: Record<string, unknown>;
};
type Observation = { status: number; events: Event[]; error?: string };
type Expected = {
	noTools?: boolean;
	required?: string[];
	forbidden?: string[];
	arguments?: Record<string, Record<string, unknown>>;
	followup?: { responseType: string; calendarView?: string };
	checkoutAuthorized?: boolean;
};
type Case = {
	input: { request: string; observation: Observation };
	expected: Expected;
	metadata: {
		id: string;
		mode: 'calibration' | 'observed' | 'live';
		live?: boolean;
		[key: string]: unknown;
	};
	calibrationScores?: Record<string, number | null>;
};

const calls = (output: Observation) =>
	output.events.filter((event) => event.type === 'tool-input-available');
const executions = (output: Observation) =>
	calls(output).filter((call) => call.toolName === 'execute');
const resultOf = (output: Observation, call: Event) =>
	output.events.find(
		(event) => event.type === 'tool-output-available' && event.toolCallId === call.toolCallId
	)?.output;
const successful = (result?: Record<string, unknown>) => result && !result.error;
const sameArgument = (key: string, actual: unknown, expected: unknown) =>
	['restaurant', 'area', 'cuisine'].includes(key) &&
	typeof actual === 'string' &&
	typeof expected === 'string'
		? actual.trim().toLowerCase() === expected.trim().toLowerCase()
		: actual === expected;
const complete = (output: Observation) =>
	output.status === 200 &&
	output.events.some((event) => event.type === 'finish') &&
	!output.events.some((event) => event.type === 'error');

// These scores grade emitted calls and their paired results. Assistant prose cannot prove execution.
export const scores = {
	transportCompleted: ({ output }: { output: Observation; expected: Expected }) =>
		Number(complete(output)),
	advertisedBeforeExecution: ({ output }: { output: Observation; expected: Expected }) => {
		if (!executions(output).length) return null;
		const advertised = new Set<string>();
		for (const event of output.events) {
			if (event.type === 'tool-output-available') {
				const call = calls(output).find((call) => call.toolCallId === event.toolCallId);
				if (call?.toolName === 'search' && Array.isArray(event.output?.capabilities))
					for (const capability of event.output.capabilities)
						if (typeof capability?.name === 'string') advertised.add(capability.name);
			}
			if (
				event.type === 'tool-input-available' &&
				event.toolName === 'execute' &&
				!advertised.has(event.input?.name ?? '')
			)
				return 0;
		}
		return 1;
	},
	requestedToolChoice: ({ output, expected }: { output: Observation; expected: Expected }) => {
		const attempted = calls(output);
		if (expected.noTools) return Number(attempted.length === 0 && complete(output));
		const invoked = executions(output);
		if (expected.forbidden?.some((name) => invoked.some((call) => call.input?.name === name)))
			return 0;
		if (!expected.required?.length) return expected.forbidden ? Number(complete(output)) : null;
		return Number(
			expected.required.every((name) =>
				invoked.some((call) => call.input?.name === name && successful(resultOf(output, call)))
			)
		);
	},
	argumentsRetained: ({ output, expected }: { output: Observation; expected: Expected }) => {
		if (!expected.arguments) return null;
		return Number(
			Object.entries(expected.arguments).every(([name, arguments_]) => {
				const matched = executions(output).filter((call) => call.input?.name === name);
				return (
					matched.length > 0 &&
					matched.every((call) =>
						Object.entries(arguments_).every(([key, value]) =>
							sameArgument(key, call.input?.input?.[key], value)
						)
					)
				);
			})
		);
	},
	followupContract: ({ output, expected }: { output: Observation; expected: Expected }) => {
		if (!expected.followup) return null;
		return Number(
			executions(output).some((call) => {
				const result = resultOf(output, call);
				return (
					call.input?.name === 'followup' &&
					result?.kind === 'followup' &&
					Object.entries(expected.followup!).every(([key, value]) => result[key] === value)
				);
			})
		);
	},
	completeBookingDates: ({ output }: { output: Observation; expected: Expected }) => {
		const dates = executions(output).filter(
			(call) => call.input?.name === 'reservations.find' && call.input?.input?.date !== undefined
		);
		if (!dates.length) return null;
		return Number(
			dates.every((call) => {
				const value = String(call.input?.input?.date);
				const timestamp = Date.parse(`${value}T00:00:00Z`);
				return (
					/^\d{4}-\d{2}-\d{2}$/.test(value) &&
					Number.isFinite(timestamp) &&
					new Date(timestamp).toISOString().slice(0, 10) === value
				);
			})
		);
	},
	checkoutRequiresSelection: ({ output, expected }: { output: Observation; expected: Expected }) =>
		Number(
			expected.checkoutAuthorized === true ||
				!executions(output).some((call) => call.input?.name === 'reservations.prepare')
		),
	terminalFollowup: ({ output }: { output: Observation; expected: Expected }) => {
		const end = output.events.findIndex(
			(event) => event.type === 'tool-output-available' && event.output?.kind === 'followup'
		);
		return end < 0
			? null
			: Number(
					!output.events
						.slice(end + 1)
						.some((event) => event.type === 'tool-input-available' && event.toolName === 'execute')
				);
	}
};

const datasetPath = new URL('./local/tool-selection-cases.json', import.meta.url);
const cases: Case[] = JSON.parse(readFileSync(datasetPath, 'utf8'));

// Calibration is a labeled measurement check, never an observed app reliability percentage.
if (process.env.TOOL_SELECTION_CALIBRATE === '1') {
	let labels = 0;
	for (const example of cases.filter((example) => example.metadata.mode === 'calibration')) {
		for (const [name, value] of Object.entries(example.calibrationScores ?? {})) {
			assert.equal(
				scores[name as keyof typeof scores]({
					output: example.input.observation,
					expected: example.expected
				}),
				value,
				`${example.metadata.id}: ${name}`
			);
			labels++;
		}
	}
	assert(labels > 0, 'Missing human-readable calibration labels.');
	console.log(
		`Tool-choice calibration passed: ${labels} positive/negative/null labels; no app/model/provider calls.`
	);
} else if (process.env.RUN_TOOL_SELECTION_LIVE === '1') {
	// Capture first, evaluate the frozen file separately. A failed case never stops later captures.
	const baseURL = process.env.TOOL_SELECTION_BASE_URL ?? 'http://127.0.0.1:5183';
	const origin = new URL(baseURL).origin;
	assert(
		['http://127.0.0.1:5173', 'http://127.0.0.1:5183'].includes(origin),
		'Use the reviewed local app origin.'
	);
	const selected = cases.filter((example) => example.metadata.live).slice(0, 4);
	assert.equal(selected.length, 4, 'Exactly four reviewed live probes required.');
	const api = await request.newContext({
		baseURL: origin,
		storageState: 'tests/.auth/user.json',
		timeout: 210_000
	});
	const captures: Case[] = [];
	const directory = new URL(
		`./local/tool-selection-runs/${new Date().toISOString().replace(/[:.]/g, '-')}/`,
		import.meta.url
	);
	mkdirSync(directory, { recursive: true });
	try {
		for (const example of selected) {
			const runId = randomUUID();
			const threadId = randomUUID();
			const start = Date.now();
			const observation: Observation = { status: 0, events: [] };
			let traceId: string | null = null;
			// Keep request identity even if the capture process dies after the server accepts it.
			writeFileSync(
				new URL(`${runId}.json`, directory),
				JSON.stringify(
					{
						input: { request: example.input.request, observation },
						expected: example.expected,
						metadata: {
							...example.metadata,
							mode: 'live',
							runId,
							threadId,
							status: 'capture_started'
						}
					},
					null,
					2
				)
			);
			try {
				const response = await api.post('/api/chat', {
					headers: { Origin: origin, 'x-e2e-run-id': runId },
					data: {
						threadId,
						messages: [
							{
								id: randomUUID(),
								role: 'user',
								parts: [{ type: 'text', text: example.input.request }]
							}
						]
					}
				});
				observation.status = response.status();
				traceId = response.headers()['x-sentry-trace-id'] ?? null;
				for (const line of (await response.text()).split('\n')) {
					if (!line.startsWith('data: {')) continue;
					const event = JSON.parse(line.slice(6));
					if (event.type !== 'data-browser' && !event.type.startsWith('reasoning'))
						observation.events.push(redact(event) as Event);
				}
			} catch (cause) {
				observation.error = String(redact(cause instanceof Error ? cause.message : cause));
			}
			const measured = Object.fromEntries(
				Object.entries(scores).map(([name, score]) => [
					name,
					score({ output: observation, expected: example.expected })
				])
			);
			const capture: Case = {
				input: { request: example.input.request, observation },
				expected: example.expected,
				metadata: {
					...example.metadata,
					mode: 'live',
					live: false,
					runId,
					threadId,
					traceId,
					scores: measured,
					providerOutcomes: observation.events.flatMap((event) =>
						typeof event.output?.inspectionOutcome === 'string'
							? [event.output.inspectionOutcome]
							: []
					),
					durationMs: Date.now() - start,
					capturedAt: new Date().toISOString(),
					modelUsage: null,
					modelStepCount: observation.events.filter((event) => event.type === 'start-step').length,
					costUsd: null
				}
			};
			captures.push(capture);
			writeFileSync(new URL(`${runId}.json`, directory), JSON.stringify(capture, null, 2));
			console.log(
				JSON.stringify({
					id: example.metadata.id,
					runId,
					traceId,
					durationMs: capture.metadata.durationMs,
					scores: measured
				})
			);
		}
	} finally {
		await api.dispose();
		writeFileSync(new URL('cases.json', directory), JSON.stringify(captures, null, 2));
		writeFileSync(
			new URL('./local/tool-selection-observed.json', import.meta.url),
			JSON.stringify(captures, null, 2)
		);
	}
	process.exitCode = captures.some((example) =>
		Object.values(scores).some(
			(score) => score({ output: example.input.observation, expected: example.expected }) === 0
		)
	)
		? 1
		: 0;
} else {
	const data: Case[] =
		process.env.TOOL_SELECTION_OBSERVED === '1'
			? JSON.parse(
					readFileSync(new URL('./local/tool-selection-observed.json', import.meta.url), 'utf8')
				)
			: cases.filter(
					(example) => example.metadata.mode !== 'calibration' && !example.metadata.live
				);
	assert(data.length > 0, 'No observed captures. Run the opt-in capture command first.');
	Eval<Case['input'], Observation, Expected, Case['metadata']>('Concierge', {
		experimentName: `tool-selection-observed-${new Date().toISOString().replace(/[:.]/g, '-')}`,
		data,
		task: ({ observation }) => observation,
		scores: Object.entries(scores).map(([name, score]) => ({ output, expected }) => ({
			name,
			score: score({ output, expected: expected ?? {} })
		}))
	});
}
