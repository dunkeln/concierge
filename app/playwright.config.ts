import { defineConfig } from '@playwright/test';

const run = new Date().toISOString().replace(/[:.]/g, '-');
const live = process.env.RUN_LIVE_JOURNEY === '1';
const production = live || process.env.E2E_PRODUCTION === '1';
const browser = process.env.E2E_BROWSER ?? 'chromium';
if (browser !== 'chromium' && browser !== 'webkit' && browser !== 'firefox')
	throw new Error('E2E_BROWSER must be chromium, webkit, or firefox.');
const baseURL = production ? 'http://127.0.0.1:5183' : 'http://127.0.0.1:5173';

export default defineConfig({
	testDir: './tests',
	testMatch: '*.spec.ts',
	workers: 1,
	retries: 0,
	outputDir: `./tests/local/e2e-runs/${run}/results`,
	reporter: [
		['list'],
		['html', { outputFolder: 'tests/local/playwright-report', open: 'never' }],
		['./tests/evidence-reporter.ts']
	],
	use: {
		baseURL,
		browserName: browser,
		storageState: 'tests/.auth/user.json',
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
		video: process.env.RUN_LIVE_RESERVATION === '1' ? 'on' : 'retain-on-failure'
	},
	webServer: {
		command: production
			? 'bun run build && bun run preview -- --host 127.0.0.1 --port 5183 --strictPort'
			: 'bun run dev',
		url: `${baseURL}/login`,
		env: production ? { ORIGIN: baseURL } : undefined,
		reuseExistingServer: !production,
		timeout: production ? 120_000 : 30_000
	}
});
