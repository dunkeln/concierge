import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { userProfile } from '$lib/server/db/schema';
import { scenarios, cuisines, travelMinutes } from '$lib/onboarding';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, '/login');
	const profile = await db.query.userProfile.findFirst({
		where: eq(userProfile.userId, locals.user.id),
		columns: { cuisines: true, atmospheres: true, travelMinutes: true }
	});
	if (profile && !url.searchParams.has('edit')) redirect(303, '/');
	return { profile: profile ?? null };
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
				(value) => !scenarios.some((scenario) => scenario.atmosphere === value)
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
			.onConflictDoUpdate({
				target: userProfile.userId,
				set: { cuisines: chosenCuisines, atmospheres: chosenAtmospheres, travelMinutes: travel }
			});

		redirect(303, '/');
	}
};
