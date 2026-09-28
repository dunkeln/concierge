# Tester readiness and low-cost regression testing

This harness checks concrete boundaries, not immunity to unknown failures. Run cheap regressions frequently; pay for live model/provider checks when agent behavior changes or before a tester session. Keep original failures and later successful reproductions as separate cases.

## Commands

From `app/`, with the existing authenticated `tests/.auth/user.json`:

```sh
bun run check
bun run test:e2e:smoke                         # isolated production preview, no model/provider calls
bun run test:e2e:smoke --repeat-each=3         # repeat cheap checks without automatic retries
E2E_BROWSER=webkit bun run test:e2e:smoke      # WebKit engine; install with bunx playwright install webkit
bun run eval:tools:calibrate                  # labeled scorer checks, no app calls
bun run test:e2e:readiness                    # cheap checks + bounded live checks + frozen Braintrust scoring
```

The preview uses its own port 5183 and matching origin, without reusing the developer server. Chromium is the default. Firefox is selectable after installing it, but has not been tested. WebKit is browser-engine evidence, not a real Safari/iPhone device certification. `test:e2e` retains the existing developer-server workflow.

Live cases and auth are intentionally gitignored inside `tests/local/` and `tests/.auth/`. `journey.json` contains the reviewed request, future full date, and guest count. `tool-selection-cases.json` contains scorer calibration, prior observations, and exactly four reviewed live requests. A fresh clone needs these local inputs and an authenticated session; `bun run test:auth` records one. No test submits a booking, guest details, payment, or calendar event. The inventory-dependent checkout test is separately opt-in and excluded from readiness. Run `RUN_LIVE_RESERVATION=1 LIVE_RESERVATION_DATE=YYYY-MM-DD E2E_PRODUCTION=1 bunx playwright test tests/reservation.spec.ts --grep "live reservation search reaches"` with a future date. It checks real discovery, immediate local slot selection, checkout preparation, the authenticated live-view redirect, and the retained provider guest-details page with blank names; it never enters details or submits. Provider and app screenshots stay under `tests/local/`.

## Coverage and cost

| Layer | What it proves | Cost and ceiling |
| --- | --- | --- |
| 20 cheap checks | Real HTTP rejection/auth boundaries; newest-message contract; map replacement; separate calendar/guest controls; stale time removal; composer/IME/drafts; duplicate submits; explicit error recovery; preview frame lifecycle and keyboard access; mobile option alignment | Zero generation, browser-provider inspection, or judge calls. Auth/database reads and an OAuth consent-URL construction still occur. Most chat responses are deliberately injected. |
| Real four-turn reservation journey | Month → day → guests → named venue lookup with retained arguments, one rolling map, saved refresh | Four generation requests plus model steps/title/provider work; volatile inventory is not required. |
| Four real delivery-fault checks | Pending-page reload, lost response after commit, interrupted response after commit, clean EOF with the same committed assistant ID | One no-tools generation request each. Recovery reads storage and must not generate again. |
| Real concurrent/replay check | Two concurrent identical requests produce one answer; completed and changed-input reuse of that message ID return 409; storage has exactly one user/assistant pair | One successful generation, three rejected attempts. |
| Named restaurant lookup | Specific venue web search, sourced page content, no booking filters or area-geocoding dependency | One generation request; one search and up to two page reads, each bounded to fifteen seconds with no retries. No browser-session startup. |
| Four live tool probes | No-tool reply, missing-location followup, exploration-only place search, fully specified named reservation lookup | Four serial generation requests; only the last is intended to inspect a provider. Client wait bound 210 seconds per probe. |
| Frozen evaluations | Separate completed tests/browser/transport/recovery from capability membership, choice, arguments, dates, followup termination and unauthorized checkout attempts | Zero additional model/provider calls; no paid judge. Thirty positive, negative and null calibration labels check scorer behavior. |

Readiness therefore normally uses 14 generation requests, not an unbounded agent soak. Each request can have up to seven logical model steps and a first-turn title call; provider inspection has its own model/network cost. SDK retries are separate from logical steps. Token usage and dollar cost are not currently exposed in the captured SSE and remain unknown, not zero. A client timeout does not cancel durable server work. Do not read Braintrust's zero-cost frozen scoring totals as live agent costs.

## What search and execute actually do

`search` advertises the permitted registry and its input contracts. Its query currently does not filter the registry. Names become discoverable in a per-request set. `execute` rejects undiscovered names, dispatches to the validated capability, and pairs each result with its tool-call ID. `followup` ends the tool loop; checkout is hidden until the explicit UI-selected-slot authorization.

Tool discovery is different from venue search: `places.search` queries place listings, while `reservations.find` discovers and inspects booking pages. Protocol success does not establish suitable candidates, verified inventory, or a booking. Scores require paired execution results, never prose claiming that a tool was used. Provider outcomes remain independently recorded.

The four current live probes passed all applicable structural scores. They used 1, 2, 3 and 3 model steps and took 3.49, 5.51, 7.61 and 52.32 seconds. The named lookup preserved Izakaya Ginji, October 5, four guests and 18:00–20:00, with a complete provider observation of five matching times. This is a timestamped observation, not current inventory or a booking. Search adds a discovery step; these measurements do not establish that search/execute is cheaper or more accurate than directly exposing tools. That claim needs a matched direct-tool baseline on the same held-out requests, with tokens, latency and selection failures measured.

## Evidence and diagnosis

Each unexpected failure reports a bounded Sentry summary and stable test fingerprint. Its local case retains run ID, trace IDs, failed assertion/step and browser/stream observations. Verify the Sentry event by ID; flush alone is not proof of ingestion. Tests distinguish injected HTTP failures from unexpected transport failures, and API-only cases do not count as browser-rendering proof.

Authenticated screenshots, videos, traces and detailed cases stay local. Credential headers, signed tickets, browser frames and reasoning are redacted from exported evidence. The tool capture runs under Node: a read-only comparison reproduced a Bun/Playwright relative-URL cookie parser failure while Node returned 200. Capture intent is written before each live API request so a runner crash retains the thread/run identity.

Use `tests/local/playwright-report/index.html` for the latest browser run. Dated `e2e-runs/`, immutable UUID `e2e-captures/`, and `tool-selection-runs/` preserve prior results. `e2e-cases.json` and `tool-selection-observed.json` are only the latest cohort. Frozen Braintrust results should be segmented by browser engine, live/mock/API mode, fault injection, and before/after repair; a mixed historical aggregate is not a reliability percentage.

## Remaining proof gates

- A process restart can leave a turn pending until its ten-minute lease expires; no durable worker resumes it. Reload recovery does not prove restart recovery.
- Sentry issue K's original inspection exception was discarded by generic warning telemetry. Its failed extraction lasted 325 ms, and a later candidate succeeded; the exact provider cause remains unknown.
- These cases do not establish new social-login callback completion, real calendar token health, second-account access isolation/revocation, checkout across providers, or deployment behavior.
- Long conversation compression, neighborhood ambiguity, reference continuity and atmosphere claims have existing local/frozen cases but were not exhaustively replayed in this sweep. No two-day load/soak, arbitrary provider-site changes or prompt-injection campaign is certified.
- Four live choices cannot estimate stochastic error rates. Structural scoring does not judge every final-answer nuance. Tester discoveries should create a new dated case and a narrow reproducer before adding another scorer or patch.

## Verified sweep on September 28

Sixty Chromium cheap executions (three repetitions) and twenty final WebKit cheap executions passed. The corrected stale-time completion check passed three additional production runs and captured both replies. The actual four-turn journey, all four delivery-recovery cases, concurrent/replay check and four live tool probes passed. Svelte check reports zero errors/warnings; production builds and diff whitespace checks passed. An intermediate build read a concurrently edited CalendarView with invalid syntax; that edit was corrected before the final build/rechecks, without changing it in this task.

The final [47-case current cohort](https://www.braintrust.dev/app/holdthatheat/p/Concierge/experiments/observed-browser-journeys-2026-09-28T04-39-04-117Z) combines 27 distinct current Chromium/API/live checks with 20 WebKit cases. Applicable contract, browser, transport and durable-recovery scores are 100%; injected faults and API-only browser scores remain null. This selected latest-success cohort documents repaired boundaries, not a failure rate. [Ten historical failed cases](https://www.braintrust.dev/app/holdthatheat/p/Concierge/experiments/observed-browser-journeys-2026-09-28T04-33-48-892Z) retain application and harness failures separately. The stale-time premature-completion capture remains local in readiness-premature-completion.json. [Four real tool probes](https://www.braintrust.dev/app/holdthatheat/p/Concierge/experiments/tool-selection-observed-2026-09-28T04-23-01-662Z) passed applicable structural scores; all thirty calibration labels passed.

Application repairs reconcile saved content after silent EOF, preserve the next draft, restore preview keyboard access using a native dialog, and reject impossible selected-slot clocks before generation. Sentry M/N/P/Q/S/V were independently read and resolved after the relevant successful checks. Original provider warning K remains unresolved because its original cause was not recorded.

A concurrent header probe also recorded home scene overflow at a 390px viewport; reservation-control containment checks do not certify that separate home surface. See logs.md. The production preview still reports optional analytics/font diagnostics; no browser exception was associated with them in this sweep. No deployment, booking, new consent, or continuous two-day monitor was performed.

Named lookup follow-up: production browser replays passed twice (10.1/9.7 seconds); [original failures and successful replays](https://www.braintrust.dev/app/holdthatheat/p/Concierge/experiments/named-restaurant-lookup-2026-09-28T04-47-13-001Z) remain separate by cohort. New lookup.spec.ts joins the live readiness sweep. Its bounded source reads do not certify the menu, reviews, identity or availability of every search result. Downtown Geoapify alias failures and full SAJJ replay remain separate.
