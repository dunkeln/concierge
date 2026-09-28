import { eq } from 'drizzle-orm';
import * as Sentry from '@sentry/sveltekit';
import { db } from '$lib/server/db';
import { userProfile } from '$lib/server/db/schema';

export async function loadDiningContext(userId: string, sessionCuisine: string | null | undefined) {
	let remembered: string[] = [];
	let plans: string[] = [];
	let travel: number | undefined;
	try {
		const profile = await db.query.userProfile.findFirst({
			where: eq(userProfile.userId, userId),
			columns: { cuisines: true, atmospheres: true, travelMinutes: true }
		});
		remembered = profile?.cuisines.slice(0, 5) ?? [];
		plans = profile?.atmospheres ?? [];
		travel = profile?.travelMinutes;
	} catch {
		Sentry.captureMessage('Dining profile unavailable; using chat preference only', 'warning');
	}
	const rankingCuisines = [
		...new Set([...(sessionCuisine ? [sessionCuisine] : []), ...remembered])
	];
	const context = [
		sessionCuisine ? `Chosen for this chat: ${sessionCuisine}.` : '',
		remembered.length ? `Saved cuisine preferences: ${remembered.join(', ')}.` : '',
		plans.length ? `Saved outing preferences: ${plans.join(', ')}.` : '',
		travel
			? `Preferred travel limit: ${travel} minutes; verify actual journey time before claiming a fit.`
			: ''
	]
		.filter(Boolean)
		.join(' ');
	return {
		rankingCuisines,
		modelContext: context
			? `Dining context: ${context} The current request takes precedence. These are preferences, not facts about any restaurant or evidence of availability.`
			: ''
	};
}
