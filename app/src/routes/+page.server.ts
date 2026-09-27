import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { auth, calendarScopes, googleEnabled, hasCalendarScopes } from '$lib/server/auth';
import { env } from '$env/dynamic/private';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { account } from '$lib/server/db/auth.schema';
import { passportVisit, userProfile } from '$lib/server/db/schema';
import { scenarios } from '$lib/onboarding';
import { and, desc, eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals, url }) => {
	const profile = locals.user
		? await db.query.userProfile.findFirst({
				where: eq(userProfile.userId, locals.user.id),
				columns: { atmospheres: true }
			})
		: null;
	const google = locals.user
		? await db.query.account.findMany({
				where: and(eq(account.userId, locals.user.id), eq(account.providerId, 'google')),
				columns: { scope: true }
			})
		: [];
	const visits =
		locals.user && url.searchParams.has('passport')
			? await db.query.passportVisit.findMany({
					where: eq(passportVisit.userId, locals.user.id),
					orderBy: [desc(passportVisit.visitedOn), desc(passportVisit.createdAt)],
					columns: { id: true, place: true, visitedOn: true, scene: true }
				})
			: [];
	return {
		chatConfigured: Boolean(env.OPENROUTER_API_KEY),
		mapboxToken: env.MAPBOX_ACCESS_TOKEN?.startsWith('pk.') ? env.MAPBOX_ACCESS_TOKEN : null,
		atmospheres: profile?.atmospheres ?? [],
		googleEnabled,
		calendarConnected: google.some(({ scope }) => hasCalendarScopes(scope)),
		visits
	};
};

export const actions: Actions = {
	addVisit: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/login');
		const form = await request.formData();
		const place = String(form.get('place') ?? '').trim();
		const visitedOn = String(form.get('visitedOn') ?? '');
		const scene = String(form.get('scene') ?? '');
		const day = new Date(`${visitedOn}T00:00:00Z`);
		if (
			!place ||
			place.length > 120 ||
			!/^\d{4}-\d{2}-\d{2}$/.test(visitedOn) ||
			Number.isNaN(day.getTime()) ||
			day.toISOString().slice(0, 10) !== visitedOn ||
			visitedOn > new Date().toISOString().slice(0, 10) ||
			!scenarios.some((item) => item.atmosphere === scene)
		)
			return fail(400, { message: 'Add a place, a past date, and a scene.' });
		await db.insert(passportVisit).values({
			id: crypto.randomUUID(),
			userId: locals.user.id,
			place,
			visitedOn,
			scene
		});
		redirect(303, '/?passport=1');
	},
	removeVisit: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/login');
		const id = String((await request.formData()).get('id') ?? '');
		if (!/^[0-9a-f-]{36}$/.test(id)) return fail(400, { message: 'Visit not found.' });
		await db
			.delete(passportVisit)
			.where(and(eq(passportVisit.id, id), eq(passportVisit.userId, locals.user.id)));
		redirect(303, '/?passport=1');
	},
	connectCalendar: async (event) => {
		if (!event.locals.user || !googleEnabled)
			return fail(400, { message: 'Google is unavailable.' });
		let url: string | undefined;
		try {
			const result = await auth.api.linkSocialAccount({
				body: {
					provider: 'google',
					callbackURL: '/',
					scopes: calendarScopes,
					additionalParams: { access_type: 'offline', prompt: 'consent' }
				},
				headers: event.request.headers
			});
			url = result.url;
		} catch {
			return fail(503, { message: 'Google Calendar connection is unavailable.' });
		}
		if (!url) return fail(400, { message: 'Google Calendar could not be connected.' });
		redirect(302, url);
	},
	signOut: async (event) => {
		await auth.api.signOut({ headers: event.request.headers });
		redirect(303, '/login');
	}
};
