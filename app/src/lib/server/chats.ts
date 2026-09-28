import { and, asc, desc, eq, gt, lt, sql } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type { UIMessage } from 'ai';
import { db } from './db';
import { chatMessage, chatThread } from './db/schema';
import type { ChatSummary } from './chat-context';

export const threadIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Browser frames, reasoning, and signed checkout tickets must not survive a session.
export function durableMessage(message: UIMessage): UIMessage {
	return {
		id: message.id,
		role: message.role,
		parts: message.parts
			.filter((part) => ['text', 'step-start', 'tool-execute'].includes(part.type))
			.map((part) => {
				if (part.type !== 'tool-execute') return part;
				return JSON.parse(
					JSON.stringify(part, (key, value) =>
						['viewPath', 'sessionId', 'pageId', 'image', 'ticket'].includes(key) ? undefined : value
					)
				);
			})
	};
}

export async function listThreads(userId: string, cursor?: string | null) {
	let before;
	if (cursor) {
		const [time, id] = cursor.split('|');
		const date = new Date(time);
		if (
			!threadIdPattern.test(id ?? '') ||
			!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(time) ||
			Number.isNaN(date.getTime()) ||
			date.toISOString() !== `${time.slice(0, 23)}Z`
		)
			error(400, 'Invalid chat cursor.');
		// Keep PostgreSQL microseconds: converting this cursor to Date can skip close-together updates.
		before = sql`(${chatThread.updatedAt}, ${chatThread.id}) < (${time}::timestamptz, ${id})`;
	}
	const rows = await db
		.select({
			id: chatThread.id,
			title: chatThread.title,
			updatedAt: sql<string>`to_char(${chatThread.updatedAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`
		})
		.from(chatThread)
		.where(and(eq(chatThread.userId, userId), before))
		.orderBy(desc(chatThread.updatedAt), desc(chatThread.id))
		.limit(51);
	const threads = rows.slice(0, 50).map((row) => ({ id: row.id, title: row.title }));
	const last = rows[49];
	return {
		threads,
		nextCursor: rows.length > 50 ? `${last.updatedAt}|${last.id}` : null
	};
}

export async function readThread(id: string, userId: string) {
	if (!threadIdPattern.test(id)) error(400, 'Invalid chat.');
	const thread = await db.query.chatThread.findFirst({
		where: and(eq(chatThread.id, id), eq(chatThread.userId, userId))
	});
	if (!thread) error(404, 'Chat not found.');
	const context = { ...thread.context };
	delete context._summary;
	return { ...thread, context };
}

export async function saveThreadTitle(id: string, userId: string, title: string) {
	const value = title.replace(/\s+/g, ' ').trim().slice(0, 80);
	if (!value) return;
	await db
		.update(chatThread)
		.set({ title: value })
		.where(and(eq(chatThread.id, id), eq(chatThread.userId, userId)));
}

export async function readMessages(id: string, before?: number, limit = 100) {
	const rows = await db
		.select()
		.from(chatMessage)
		.where(
			and(
				eq(chatMessage.threadId, id),
				before === undefined ? undefined : lt(chatMessage.position, before)
			)
		)
		.orderBy(desc(chatMessage.position))
		.limit(limit);
	return rows.reverse();
}

export async function beginTurn(
	id: string,
	userId: string,
	message: UIMessage,
	context: Record<string, unknown>
) {
	const title = message.parts
		.filter((part) => part.type === 'text')
		.map((part) => part.text)
		.join(' ')
		.slice(0, 80);
	const token = crypto.randomUUID();
	const result = await db.execute(sql`with claimed as (
		insert into ${chatThread} (id, user_id, title, context, revision, turn_token, busy_until)
		values (${id}, ${userId}, ${title}, ${JSON.stringify(context)}::jsonb, 1, ${token}, now() + interval '10 minutes')
		on conflict (id) do update set
			context = excluded.context || jsonb_build_object('_summary', ${chatThread}.context->'_summary'), revision = ${chatThread}.revision + 1,
			turn_token = excluded.turn_token, busy_until = excluded.busy_until, updated_at = now()
		where ${chatThread}.user_id = ${userId}
			and (${chatThread}.busy_until is null or ${chatThread}.busy_until < now())
			and not exists (
				select 1 from ${chatMessage} prior
				where prior.thread_id = ${id} and prior.id = ${message.id}
				and (prior.message <> ${JSON.stringify(durableMessage(message))}::jsonb or exists (
					select 1 from ${chatMessage} later
					where later.thread_id = ${id} and later.position > prior.position
				))
			)
		returning id, revision, context
	), saved as (
		insert into ${chatMessage} (thread_id, id, position, message)
		select id, ${message.id}, revision * 2, ${JSON.stringify(durableMessage(message))}::jsonb from claimed
		on conflict do nothing
	) select revision, context from claimed`);
	const thread = result.rows[0];
	if (!thread) error(409, 'This chat is unavailable or still responding.');
	return {
		token,
		position: Number(thread.revision) * 2 + 1,
		summary: ((thread.context as Record<string, unknown>)._summary as ChatSummary | null) ?? null
	};
}

export async function finishTurn(
	id: string,
	token: string,
	position?: number,
	message?: UIMessage
) {
	// One atomic statement: an expired worker cannot append into a newer turn.
	await db.execute(sql`with owned as (
		update ${chatThread} set turn_token = null, busy_until = null, updated_at = now()
		where id = ${id} and turn_token = ${token} returning id
	) ${
		message && position !== undefined
			? sql`insert into ${chatMessage} (thread_id, id, position, message)
			select id, ${message.id}, ${position}, ${JSON.stringify(durableMessage(message))}::jsonb from owned
			on conflict do nothing`
			: sql`select id from owned`
	}`);
}

// Called only after beginTurn claims this owner's thread; summary never reaches page data.
export async function readContextMessages(id: string, after: number) {
	return db
		.select({ position: chatMessage.position, message: chatMessage.message })
		.from(chatMessage)
		.where(and(eq(chatMessage.threadId, id), gt(chatMessage.position, after)))
		.orderBy(asc(chatMessage.position));
}

export async function saveChatSummary(id: string, token: string, summary: ChatSummary) {
	const rows = await db
		.update(chatThread)
		.set({
			context: sql`jsonb_set(${chatThread.context}, '{_summary}', ${JSON.stringify(summary)}::jsonb)`
		})
		.where(and(eq(chatThread.id, id), eq(chatThread.turnToken, token)))
		.returning({ id: chatThread.id });
	if (!rows.length) throw new Error('Chat summary turn ownership expired');
}
