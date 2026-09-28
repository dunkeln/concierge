import type { UIMessage } from 'ai';

export type ChatSummary = { text: string; throughPosition: number };
export type ContextRow = { position: number; message: UIMessage };

// ponytail: UTF-8 bytes conservatively budget text without a model-specific tokenizer.
// Replace with native token counts if provider-neutral counting becomes available.
export const contextSize = (value: unknown) =>
	new TextEncoder().encode(JSON.stringify(value)).length;

let catalog: { expires: number; windows: Map<string, number> } | undefined;
export async function contextWindow(modelId: string, override?: string): Promise<number> {
	if (override) {
		const size = Number(override);
		if (!Number.isSafeInteger(size) || size < 16_000)
			throw new Error('Invalid CHAT_CONTEXT_WINDOW');
		return size;
	}
	if (!catalog || catalog.expires < Date.now()) {
		const response = await fetch('https://openrouter.ai/api/v1/models', {
			signal: AbortSignal.timeout(5_000)
		});
		if (!response.ok) throw new Error('Model context metadata unavailable');
		const { data } = (await response.json()) as {
			data: { id: string; context_length: number }[];
		};
		catalog = {
			expires: Date.now() + 3_600_000,
			windows: new Map(
				data
					.filter((m) => Number.isSafeInteger(m.context_length) && m.context_length >= 16_000)
					.map((m) => [m.id, m.context_length])
			)
		};
	}
	const size = catalog.windows.get(modelId);
	if (!size) throw new Error('Model context window unknown; set CHAT_CONTEXT_WINDOW');
	return size;
}

export async function compactChatContext(
	rows: ContextRow[],
	previous: ChatSummary | null,
	options: {
		window: number;
		fraction: number;
		overhead: number;
		summarize: (previous: string, rows: ContextRow[]) => Promise<string>;
		save: (summary: ChatSummary) => Promise<void>;
	}
) {
	if (!Number.isFinite(options.fraction) || options.fraction < 0.2 || options.fraction > 0.8)
		throw new Error('CHAT_CONTEXT_FRACTION must be between 0.2 and 0.8');
	let summary = previous;
	let remaining = rows.filter((row) => row.position > (summary?.throughPosition ?? 0));
	const threshold = Math.floor(options.window * options.fraction);
	if (threshold < options.overhead + 4_000)
		throw new Error('Context budget leaves insufficient room for history and a summary');
	while (contextSize(remaining) + contextSize(summary?.text ?? '') + options.overhead > threshold) {
		// Keep recent conversation verbatim; compress complete older user/assistant exchanges.
		let keep = Math.min(7, remaining.length);
		while (
			keep > 1 &&
			contextSize(remaining.slice(-keep)) + contextSize(summary?.text ?? '') + options.overhead >
				threshold
		)
			keep -= 2;
		let end = remaining.length - keep;
		while (end > 0 && remaining[end]?.message.role !== 'user') end--;
		if (!end) {
			if (
				contextSize(remaining) + contextSize(summary?.text ?? '') + options.overhead >
				options.window
			)
				throw new Error('Recent conversation exceeds the model context budget');
			break;
		}
		// Each summarization request fits independently, including the previous rolling summary.
		let batchEnd = 0;
		let batchSize = contextSize(summary?.text ?? '') + 4_002;
		for (let index = 0; index < end; index++) {
			batchSize += contextSize(remaining[index]) + 1;
			if (batchSize > threshold) break;
			if (remaining[index + 1]?.message.role === 'user') batchEnd = index + 1;
		}
		if (!batchEnd) throw new Error('An older exchange exceeds the summarization budget');
		const batch = remaining.slice(0, batchEnd);
		const text = (await options.summarize(summary?.text ?? '', batch)).trim();
		if (!text || contextSize(text) > Math.min(12_000, threshold / 4))
			throw new Error('Invalid chat summary');
		const next = { text, throughPosition: batch.at(-1)!.position };
		// Save before dropping anything. A failed call/write leaves the durable transcript intact.
		await options.save(next);
		summary = next;
		remaining = remaining.slice(batchEnd);
	}
	return { summary, rows: remaining };
}
