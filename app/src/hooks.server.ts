import { redirect, type Handle } from '@sveltejs/kit';
import { building } from '$app/environment';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { userProfile } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { svelteKitHandler } from 'better-auth/svelte-kit';

const handleBetterAuth: Handle = async ({ event, resolve }) => {
	const session = await auth.api.getSession({ headers: event.request.headers });

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;
	}

	const path = new URL(event.request.url).pathname;
	if (
		!building &&
		!session &&
		path !== '/login' &&
		path !== '/api/auth' &&
		!path.startsWith('/api/auth/')
	) {
		redirect(303, '/login');
	}
	if (
		!building &&
		session &&
		(path === '/' || path.startsWith('/user/')) &&
		!(path === '/' && event.request.method === 'POST' && event.url.searchParams.has('/signOut'))
	) {
		const profile = await db.query.userProfile.findFirst({
			where: eq(userProfile.userId, session.user.id),
			columns: { userId: true }
		});
		if (!profile) redirect(303, '/onboarding');
	}

	return svelteKitHandler({ event, resolve, auth, building });
};

export const handle: Handle = handleBetterAuth;
