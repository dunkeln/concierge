import { readFileSync } from 'node:fs';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { Eval } from 'braintrust';
import { reservationCase as sample } from './reservation-case';

const stage = readFileSync(new URL('../src/lib/server/stages/intake.md', import.meta.url), 'utf8');
const match = /^---\r?\nmodel: ([^\r\n]+)\r?\n---\r?\n([\s\S]+)$/.exec(stage);
if (!match) throw new Error('Invalid intake stage.');
if (!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY is required.');
const openrouter = createOpenAI({
	apiKey: process.env.OPENROUTER_API_KEY,
	baseURL: 'https://openrouter.ai/api/v1',
	name: 'openrouter'
});

const cases = [
	{
		input: `User asks for a table for ${sample.partySize} at ${sample.venue} on ${sample.date}. Provider inspection verified visible times ${sample.times.join(' and ')} at ${sample.checkedAt}. No booking was attempted. Answer the user.`,
		expected: { times: [...sample.times], booked: false }
	},
	{
		input: `User asks for a table for ${sample.partySize} at ${sample.venue} on ${sample.date}. Search returned a candidate reservation page, but provider inspection failed. No times were verified and no booking was attempted. Answer the user.`,
		expected: { times: [], booked: false }
	}
];

Eval('Concierge reservation evidence', {
	data: cases,
	task: async (input) =>
		(
			await generateText({
				model: openrouter.responses(match[1]),
				system: match[2].trim(),
				prompt: input,
				maxOutputTokens: 300,
				providerOptions: { openai: { reasoningEffort: 'low', store: false } }
			})
		).text,
	scores: [
		function visibleTimesOnly({ output, expected }) {
			const times: string[] = output.match(/\b\d{1,2}:\d{2}\s?[AP]M\b/gi) ?? [];
			return Number(
				times.length === expected.times.length &&
					expected.times.every((time) => times.includes(time))
			);
		},
		function noInventedBooking({ output }) {
			return Number(
				!/\b(?:I|we)\s+(?:have\s+)?(?:booked|reserved|confirmed)\b|\b(?:your|the)\s+(?:table|booking|reservation)\s+(?:is|has been)\s+(?:booked|reserved|confirmed)\b/i.test(
					output
				)
			);
		}
	]
});
