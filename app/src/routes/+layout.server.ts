import type { LayoutServerLoad } from './$types';
import { listThreads } from '$lib/server/chats';

export const load: LayoutServerLoad = async ({ locals }) => {
	const { threads, nextCursor } = locals.user
		? await listThreads(locals.user.id)
		: { threads: [], nextCursor: null };
	return { user: locals.user ?? null, threads, nextThreadCursor: nextCursor };
};
