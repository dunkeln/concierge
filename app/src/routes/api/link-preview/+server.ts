import { error, json } from '@sveltejs/kit';
import { isIP } from 'node:net';
import type { RequestHandler } from './$types';

type Preview = { title: string | null; description: string | null; image: string | null };
const cache = new Map<string, Preview>();

function publicHttps(raw: string) {
	try {
		const url = new URL(raw);
		const host = url.hostname.replace(/\.$/, '');
		return url.protocol === 'https:' &&
			!url.username &&
			!url.password &&
			!url.port &&
			!isIP(host) &&
			host.includes('.') &&
			!host.endsWith('.local') &&
			!host.endsWith('.internal') &&
			host !== 'localhost'
			? url
			: null;
	} catch {
		return null;
	}
}

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) error(401, 'Sign in to preview links.');
	const raw = url.searchParams.get('url');
	if (!raw || raw.length > 2_000) error(400, 'Invalid link.');
	const target = publicHttps(raw);
	if (!target || target.search || target.hash) error(400, 'Invalid link.');
	const cached = cache.get(target.href);
	if (cached) return json(cached);

	// ponytail: Microlink's free tier is capped; replace it if preview traffic outgrows the demo.
	const endpoint = new URL('https://api.microlink.io/');
	endpoint.search = new URLSearchParams({
		url: target.href,
		'meta.title': 'true',
		'meta.description': 'true',
		'meta.image': 'true',
		filter: 'title,description,image'
	}).toString();
	try {
		const response = await fetch(endpoint, { signal: AbortSignal.timeout(8_000) });
		if (!response.ok) error(503, 'Preview unavailable.');
		const result: {
			status?: string;
			data?: { title?: unknown; description?: unknown; image?: { url?: unknown } };
		} = await response.json();
		if (result.status !== 'success') error(503, 'Preview unavailable.');
		const image =
			typeof result.data?.image?.url === 'string' ? publicHttps(result.data.image.url) : null;
		const preview: Preview = {
			title: typeof result.data?.title === 'string' ? result.data.title.slice(0, 160) : null,
			description:
				typeof result.data?.description === 'string' ? result.data.description.slice(0, 280) : null,
			image: image?.href ?? null
		};
		if (cache.size >= 100) cache.clear();
		cache.set(target.href, preview);
		return json(preview, { headers: { 'Cache-Control': 'private, max-age=3600' } });
	} catch {
		return json({ title: null, description: null, image: null }, { status: 503 });
	}
};
