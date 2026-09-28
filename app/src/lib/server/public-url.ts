import { isIP } from 'node:net';

export function publicHttps(raw: string) {
	try {
		const url = new URL(raw);
		const host = url.hostname.replace(/\.$/, '').replace(/^\[|\]$/g, '');
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
