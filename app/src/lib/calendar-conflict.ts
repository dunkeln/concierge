export function conflictsWithCalendar(
	date: string,
	time: string,
	busy: { start: string; end: string }[]
) {
	const [, hour, minute, period] = /^(\d{1,2}):(\d{2}) ([AP]M)$/.exec(time) ?? [];
	if (!hour) return false;
	const localHour = (Number(hour) % 12) + (period === 'PM' ? 12 : 0);
	const start = new Date(`${date}T${String(localHour).padStart(2, '0')}:${minute}:00`).getTime();
	const end = start + 2 * 60 * 60_000;
	return busy.some((slot) => Date.parse(slot.start) < end && Date.parse(slot.end) > start);
}
