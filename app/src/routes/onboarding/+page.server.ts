import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { userProfile } from '$lib/server/db/schema';
import { atmospheres, cuisines, travelMinutes } from '$lib/onboarding';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, '/login');
	const profile = await db.query.userProfile.findFirst({
		where: eq(userProfile.userId, locals.user.id),
		columns: { userId: true }
	});
	if (profile) redirect(303, '/');
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/login');
		const form = await request.formData();
		const chosenAtmospheres = [...new Set(form.getAll('atmosphere').map(String))];
		const chosenCuisines = [...new Set(form.getAll('cuisine').map(String))];
		const travel = Number(form.get('travelMinutes'));

		if (
			chosenAtmospheres.length < 1 ||
			chosenAtmospheres.length > 2 ||
			chosenAtmospheres.some(
				(value) => !atmospheres.includes(value as (typeof atmospheres)[number])
			) ||
			!travelMinutes.includes(travel as (typeof travelMinutes)[number])
		) {
			return fail(400, {
				message: 'Choose one or two situations and a travel time.'
			});
		}
		if (
			chosenCuisines.length > 3 ||
			chosenCuisines.some((value) => !cuisines.includes(value as (typeof cuisines)[number]))
		) {
			return fail(400, { message: 'Choose up to three cuisines from the list.' });
		}

		await db
			.insert(userProfile)
			.values({
				userId: locals.user.id,
				cuisines: chosenCuisines,
				atmospheres: chosenAtmospheres,
				budget: 'Any',
				travelMinutes: travel,
				onboardedAt: new Date()
			})
			.onConflictDoNothing();

		redirect(303, '/');
	}
};
