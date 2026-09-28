import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { userProfile } from '$lib/server/db/schema';
import { scenarios, travelMinutes } from '$lib/onboarding';
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
	default: async ({ request, locals, url }) => {
		if (!locals.user) redirect(303, '/login');
		const form = await request.formData();
		const chosenAtmospheres = [...new Set(form.getAll('atmosphere').map(String))];
		const cuisineEntries = form.getAll('cuisine');
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
		if (cuisineEntries.length > 32) {
			return fail(400, { message: 'Submit up to three cuisines.' });
		}
		const chosenCuisines: string[] = [];
		const seenCuisines = new Set<string>();
		for (const entry of cuisineEntries) {
			if (
				typeof entry !== 'string' ||
				entry.length > 256 ||
				/[\u0000-\u001f\u007f-\u009f]/.test(entry)
			) {
				return fail(400, { message: 'Cuisine names must be text without control characters.' });
			}
			const cuisine = entry.trim().replace(/\s+/g, ' ');
			if (cuisine.length > 60) {
				return fail(400, { message: 'Cuisine names must be 60 characters or fewer.' });
			}
			if (!cuisine || seenCuisines.has(cuisine.toLowerCase())) continue;
			seenCuisines.add(cuisine.toLowerCase());
			chosenCuisines.push(cuisine);
			if (chosenCuisines.length > 3) {
				return fail(400, { message: 'Choose up to three cuisines.' });
			}
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

		redirect(303, url.searchParams.has('passport') ? '/?passport=1' : '/');
	}
};
