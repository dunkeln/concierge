import { env } from '$env/dynamic/private';
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { importPKCS8, SignJWT } from 'jose';
import { db } from '$lib/server/db';

export const githubEnabled = Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET);
export const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
export const calendarScopes = [
	'https://www.googleapis.com/auth/calendar.freebusy',
	'https://www.googleapis.com/auth/calendar.calendarlist.readonly'
];
export const hasCalendarScopes = (scope: string | null | undefined) =>
	calendarScopes.every((item) => scope?.split(',').includes(item));
export const baseURL =
	env.ORIGIN ??
	(env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined);
export const appleEnabled = Boolean(
	baseURL?.startsWith('https://') &&
	env.APPLE_CLIENT_ID &&
	env.APPLE_TEAM_ID &&
	env.APPLE_KEY_ID &&
	env.APPLE_PRIVATE_KEY_BASE64
);

async function appleClientSecret() {
	const key = await importPKCS8(
		Buffer.from(env.APPLE_PRIVATE_KEY_BASE64!, 'base64').toString('utf8'),
		'ES256'
	);
	const now = Math.floor(Date.now() / 1000);
	return new SignJWT({})
		.setProtectedHeader({ alg: 'ES256', kid: env.APPLE_KEY_ID! })
		.setIssuer(env.APPLE_TEAM_ID!)
		.setSubject(env.APPLE_CLIENT_ID!)
		.setAudience('https://appleid.apple.com')
		.setIssuedAt(now)
		.setExpirationTime(now + 180 * 24 * 60 * 60)
		.sign(key);
}

export const auth = betterAuth({
	baseURL,
	secret: env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: 'pg' }),
	session: { cookieCache: { enabled: true, maxAge: 60 } },
	emailAndPassword: { enabled: true },
	account: { encryptOAuthTokens: true, accountLinking: { allowDifferentEmails: true } },
	...(appleEnabled && { trustedOrigins: ['https://appleid.apple.com'] }),
	socialProviders: {
		...(githubEnabled && {
			github: { clientId: env.GITHUB_CLIENT_ID!, clientSecret: env.GITHUB_CLIENT_SECRET! }
		}),
		...(googleEnabled && {
			google: { clientId: env.GOOGLE_CLIENT_ID!, clientSecret: env.GOOGLE_CLIENT_SECRET! }
		}),
		...(appleEnabled && {
			apple: async () => ({
				clientId: env.APPLE_CLIENT_ID!,
				clientSecret: await appleClientSecret()
			})
		})
	},
	plugins: [
		sveltekitCookies(getRequestEvent) // make sure this is the last plugin in the array
	]
});
