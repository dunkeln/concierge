import * as Sentry from '@sentry/sveltekit';
import { sentryDsn } from './lib/sentry';

Sentry.init({
	dsn: sentryDsn,
	tracesSampleRate: 1.0
});
