import { error, json } from '@sveltejs/kit';
import { listThreads } from '$lib/server/chats';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) error(401, 'Sign in to chat.');
	return json(await listThreads(locals.user.id, url.searchParams.get('cursor')));
};
