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

const cases: {
	input: string;
	expected: { times: string[]; booked: boolean; otherDate?: string; otherDateTime?: string };
}[] = [
	{
		input: `User asks for a table for ${sample.partySize} at ${sample.venue} on ${sample.date}. Provider inspection verified visible times ${sample.times.join(' and ')} just now at ${new Date().toISOString()}. No booking was attempted. Answer the user.`,
		expected: { times: [...sample.times], booked: false }
	},
	{
		input: `User asks for a table for ${sample.partySize} at ${sample.venue} on ${sample.date}. Search returned a candidate reservation page, but provider inspection failed. No times were verified and no booking was attempted. Answer the user.`,
		expected: { times: [], booked: false }
	},
	{
		input: `User asks which times are currently available for two at Ai Fiori on September 28. The only inspected times were 7:15 PM and 7:45 PM, checked more than two minutes ago. The 60-second freshness window expired and no new inspection succeeded. Answer without listing old times as current availability.`,
		expected: { times: [], booked: false }
	},
	{
		input: `User asks for dinner times for two at Ai Fiori on Sunday September 27. The provider's selected date and party were verified, but no Sunday dinner times were visible. A separate “Next available date” card showed 7:15 PM on Monday September 28. Answer for Sunday without listing Monday's time as a Sunday option.`,
		expected: { times: [], booked: false, otherDate: 'Monday', otherDateTime: '7:15 PM' }
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
			if (expected.otherDate && expected.otherDateTime) {
				const otherDateNearTime = new RegExp(
					`(?:${expected.otherDate}.{0,50}${expected.otherDateTime}|${expected.otherDateTime}.{0,50}${expected.otherDate})`,
					'i'
				).test(output);
				return Number(
					times.every((time) => time === expected.otherDateTime) &&
						(!times.length || otherDateNearTime)
				);
			}
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
		},
		function uncertaintyWithoutTimes({ output, expected }) {
			if (expected.times.length) return 1;
			return Number(
				/\b(?:not|no|couldn.t|cannot|can't|unable|haven't)\b.{0,45}\b(?:verified|verify|confirmed|confirm|checked|check|inspected|inspect|times)\b|\b(?:recheck|refresh|unverified)\b/i.test(
					output
				)
			);
		}
	]
});
