import { env } from '$env/dynamic/private';
import { error, json } from '@sveltejs/kit';
import { createOpenAI } from '@ai-sdk/openai';
import { SignJWT } from 'jose';
import * as Sentry from '@sentry/sveltekit';
import {
	convertToModelMessages,
	createUIMessageStream,
	createUIMessageStreamResponse,
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
	const userId = locals.user.id;
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
	const selection = (payload as { selectedPlace?: unknown }).selectedPlace;
	let selectedPlace: { id: string; name: string; area: string } | null = null;
	if (selection != null) {
		if (typeof selection !== 'object' || Array.isArray(selection)) error(400, 'Invalid place.');
		const { id, name, area } = selection as Record<string, unknown>;
		if (
			typeof id !== 'string' ||
			!id ||
			id.length > 200 ||
			typeof name !== 'string' ||
			!name.trim() ||
			name.length > 100 ||
			typeof area !== 'string' ||
			!area.trim() ||
			area.length > 200
		)
			error(400, 'Invalid place.');
		selectedPlace = { id, name, area };
	}
	const dateSelection = (payload as { selectedDate?: unknown }).selectedDate;
	let selectedDate: string | null = null;
	if (dateSelection != null) {
		if (
			typeof dateSelection !== 'string' ||
			!/^\d{4}-\d{2}-\d{2}$/.test(dateSelection) ||
			Number.isNaN(new Date(`${dateSelection}T00:00:00Z`).getTime()) ||
			new Date(`${dateSelection}T00:00:00Z`).toISOString().slice(0, 10) !== dateSelection
		)
			error(400, 'Invalid date.');
		selectedDate = dateSelection;
	}
	const slotSelection = (payload as { selectedSlot?: unknown }).selectedSlot;
	let selectedSlot: {
		venue: string;
		date: string;
		partySize: number;
		time: string;
		experience?: string;
		sourceUrl?: string;
	} | null = null;
	if (slotSelection != null) {
		if (typeof slotSelection !== 'object' || Array.isArray(slotSelection))
			error(400, 'Invalid time.');
		const { venue, date, partySize, time, experience, sourceUrl } = slotSelection as Record<
			string,
			unknown
		>;
		if (
			typeof venue !== 'string' ||
			!venue.trim() ||
			venue.length > 100 ||
			date !== selectedDate ||
			!Number.isInteger(partySize) ||
			(partySize as number) < 1 ||
			(partySize as number) > 12 ||
			typeof time !== 'string' ||
			!/^\d{1,2}:\d{2} [AP]M$/.test(time) ||
			(experience !== undefined &&
				(typeof experience !== 'string' || !experience.trim() || experience.length > 100)) ||
			(sourceUrl !== undefined && (typeof sourceUrl !== 'string' || sourceUrl.length > 500))
		)
			error(400, 'Invalid time.');
		selectedSlot = {
			venue,
			date: selectedDate!,
			partySize: partySize as number,
			time,
			...(typeof experience === 'string' ? { experience } : {}),
			...(typeof sourceUrl === 'string' ? { sourceUrl } : {})
		};
	}
	const prepareRequested =
		selectedSlot?.sourceUrl &&
		validated.data
			.at(-1)
			?.parts.some(
				(part) =>
					part.type === 'text' &&
					part.text ===
						'Continue my selected time to checkout. Stop before entering guest or payment details or submitting.'
			);

	const openrouter = createOpenAI({
		apiKey: env.OPENROUTER_API_KEY,
		baseURL: 'https://openrouter.ai/api/v1',
		name: 'openrouter'
	});
	const history = validated.data
		.map((message) => ({
			...message,
			parts: message.parts.flatMap((part) => {
				if (part.type === 'text') return [part];
				if (part.type !== 'tool-execute' || part.state !== 'output-available') return [];
				const output = part.output as { kind?: unknown; question?: unknown } | null;
				return output?.kind === 'followup' && typeof output.question === 'string'
					? [{ type: 'text' as const, text: output.question }]
					: [];
			})
		}))
		.filter((message) => message.parts.length);
	if (selectedPlace) {
		history.at(-1)?.parts.push({
			type: 'text',
			text: `Selected place in the interface: ${JSON.stringify(selectedPlace)}. This is the user's current choice, not evidence of reservation availability.`
		});
	}
	if (selectedDate) {
		history.at(-1)?.parts.push({
			type: 'text',
			text: `Selected date in the interface: ${selectedDate}. This is the user's current choice, not a new availability check.`
		});
	}
	if (selectedSlot) {
		history.at(-1)?.parts.push({
			type: 'text',
			text: `Selected time in the interface: ${JSON.stringify(selectedSlot)}. This is the user's choice from an earlier result, not a live hold or booking.`
		});
	}
	const modelMessages = await convertToModelMessages(history);
	const discovered = new Set<string>();
	let awaitingFollowup = false;
	let emitBrowserSession:
		((event: { open: boolean; id: string; venue: string }) => Promise<void>) | undefined;
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
						capabilities: Object.entries(capabilities)
							.filter(([name]) => name !== 'reservations.prepare' || prepareRequested)
							.map(([name, capability]) => {
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
						if (awaitingFollowup) return { error: 'Waiting for the user.' };
						if (!discovered.has(name) || !Object.hasOwn(capabilities, name)) {
							return { error: 'Search for this capability before executing it.' };
						}
						if (name === 'reservations.prepare') {
							if (!prepareRequested || !selectedSlot?.sourceUrl)
								return { error: 'Select a time and choose Continue to checkout first.' };
							const outcome = (await Sentry.startSpan(
								{ name: 'capability.reservations.prepare', op: 'agent.tool' },
								() => capabilities[name].run(selectedSlot as Record<string, unknown>)
							)) as Record<string, unknown>;
							if (
								outcome.status !== 'checkout_ready' ||
								typeof outcome.sessionId !== 'string' ||
								typeof outcome.expiresAt !== 'number'
							)
								return outcome;
							const { sessionId, expiresAt, ...observation } = outcome;
							const ticket = await new SignJWT({ sid: sessionId })
								.setProtectedHeader({ alg: 'HS256' })
								.setSubject(userId)
								.setExpirationTime(expiresAt)
								.sign(new TextEncoder().encode(env.BETTER_AUTH_SECRET));
							return { ...observation, viewPath: `/api/reservations/view?ticket=${ticket}` };
						}
						const outcome = await Sentry.startSpan(
							{ name: `capability.${name}`, op: 'agent.tool' },
							() =>
								capabilities[name].run(
									input,
									name === 'reservations.find' ? emitBrowserSession : undefined
								)
						);
						if (name === 'followup' && (outcome as { kind?: string })?.kind === 'followup')
							awaitingFollowup = true;
						return outcome;
					}
				})
			},
			stopWhen: [
				stepCountIs(7),
				({ steps }) =>
					steps
						.at(-1)
						?.toolResults.some(
							(result) =>
								result.toolName === 'execute' &&
								typeof result.output === 'object' &&
								result.output !== null &&
								'kind' in result.output &&
								result.output.kind === 'followup'
						) ?? false
			],
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
			onError: ({ error: streamError }) => {
				span.setAttribute('outcome', 'error');
				Sentry.withScope((scope) => {
					scope.setTag(
						'chat.error_type',
						streamError instanceof Error ? streamError.name : 'unknown'
					);
					if (
						typeof streamError === 'object' &&
						streamError !== null &&
						'statusCode' in streamError &&
						typeof streamError.statusCode === 'number'
					)
						scope.setTag('chat.status_code', streamError.statusCode);
					Sentry.captureMessage('Chat stream failed', 'warning');
				});
				endTrace();
			}
		});

		return createUIMessageStreamResponse({
			stream: createUIMessageStream({
				execute({ writer }) {
					emitBrowserSession = async ({ open, id, venue }) => {
						if (!open) {
							writer.write({ type: 'data-browser', data: { open, id }, transient: true });
							return;
						}
						const ticket = await new SignJWT({ sid: id, scope: 'preview' })
							.setProtectedHeader({ alg: 'HS256' })
							.setSubject(userId)
							.setExpirationTime(Math.floor(Date.now() / 1_000) + 120)
							.sign(new TextEncoder().encode(env.BETTER_AUTH_SECRET));
						writer.write({
							type: 'data-browser',
							data: { open, id, venue, viewPath: `/api/reservations/view?ticket=${ticket}` },
							transient: true
						});
					};
					writer.merge(result.toUIMessageStream());
				}
			})
		});
	});
};
