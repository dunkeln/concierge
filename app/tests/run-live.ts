import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';

rmSync('tests/local/e2e-cases.json', { force: true });
const readiness = process.env.E2E_READINESS === '1';
if (readiness) rmSync('tests/local/tool-selection-observed.json', { force: true });
const browser = spawnSync(
	'bunx',
	[
		'playwright',
		'test',
		...(readiness
			? ['--grep-invert', 'live reservation search reaches the checkout handoff']
			: ['journey.spec.ts'])
	],
	{
		stdio: 'inherit',
		env: { ...process.env, RUN_LIVE_JOURNEY: '1', E2E_REPORT_SENTRY: '1' }
	}
);
// Score even failed journeys; retaining the original nonzero status keeps CI honest.
const evaluation = existsSync('tests/local/e2e-cases.json')
	? spawnSync(
			'bun',
			['run', process.env.E2E_PUBLISH_BRAINTRUST === '0' ? 'eval:e2e:local' : 'eval:e2e'],
			{ stdio: 'inherit' }
		)
	: { status: 1 };
const tools =
	readiness && existsSync('tests/local/tool-selection-observed.json')
		? spawnSync(
				process.env.E2E_PUBLISH_BRAINTRUST === '0' ? 'bt' : 'bun',
				process.env.E2E_PUBLISH_BRAINTRUST === '0'
					? [
							'eval',
							'--no-send-logs',
							'--no-input',
							'--runner',
							'bun',
							'tests/tool-selection.eval.ts'
						]
					: ['run', 'eval:tools'],
				{ stdio: 'inherit', env: { ...process.env, TOOL_SELECTION_OBSERVED: '1' } }
			)
		: { status: readiness ? 1 : 0 };
process.exitCode = browser.status ?? 1;
if (!process.exitCode) process.exitCode = evaluation.status ?? 1;
if (!process.exitCode) process.exitCode = tools.status ?? 1;
