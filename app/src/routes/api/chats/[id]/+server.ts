import { error, json } from '@sveltejs/kit';
import { readThread, readMessages } from '$lib/server/chats';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params, url }) => {
	if (!locals.user) error(401, 'Sign in to chat.');
	await readThread(params.id, locals.user.id);
	const before = Number(url.searchParams.get('before'));
	if (!Number.isSafeInteger(before) || before < 1) error(400, 'Invalid message cursor.');
	const rows = await readMessages(params.id, before);
	return json({
		messages: rows.map((row) => row.message),
		oldestPosition: rows[0]?.position ?? null,
		hasOlder: rows.length === 100
	});
};
