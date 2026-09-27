export const RESERVATION_TTL_MS = 60_000;
export const WEATHER_TTL_MS = 10 * 60_000;

export function isFresh(checkedAt: unknown, ttlMs: number, now = Date.now()) {
	if (typeof checkedAt !== 'string') return false;
	const checked = Date.parse(checkedAt);
	return Number.isFinite(checked) && checked <= now && now - checked < ttlMs;
}
