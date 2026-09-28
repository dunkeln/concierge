import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';
import Browserbase from '@browserbasehq/sdk';
import { jwtVerify } from 'jose';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) error(401, 'Sign in to view checkout.');
	const ticket = url.searchParams.get('ticket');
	if (!ticket || ticket.length > 1_000 || !env.BROWSERBASE_API_KEY || !env.BETTER_AUTH_SECRET)
		error(400, 'Checkout view is unavailable.');
	try {
		const { payload } = await jwtVerify(ticket, new TextEncoder().encode(env.BETTER_AUTH_SECRET), {
			algorithms: ['HS256']
		});
		if (payload.sub !== locals.user.id || typeof payload.sid !== 'string')
			error(403, 'Checkout view is unavailable.');
		const views = await new Browserbase({
			apiKey: env.BROWSERBASE_API_KEY
		}).sessions.debug(payload.sid, payload.scope === 'preview' ? { expiresIn: 120 } : undefined);
		if (payload.scope === 'preview' && typeof payload.pid !== 'string')
			throw new Error('Preview page is missing');
		const liveView =
			typeof payload.pid === 'string'
				? views.pages.find((page) => page.id === payload.pid)?.debuggerFullscreenUrl
				: views.debuggerFullscreenUrl;
		if (!liveView) throw new Error('Live view page is unavailable');
		const destination = new URL(liveView);
		if (payload.scope === 'preview') destination.searchParams.set('navbar', 'false');
		if (destination.protocol !== 'https:' || !/(^|\.)browserbase\.com$/.test(destination.hostname))
			throw new Error('Invalid live view URL');
		return new Response(null, {
			status: 302,
			headers: { Location: destination.toString(), 'Cache-Control': 'no-store' }
		});
	} catch {
		error(403, 'Checkout view expired or unavailable.');
	}
};
