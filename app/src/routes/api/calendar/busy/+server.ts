import { auth, hasCalendarScopes } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { account } from '$lib/server/db/auth.schema';
import { and, eq } from 'drizzle-orm';
import { error, json } from '@sveltejs/kit';
import * as Sentry from '@sentry/sveltekit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, request, url }) => {
	if (!locals.user) error(401, 'Sign in to check your calendar.');
	const date = url.searchParams.get('date');
	const month = url.searchParams.get('month');
	if (
		(date === null) === (month === null) ||
		(date !== null &&
			(!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date) ||
				!Number.isFinite(Date.parse(`${date}T00:00:00Z`)) ||
				new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date)) ||
		(month !== null &&
			(!/^[0-9]{4}-[0-9]{2}$/.test(month) ||
				!Number.isFinite(Date.parse(`${month}-01T00:00:00Z`)) ||
				new Date(`${month}-01T00:00:00Z`).toISOString().slice(0, 7) !== month))
	)
		error(400, 'Invalid calendar range.');
	const google = (
		await db.query.account.findMany({
			where: and(eq(account.userId, locals.user.id), eq(account.providerId, 'google')),
			columns: { id: true, scope: true }
		})
	).find(({ scope }) => hasCalendarScopes(scope));
	if (!google) error(403, 'Connect Google Calendar first.');

	try {
		const { accessToken } = await auth.api.getAccessToken({
			body: { accountId: google.id },
			headers: request.headers
		});
		if (!accessToken) throw new Error('Missing Google access token');
		const headers = { Authorization: `Bearer ${accessToken}` };
		const list = await fetch(
			'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=50&minAccessRole=freeBusyReader',
			{ headers, signal: AbortSignal.timeout(8_000) }
		);
		if (!list.ok) throw new Error(`Calendar list failed: ${list.status}`);
		const calendars: {
			items?: { id?: string }[];
			nextPageToken?: string;
		} = await list.json();
		if (calendars.nextPageToken) throw new Error('Calendar list exceeds 50 calendars');
		const ids = calendars.items?.flatMap((item) => (item.id ? [item.id] : [])) ?? [];
		if (!ids.length) throw new Error('No accessible calendars');
		const midnight = new Date(`${date ?? `${month}-01`}T00:00:00Z`).getTime();
		const end = month
			? Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1)
			: midnight + 86_400_000;
		// ponytail: UTC padding covers local dates across time zones; use venue time zones when provider data supplies them.
		const freebusy = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
			method: 'POST',
			headers: { ...headers, 'Content-Type': 'application/json' },
			body: JSON.stringify({
				timeMin: new Date(midnight - 86_400_000).toISOString(),
				timeMax: new Date(end + 86_400_000).toISOString(),
				items: ids.map((id) => ({ id }))
			}),
			signal: AbortSignal.timeout(8_000)
		});
		if (!freebusy.ok) throw new Error(`Free/busy failed: ${freebusy.status}`);
		const result: {
			calendars?: Record<string, { busy?: { start: string; end: string }[]; errors?: unknown[] }>;
		} = await freebusy.json();
		let calendarCount = 0;
		const busy = ids.flatMap((id) => {
			const entry = result.calendars?.[id];
			if (entry?.errors?.length) return [];
			if (!entry || !Array.isArray(entry.busy)) throw new Error('Invalid calendar availability');
			if (
				entry.busy.some(
					(slot) =>
						!Number.isFinite(Date.parse(slot.start)) || !Number.isFinite(Date.parse(slot.end))
				)
			)
				throw new Error('Invalid calendar availability');
			calendarCount++;
			return entry.busy;
		});
		if (!calendarCount) throw new Error('No available calendars');
		Sentry.getActiveSpan()?.setAttribute('calendar.count', calendarCount);
		return json(
			{ busy, calendarCount, complete: calendarCount === ids.length },
			{ headers: { 'Cache-Control': 'no-store' } }
		);
	} catch (cause) {
		Sentry.withScope((scope) => {
			scope.setTag('calendar.error_type', cause instanceof Error ? cause.name : 'unknown');
			Sentry.captureMessage('Google Calendar free/busy lookup failed', 'warning');
		});
		return json(
			{ error: 'Calendar availability is unavailable right now.' },
			{ status: 503, headers: { 'Cache-Control': 'no-store' } }
		);
	}
};
