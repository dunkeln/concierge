import { eq } from 'drizzle-orm';
import * as Sentry from '@sentry/sveltekit';
import { db } from '$lib/server/db';
import { userProfile } from '$lib/server/db/schema';

export async function loadDiningContext(userId: string, sessionCuisine: string | null | undefined) {
	let remembered: string[] = [];
	try {
		const profile = await db.query.userProfile.findFirst({
			where: eq(userProfile.userId, userId),
			columns: { cuisines: true }
		});
		remembered = profile?.cuisines.slice(0, 5) ?? [];
	} catch {
		Sentry.captureMessage('Dining profile unavailable; using chat preference only', 'warning');
	}
	const rankingCuisines = [
		...new Set([...(sessionCuisine ? [sessionCuisine] : []), ...remembered])
	];
	const context = [
		sessionCuisine ? `Chosen for this chat: ${sessionCuisine}.` : '',
		remembered.length ? `Saved cuisine preferences: ${remembered.join(', ')}.` : ''
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
