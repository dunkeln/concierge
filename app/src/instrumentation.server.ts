import * as Sentry from '@sentry/sveltekit';

Sentry.init({
	dsn: 'https://b676c57e03b95a27064586408b7778eb@o4512153266487296.ingest.us.sentry.io/4512153271336960',
	tracesSampleRate: 1.0
});
