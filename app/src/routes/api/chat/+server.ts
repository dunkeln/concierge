import { env } from '$env/dynamic/private';
import { error, json } from '@sveltejs/kit';
import { createOpenAI } from '@ai-sdk/openai';
import * as Sentry from '@sentry/sveltekit';
import {
	convertToModelMessages,
	jsonSchema,
	safeValidateUIMessages,
	stepCountIs,
	streamText,
	tool
} from 'ai';
import intakeStage from '$lib/server/stages/intake.md?raw';
import { capabilities } from '$lib/server/capabilities';
import type { RequestHandler } from './$types';

const stage = /^---\r?\nmodel: ([^\r\n]+)\r?\n---\r?\n([\s\S]+)$/.exec(intakeStage);
const allowedModels = new Set(['openai/gpt-6-luna']);
if (!stage || !allowedModels.has(stage[1]) || !stage[2].trim()) {
	throw new Error('Invalid intake stage configuration.');
}
const [, modelId, system] = stage;

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Sign in to chat.');
	if (!env.OPENROUTER_API_KEY) return json({ error: 'Chat is not configured.' }, { status: 503 });

	const raw = await request.text();
	if (raw.length > 32_000) error(413, 'Conversation is too long.');

	let payload: unknown;
	try {
		payload = JSON.parse(raw);
	} catch {
		error(400, 'Invalid request.');
	}

	const messages = (payload as { messages?: unknown })?.messages;
	if (!Array.isArray(messages) || messages.length < 1 || messages.length > 20) {
		error(400, 'Invalid conversation.');
	}
	const validated = await safeValidateUIMessages({ messages });
	if (!validated.success || validated.data.at(-1)?.role !== 'user') {
		error(400, 'Invalid conversation.');
	}
	if (
		validated.data.some(
			(message, index) =>
				message.role !== (index % 2 === 0 ? 'user' : 'assistant') ||
				message.parts.some(
					(part) =>
						(message.role === 'user' && part.type !== 'text') ||
						(message.role === 'assistant' &&
							!['text', 'step-start', 'reasoning', 'tool-search', 'tool-execute'].includes(
								part.type
							)) ||
						(part.type === 'text' && part.text.length > 2_000)
				)
		)
	) {
		error(400, 'Invalid conversation.');
	}

	const openrouter = createOpenAI({
		apiKey: env.OPENROUTER_API_KEY,
		baseURL: 'https://openrouter.ai/api/v1',
		name: 'openrouter'
	});
	const history = validated.data
		.map((message) => ({
			...message,
			parts: message.parts.filter((part) => part.type === 'text')
		}))
		.filter((message) => message.parts.length);
	const modelMessages = await convertToModelMessages(history);
	const discovered = new Set<string>();
	return Sentry.startSpanManual({ name: 'chat.intake', op: 'ai.stream' }, async (span, finish) => {
		const modelSpans = new Map<string, ReturnType<typeof Sentry.startInactiveSpan>>();
		const endTrace = () => {
			for (const modelSpan of modelSpans.values()) modelSpan.end();
			modelSpans.clear();
			finish();
		};
		const result = streamText({
			model: openrouter.responses(modelId),
			system: system.trim(),
			messages: modelMessages,
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
					execute: async () => ({
						capabilities: Object.entries(capabilities).map(([name, capability]) => {
							discovered.add(name);
							return { name, description: capability.description, input: capability.input };
						})
					})
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
						if (!discovered.has(name) || !Object.hasOwn(capabilities, name)) {
							return { error: 'Search for this capability before executing it.' };
						}
						return Sentry.startSpan({ name: `capability.${name}`, op: 'agent.tool' }, () =>
							capabilities[name].run(input)
						);
					}
				})
			},
			stopWhen: stepCountIs(5),
			onLanguageModelCallStart: ({ callId }) => {
				modelSpans.set(
					callId,
					Sentry.startInactiveSpan({ name: 'openrouter.generate', op: 'ai.model' })
				);
			},
			onLanguageModelCallEnd: ({ callId, finishReason }) => {
				const modelSpan = modelSpans.get(callId);
				modelSpan?.setAttribute('ai.finish_reason', finishReason);
				modelSpan?.end();
				modelSpans.delete(callId);
			},
			onEnd: endTrace,
			onAbort: endTrace,
			onError: () => {
				span.setAttribute('outcome', 'error');
				Sentry.captureMessage('Chat stream failed', 'warning');
				endTrace();
			}
		});

		return result.toUIMessageStreamResponse();
	});
};
