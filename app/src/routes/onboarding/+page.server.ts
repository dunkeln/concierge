import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { userProfile } from '$lib/server/db/schema';
import { atmospheres, budgets, cuisines, travelMinutes } from '$lib/onboarding';
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
		const chosenCuisines = [...new Set(form.getAll('cuisine').map(String))];
		const chosenAtmospheres = [...new Set(form.getAll('atmosphere').map(String))];
		const budget = String(form.get('budget') ?? '');
		const travel = Number(form.get('travelMinutes'));

		if (
			chosenCuisines.length < 1 ||
			chosenCuisines.length > 3 ||
			chosenCuisines.some((value) => !cuisines.includes(value as (typeof cuisines)[number])) ||
			chosenAtmospheres.length < 1 ||
			chosenAtmospheres.length > 2 ||
			chosenAtmospheres.some(
				(value) => !atmospheres.includes(value as (typeof atmospheres)[number])
			) ||
			!budgets.includes(budget as (typeof budgets)[number]) ||
			!travelMinutes.includes(travel as (typeof travelMinutes)[number])
		) {
			return fail(400, {
				message: 'Choose up to three cuisines, up to two moods, a budget, and a travel time.'
			});
		}

		await db
			.insert(userProfile)
			.values({
				userId: locals.user.id,
				cuisines: chosenCuisines,
				atmospheres: chosenAtmospheres,
				budget,
				travelMinutes: travel,
				onboardedAt: new Date()
			})
			.onConflictDoNothing();

		redirect(303, '/');
	}
};
