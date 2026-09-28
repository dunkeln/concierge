import { sentrySvelteKit } from '@sentry/sveltekit/vite';
import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-vercel';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { copyFileSync, existsSync, globSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const vercel = adapter({ runtime: 'nodejs24.x' });
const stagehandArchive = join(
	dirname(fileURLToPath(import.meta.resolve('@browserbasehq/stagehand'))),
	'assets/stagehand-extension.zip'
);

export default defineConfig({
	plugins: [
		sentrySvelteKit({
			org: 'concierge-vn',
			project: 'javascript-sveltekit'
		}),
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: {
				...vercel,
				async adapt(builder) {
					await vercel.adapt(builder);
					// Stagehand resolves its archive dynamically; Vercel's file tracer misses it.
					for (const fn of globSync('.vercel/output/functions/**/*.func')) {
						const dist = join(fn, 'node_modules/@browserbasehq/stagehand/dist');
						if (!existsSync(join(dist, 'index.mjs'))) continue;
						mkdirSync(join(dist, 'assets'), { recursive: true });
						copyFileSync(stagehandArchive, join(dist, 'assets/stagehand-extension.zip'));
					}
				}
			},
			experimental: {
				instrumentation: { server: true },
				tracing: { server: true }
			},

			typescript: {
				config: (config) => {
					config.include.push('../drizzle.config.ts');
					config.exclude.push('../tests/local/**');
				}
			}
		})
	]
});
