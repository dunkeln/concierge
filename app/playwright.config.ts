import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: './tests',
	testMatch: '*.spec.ts',
	use: {
		baseURL: 'http://127.0.0.1:5173',
		browserName: 'chromium',
		storageState: 'tests/.auth/user.json'
	},
	webServer: {
		command: 'bun run dev',
		url: 'http://127.0.0.1:5173/login',
		reuseExistingServer: true,
		timeout: 30_000
	}
});
