import { sequence } from '@sveltejs/kit/hooks';
import * as Sentry from '@sentry/sveltekit';
import { redirect, type Handle } from '@sveltejs/kit';
import { building, dev } from '$app/environment';
import { auth, baseURL } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { userProfile } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { svelteKitHandler } from 'better-auth/svelte-kit';

const handleBetterAuth: Handle = async ({ event, resolve }) => {
	if (!building && !dev && baseURL && event.url.origin !== new URL(baseURL).origin) {
		redirect(303, new URL(event.url.pathname + event.url.search, baseURL));
	}

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

export const handle: Handle = sequence(Sentry.sentryHandle(), handleBetterAuth);
export const handleError = Sentry.handleErrorWithSentry();
