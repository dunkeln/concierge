import { expect, test } from '@playwright/test';
import { conflictsWithCalendar } from '../src/lib/calendar-conflict';

test('marks only overlapping reservation windows as conflicts', () => {
	const busy = [
		{
			start: new Date('2026-09-28T19:30:00').toISOString(),
			end: new Date('2026-09-28T20:00:00').toISOString()
		}
	];
	expect(conflictsWithCalendar('2026-09-28', '7:15 PM', busy)).toBe(true);
	expect(conflictsWithCalendar('2026-09-28', '4:00 PM', busy)).toBe(false);
});

test('requests calendar scopes separately from sign-in', async ({ request, baseURL }) => {
	const response = await request.post('/?/connectCalendar', {
		form: {},
		maxRedirects: 0,
		headers: { Origin: baseURL! }
	});
	expect(response.status()).toBe(200);
	const result: { type: string; location?: string } = await response.json();
	expect(result.type).toBe('redirect');
	const destination = new URL(result.location!);
	expect(destination.hostname).toBe('accounts.google.com');
	expect(destination.searchParams.get('scope')).toContain('calendar.freebusy');
	expect(destination.searchParams.get('scope')).toContain('calendar.calendarlist.readonly');
});

test('rejects malformed calendar dates before provider access', async ({ request }) => {
	const response = await request.get('/api/calendar/busy?date=2026-09-99');
	expect(response.status()).toBe(400);
});
