import { redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { auth } from '$lib/server/auth';
import { env } from '$env/dynamic/private';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { userProfile } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	const profile = locals.user
		? await db.query.userProfile.findFirst({
				where: eq(userProfile.userId, locals.user.id),
				columns: { atmospheres: true }
			})
		: null;
	return {
		chatConfigured: Boolean(env.OPENROUTER_API_KEY),
		mapboxToken: env.MAPBOX_ACCESS_TOKEN?.startsWith('pk.') ? env.MAPBOX_ACCESS_TOKEN : null,
		atmospheres: profile?.atmospheres ?? []
	};
};

export const actions: Actions = {
	signOut: async (event) => {
		await auth.api.signOut({ headers: event.request.headers });
		redirect(303, '/login');
	}
};
