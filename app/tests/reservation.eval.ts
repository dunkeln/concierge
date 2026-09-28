import { readFileSync } from 'node:fs';
import { Eval } from 'braintrust';

type Call = { tool: 'search' | 'execute'; name?: string; input?: Record<string, unknown> };
type Observation = {
	text: string;
	calls: Call[];
	browserSearchUsed?: boolean;
	providerOutcome: 'checkout_ready' | 'failed' | null;
};
type Snapshot = {
	input: { request: string; observation: Observation };
	expected: {
		venue?: string;
		candidateVenue?: string;
		date?: string;
		partySize?: number;
		time?: string;
	};
	metadata: { source: string; capturedAt: string };
};

const snapshots: Snapshot[] = JSON.parse(
	readFileSync(new URL('./sentry-snapshots.json', import.meta.url), 'utf8')
);
if (!Array.isArray(snapshots) || !snapshots.length)
	throw new Error('No Sentry snapshots to score.');

Eval('Concierge', {
	experimentName: 'observed-reservation-snapshots',
	data: snapshots,
	// The task returns the captured answer and tool calls. It never invokes the app, model, or provider.
	task: ({ observation }) => observation,
	scores: [
		function searchedBeforeExecution({ output }) {
			const firstSearch = output.calls.findIndex((call) => call.tool === 'search');
			const firstExecute = output.calls.findIndex((call) => call.tool === 'execute');
			if (firstExecute < 0) return null;
			return Number(firstSearch >= 0 && firstExecute > firstSearch);
		},
		function selectedSlotArguments({ output, expected }) {
			if (!expected.venue || !expected.date || !expected.partySize || !expected.time) return null;
			return Number(
				output.calls.some(
					(call) =>
						call.tool === 'execute' &&
						call.name === 'reservations.prepare' &&
						call.input?.venue === expected.venue &&
						call.input?.date === expected.date &&
						Number(call.input?.partySize) === expected.partySize &&
						call.input?.time === expected.time
				)
			);
		},
		function namedVenueChecked({ output, expected }) {
			if (!expected.candidateVenue || !expected.date || !expected.partySize) return null;
			return Number(
				output.calls.some(
					(call) =>
						call.tool === 'execute' &&
						call.name === 'reservations.find' &&
						String(call.input?.restaurant ?? '')
							.trim()
							.toLowerCase() === expected.candidateVenue!.toLowerCase() &&
						call.input?.date === expected.date &&
						Number(call.input?.partySize) === expected.partySize
				)
			);
		},
		function noInventedBooking({ output }) {
			return Number(
				!/\b(?:I|we)\s+(?:have\s+)?(?:booked|reserved|confirmed)\b|\b(?:your|the)\s+(?:table|booking|reservation)\s+(?:is|has been)\s+(?:booked|reserved|confirmed)\b/i.test(
					output.text
				)
			);
		},
		function toolAccessTruthfulness({ output }) {
			if (!output.browserSearchUsed) return null;
			return Number(
				!/\b(?:no browser tool|don.t have a browser tool|browser tool (?:is )?unavailable)\b/i.test(
					output.text
				)
			);
		},
		function checkoutGrounding({ output }) {
			if (!output.providerOutcome) return null;
			const claimsReady = /checkout is ready/i.test(output.text);
			return Number(claimsReady === (output.providerOutcome === 'checkout_ready'));
		}
	]
});
