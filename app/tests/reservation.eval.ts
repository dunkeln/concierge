import { readFileSync } from 'node:fs';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, jsonSchema, stepCountIs, tool } from 'ai';
import { Eval } from 'braintrust';

const stage = readFileSync(new URL('../src/lib/server/stages/intake.md', import.meta.url), 'utf8');
const match = /^---\r?\nmodel: ([^\r\n]+)\r?\n---\r?\n([\s\S]+)$/.exec(stage);
if (!match) throw new Error('Invalid intake stage.');
if (!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY is required.');
const openrouter = createOpenAI({
	apiKey: process.env.OPENROUTER_API_KEY,
	baseURL: 'https://openrouter.ai/api/v1',
	name: 'openrouter'
});

type Call = { tool: 'search' | 'execute'; name?: string; input?: Record<string, unknown> };
type Expected = {
	capability: 'reservations.find' | 'reservations.prepare' | 'followup';
	requests?: { area: string; restaurant: string; date: string; partySize: number }[];
	times?: string[];
	forbiddenTimes?: string[];
	historicalTime?: string;
	otherDate?: string;
	otherDateTime?: string;
	state: 'verified' | 'candidate' | 'checkout' | 'clarification' | 'next-date';
};

type Scenario = {
	input: {
		prompt: string;
		fixture:
			'dinner' | 'candidate' | 'two-stops' | 'ambiguous' | 'checkout' | 'stale' | 'next-date';
		history?: { role: 'user' | 'assistant'; content: string }[];
	};
	expected: Expected;
	metadata: { failureMode: string; source: string };
};

const cases: Scenario[] = [
	{
		input: {
			prompt:
				'Find every dinner time for two at Ai Fiori in Midtown Manhattan on 2026-09-28, 7–9 pm.',
			fixture: 'dinner'
		},
		expected: {
			capability: 'reservations.find',
			requests: [
				{ area: 'Midtown Manhattan', restaurant: 'Ai Fiori', date: '2026-09-28', partySize: 2 }
			],
			times: ['7:15 PM', '7:45 PM'],
			forbiddenTimes: ['7:00 AM'],
			state: 'verified'
		},
		metadata: { failureMode: 'wrong-date-or-experience-time', source: 'tests/snapshots.md' }
	},
	{
		input: {
			prompt:
				'Find a table for two at Bigham Tavern in Mount Washington, Pittsburgh on 2026-09-28. Which times can I book?',
			fixture: 'candidate'
		},
		expected: {
			capability: 'reservations.find',
			requests: [
				{
					area: 'Mount Washington, Pittsburgh',
					restaurant: 'Bigham Tavern',
					date: '2026-09-28',
					partySize: 2
				}
			],
			times: [],
			state: 'candidate'
		},
		metadata: { failureMode: 'candidate-page-as-availability', source: 'tests/snapshots.md' }
	},
	{
		input: {
			prompt: 'Are those times still available for two at Ai Fiori on 2026-09-28?',
			fixture: 'stale',
			history: [
				{
					role: 'user',
					content: 'Find dinner times for two at Ai Fiori in Midtown Manhattan on 2026-09-28.'
				},
				{
					role: 'assistant',
					content:
						'A previous inspection showed 7:15 PM at Ai Fiori, but that check expired more than 60 seconds ago.'
				}
			]
		},
		expected: {
			capability: 'reservations.find',
			requests: [
				{ area: 'Midtown Manhattan', restaurant: 'Ai Fiori', date: '2026-09-28', partySize: 2 }
			],
			times: [],
			historicalTime: '7:15 PM',
			state: 'candidate'
		},
		metadata: { failureMode: 'expired-time-reuse', source: 'tests/snapshots.md' }
	},
	{
		input: {
			prompt: 'Find Sunday dinner times for two at Ai Fiori in Midtown Manhattan on 2026-09-27.',
			fixture: 'next-date'
		},
		expected: {
			capability: 'reservations.find',
			requests: [
				{ area: 'Midtown Manhattan', restaurant: 'Ai Fiori', date: '2026-09-27', partySize: 2 }
			],
			times: [],
			otherDate: 'Monday',
			otherDateTime: '7:15 PM',
			state: 'next-date'
		},
		metadata: { failureMode: 'next-date-time-leak', source: 'tests/snapshots.md' }
	},
	{
		input: {
			prompt:
				'Plan two separate reservations: Ai Fiori in Midtown Manhattan for two on 2026-10-05, then L’Artusi in the West Village, New York City for three on 2026-10-06. Find times for both.',
			fixture: 'two-stops'
		},
		expected: {
			capability: 'reservations.find',
			requests: [
				{ area: 'Midtown Manhattan', restaurant: 'Ai Fiori', date: '2026-10-05', partySize: 2 },
				{
					area: 'West Village, New York City',
					restaurant: 'L’Artusi',
					date: '2026-10-06',
					partySize: 3
				}
			],
			times: ['7:15 PM', '8:00 PM'],
			state: 'verified'
		},
		metadata: { failureMode: 'multi-stop-context-bleed', source: 'spec/reservation-flow.md' }
	},
	{
		input: {
			prompt: 'Find dinner near Mount Washington on 2026-10-05 for two.',
			fixture: 'ambiguous'
		},
		expected: { capability: 'followup', state: 'clarification' },
		metadata: { failureMode: 'ambiguous-neighborhood', source: 'tests/snapshots.md' }
	},
	{
		input: {
			prompt:
				'I selected Ai Fiori, 2026-09-28, two people, 7:15 PM Dinner. Continue my selected time to checkout. Stop before entering guest or payment details or submitting.',
			fixture: 'checkout'
		},
		expected: { capability: 'reservations.prepare', times: ['7:15 PM'], state: 'checkout' },
		metadata: { failureMode: 'checkout-misreported-as-booking', source: 'tests/snapshots.md' }
	}
];

function fixtureResult(
	fixture: Scenario['input']['fixture'],
	name: string,
	input: Record<string, unknown>
) {
	if (name === 'followup') return { kind: 'followup', question: input.question };
	if (name === 'reservations.prepare')
		return fixture === 'checkout'
			? {
					status: 'checkout_ready',
					venue: 'Ai Fiori',
					date: '2026-09-28',
					time: '7:15 PM',
					bookingConfirmed: false
				}
			: { error: 'No selected time.' };
	if (name !== 'reservations.find') return { error: 'No fixture for this capability.' };
	if (fixture === 'ambiguous')
		return { error: 'Mount Washington is ambiguous. Ask the user which city they mean.' };
	if (fixture === 'stale')
		return {
			request: input,
			inspection: { status: 'failed', visibleTimes: [] },
			error: 'Fresh inspection failed; no current times verified.'
		};
	if (fixture === 'next-date')
		return {
			request: input,
			inspection: {
				status: 'verified',
				selectedDate: input.date,
				selectedPartySize: input.partySize,
				visibleTimes: []
			},
			nextAvailableDate: { date: '2026-09-28', day: 'Monday', time: '7:15 PM' },
			bookingConfirmed: false
		};
	if (fixture === 'candidate')
		return {
			request: input,
			pages: [{ title: 'Bigham Tavern reservation page', url: 'https://example.com/bigham' }],
			inspection: { status: 'unsupported', visibleTimes: [] },
			placeListingsIncludeAvailability: false
		};
	const venue = String(input.restaurant ?? '');
	const times =
		fixture === 'two-stops'
			? venue.toLowerCase().includes('artusi')
				? ['8:00 PM']
				: ['7:15 PM']
			: ['7:15 PM', '7:45 PM'];
	return {
		request: input,
		inspection: {
			status: 'verified',
			checkedAt: '2026-09-27T12:00:00Z',
			selectedDate: input.date,
			selectedPartySize: input.partySize,
			visibleTimes: times,
			experiences: [{ name: 'Dinner', times }],
			otherExperience: fixture === 'dinner' ? { name: 'Breakfast', times: ['7:00 AM'] } : undefined
		},
		bookingConfirmed: false
	};
}

Eval('Concierge', {
	experimentName: 'reservation-agent-tool-use',
	data: cases,
	task: async ({ prompt, fixture, history }) => {
		const calls: Call[] = [];
		const discovered = new Set<string>();
		const available = [
			{
				name: 'reservations.find',
				description:
					'Find nearby venues and reservation pages; inspect supported pages for the requested date and party. No booking is made.',
				input: {
					restaurant: 'Venue name',
					area: 'Neighborhood and city',
					date: 'YYYY-MM-DD',
					partySize: 'Guest count',
					startTime: 'HH:mm',
					endTime: 'HH:mm'
				}
			},
			{
				name: 'followup',
				description: 'Ask the user for a blocking missing detail and end the turn.',
				input: { question: 'One concise question' }
			},
			...(fixture === 'checkout'
				? [
						{
							name: 'reservations.prepare',
							description:
								'Recheck the selected slot and advance to checkout, before guest details or submission.',
							input: {
								venue: 'Selected venue',
								date: 'YYYY-MM-DD',
								partySize: 'Guest count',
								time: 'Selected time'
							}
						}
					]
				: [])
		];
		let awaitingFollowup = false;
		const result = await generateText({
			model: openrouter.responses(match[1]),
			system: match[2].trim(),
			...(history
				? { messages: [...history, { role: 'user' as const, content: prompt }] }
				: { prompt }),
			maxOutputTokens: 1200,
			providerOptions: { openai: { reasoningEffort: 'low', forceReasoning: true, store: false } },
			tools: {
				search: tool({
					description: 'Discover available capabilities and their inputs.',
					inputSchema: jsonSchema<{ query: string }>({
						type: 'object',
						properties: { query: { type: 'string' } },
						required: ['query'],
						additionalProperties: false
					}),
					execute: async () => {
						calls.push({ tool: 'search' });
						for (const item of available) discovered.add(item.name);
						return { capabilities: available };
					}
				}),
				execute: tool({
					description: 'Run a capability returned by search using its documented input.',
					inputSchema: jsonSchema<{ name: string; input: Record<string, unknown> }>({
						type: 'object',
						properties: { name: { type: 'string' }, input: { type: 'object' } },
						required: ['name', 'input'],
						additionalProperties: false
					}),
					execute: async ({ name, input }) => {
						calls.push({ tool: 'execute', name, input });
						if (awaitingFollowup) return { error: 'Waiting for the user.' };
						if (!discovered.has(name))
							return { error: 'Search for this capability before executing it.' };
						const outcome = fixtureResult(fixture, name, input);
						if (name === 'followup' && 'kind' in outcome) awaitingFollowup = true;
						return outcome;
					}
				})
			},
			stopWhen: [stepCountIs(7), () => awaitingFollowup]
		});
		return { text: result.text, calls, tokens: result.usage?.totalTokens ?? 0 };
	},
	scores: [
		function searchedBeforeExecution({ output }) {
			const firstSearch = output.calls.findIndex((call) => call.tool === 'search');
			const firstExecute = output.calls.findIndex((call) => call.tool === 'execute');
			return Number(firstSearch >= 0 && firstExecute > firstSearch);
		},
		function correctToolChoice({ output, expected }) {
			const names = output.calls.filter((call) => call.tool === 'execute').map((call) => call.name);
			return Number(
				names.includes(expected.capability) &&
					(expected.state === 'checkout' || !names.includes('reservations.prepare'))
			);
		},
		function scopedToolArguments({ output, expected }) {
			if (!expected.requests) return 1;
			const finds = output.calls.filter((call) => call.name === 'reservations.find');
			return Number(
				expected.requests.every((request) =>
					finds.some(
						({ input }) =>
							String(input?.area ?? '')
								.toLowerCase()
								.includes(request.area.toLowerCase()) &&
							String(input?.restaurant ?? '')
								.toLowerCase()
								.replace('’', "'")
								.includes(request.restaurant.toLowerCase().replace('’', "'")) &&
							input?.date === request.date &&
							Number(input?.partySize) === request.partySize
					)
				)
			);
		},
		function groundedTimes({ output, expected }) {
			const times = (output.text.match(/\b\d{1,2}:\d{2}\s?[AP]M\b/gi) ?? []).map((time) =>
				time.toUpperCase()
			);
			if (expected.historicalTime) {
				const text = output.text.replace(/[‘’]/g, "'");
				const index = text.indexOf(expected.historicalTime);
				const nearTime = text.slice(
					Math.max(0, index - 70),
					index + expected.historicalTime.length + 60
				);
				return Number(
					times.every((time) => time === expected.historicalTime) &&
						(!times.length ||
							/can't|cannot|couldn't|not|isn't|unconfirmed|expired|failed/i.test(nearTime))
				);
			}
			if (expected.otherDate && expected.otherDateTime) {
				const nearOtherDate = new RegExp(
					`(?:${expected.otherDate}.{0,50}${expected.otherDateTime}|${expected.otherDateTime}.{0,50}${expected.otherDate})`,
					'i'
				).test(output.text);
				return Number(
					times.every((time) => time === expected.otherDateTime) && (!times.length || nearOtherDate)
				);
			}
			return Number(
				(expected.times ?? []).every((time) => times.includes(time)) &&
					(expected.forbiddenTimes ?? []).every((time) => !times.includes(time)) &&
					(expected.times?.length
						? times.every((time) => expected.times?.includes(time))
						: times.length === 0)
			);
		},
		function responseState({ output, expected }) {
			const text = output.text.replace(/[‘’]/g, "'");
			if (expected.state === 'clarification')
				return Number(
					output.calls.some(
						(call) =>
							call.name === 'followup' &&
							/city|which|where/i.test(String(call.input?.question ?? ''))
					)
				);
			if (expected.state === 'candidate')
				return Number(
					/unverified|can't verify|cannot verify|couldn't verify|not verified|no verified|haven't verified|unable to verify/i.test(
						text
					)
				);
			if (expected.state === 'next-date')
				return Number(/no|none|not|unavailable|couldn't|can't/i.test(text) && /Sunday/i.test(text));
			if (expected.state === 'checkout') return Number(/checkout/i.test(text));
			return Number(text.length > 0);
		},
		function noInventedBooking({ output }) {
			return Number(
				!/\b(?:I|we)\s+(?:have\s+)?(?:booked|reserved|confirmed)\b|\b(?:your|the)\s+(?:table|booking|reservation)\s+(?:is|has been)\s+(?:booked|reserved|confirmed)\b/i.test(
					output.text
				)
			);
		}
	]
});
