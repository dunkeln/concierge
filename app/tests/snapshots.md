# Snapshots

## Turn observed failures into reusable evidence

For each reported failure, find its actual chat trace and preserve the user turns, exact tool calls, relevant tool evidence, and final answer in `local/sentry-snapshots.json`. Keep captures and proof artifacts in the gitignored `app/tests/local/` directory, never outside the project in `/tmp`. Redact credentials, live-view tickets, and personal details. Record the failing boundary in `metadata.failureFamilies` (planning, retrieval, execution, evidence/response, or presentation), link the trace, and distinguish confirmed causes from hypotheses. Record missing evidence explicitly rather than inventing tool arguments or provider outcomes.

Add a scorer only when it captures a reusable behavior. Score tool choice, arguments, candidate fit, and follow-through separately; use null when a criterion is not applicable or evidence is missing. Do not require checkout without a user-selected slot and authorization. Presentation reports belong in the case, but model scores cannot establish whether an iframe rendered. Run `bun run eval:braintrust` to score the frozen captures without model/provider calls. A later real-path capture is a separate case; rescoring the old failure does not prove a fix.

[Evaluating AI Agent Tool Selection](https://ai-office-hours.beehiiv.com/p/evaluating-ai-agent-tool-selection) motivates measuring tool decisions independently of final answers. Its tool-order experiment is a follow-up hypothesis test, not evidence that positional bias caused one of our failures. Record the actual offered tool order before making that comparison; no randomized live-provider evaluation runs by default.

## Turkish or Mediterranean in downtown San Mateo

Observed 2026-09-27, trace `2447abd5613c436fbb351e2dfb35732d`: the user supplied September, then September 29, then four guests. All four reservation searches passed a requested cuisine, but the adapter omitted it from page search and automatically inspected Izakaya Ginji on an area-only request. Ginji's source category is Japanese. The final reply acknowledged the mismatch and asked to broaden the area. The screenshot separately reports a blank live preview and assistant questions on the user's side.

This case scores cuisine propagation into tool arguments separately from inspected venue fit and named-venue inspection. It must expose that correct model arguments can still be lost inside an adapter. No selected slot or checkout request occurred, so checkout is not a failed score. Preview cause remains unconfirmed and must be investigated independently of this frozen model eval.

## Lawrence brunch → atmosphere

Recorded 2026-09-27. This is a two-turn user journey, not a fixed restaurant answer.

1. “find me a spot for brunch in lawrence pennsylvania, not far from minerd and sons”
2. “hows the atmosphere there?”

Check that Concierge:

- Resolves Minerd and Sons as the source location and grounds what “not far” means.
- Recommends a brunch spot with evidence for its location and brunch relevance.
- Understands “there” as the spot it just recommended.
- Describes that spot's atmosphere from evidence, or says when it cannot verify it.
- Does not claim reservation availability without checking it.

## South San Francisco → Amoura → weather

Observed 2026-09-27: the city resolved at the provider, but a later turn lost the venue context.

1. “Find Amoura Mediterranean Restaurant in South San Francisco, California.”
2. “I want to know more about Amoura.”
3. “What is the weather there, and what cuisine do they offer?”

Check that Concierge:

- Resolves South San Francisco, California, including the `CA` state code, and carries Amoura as the same venue across turns without a map click.
- Attributes Mediterranean to the place category; does not present a menu or specific dishes as verified from that category.
- Uses the venue location for a current weather lookup and names the weather check time. An expired weather result is fetched again before a current-conditions claim.
- Keeps place identity after dynamic facts expire, without turning the place listing into reservation availability.

## Pittsburgh neighborhoods stay in their areas

Observed 2026-09-27: “Downtown Pittsburgh, Pittsburgh” initially failed, and “Mount Washington, Pittsburgh” previously anchored downtown.

1. “Show restaurants in Downtown Pittsburgh, Pittsburgh.”
2. “Now show Mount Washington, Pittsburgh.”

Check that Concierge resolves the two named areas separately, labels each result with its own area, and places Mount Washington pins in Mount Washington rather than downtown or the Los Angeles namesake. If the location is ambiguous, ask which city before recommending.

## Ai Fiori times belong to one date and experience

Observed 2026-09-26: an inspection missed visible dinner times, mixed in “Next available date” buttons, and one time appeared under multiple experiences.

1. “Find every dinner time for two at Ai Fiori on September 28, 2026, 7–9 pm.”
2. Select a time and its experience; continue to checkout.

Check that Concierge verifies the provider's date and party filters, shows only times for that date, keeps the experience with the selected time, and rechecks the exact slot before checkout. If only a candidate page or partial inspection is available, say so without inventing times. Stop before guest details, payment, or submission.

For a 7–9 pm dinner request, the calendar should offer matching times and clearly labeled verified options within 30 minutes on either side. It must not offer breakfast. A live run on September 27 showed a 7:00 am breakfast choice alongside the dinner answer; selecting it led to a failed checkout handoff. A later run selecting a 7–9 pm slot reached the live checkout view.

## Expired reservation result

Observed 2026-09-27: earlier times remained visible until a freshness limit was introduced.

1. Show a verified time with a check timestamp more than 60 seconds old.
2. Ask to use that time.

Check that the old time is no longer selectable, “Check again” starts a new inspection, and the venue/date/party remain available as reference. The old transcript may remain visible as history; it must not be treated as current availability.

## Bigham Tavern booking page without inspectable inventory

Observed 2026-09-27: search found a booking page, but the current browser path could not inspect Toast inventory.

1. “Find a table for two at Bigham Tavern in Mount Washington, Pittsburgh, tonight.”
2. “Which times can I book?”

Check that Concierge distinguishes the candidate page from inspected inventory, reports that times are unverified, and offers a verified contact route if available. It must not describe Toast times as checked or claim a booking.

## Prior booking destination across providers

Observed 2026-09-27: SevenRooms-only discovery and inspection skipped an Izakaya Ginji OpenTable link. Combined place-and-page results also lost their booking references on later turns.

1. Find a venue's booking page in a public area.
2. Choose that venue and supply the missing date/guests.
3. Check times using the earlier destination; select a time and explicitly continue to checkout.

Check that the agent carries the venue, area, and booking link together, opens that destination regardless of provider, verifies date/guests, and stops before entering guest details or submitting. A requested provider constrains the search; without one, discovery is general. A geocoder failure must not erase the booking link.

The directed local OpenTable chat check is frozen in `local/sentry-snapshots.json`, including its failed first inspection and successful retry. It establishes named-link inspection and response shaping, not this entire multi-turn journey or discovery reliability. The independent shared checkout check reached guest-details/review without submitting.

## Partial calendar and failed chat send

Observed 2026-09-26/27: one Google calendar was unavailable during free/busy lookup, and one reservation follow-up showed “That message didn't go through.”

- With one calendar unavailable, show known busy intervals and mark the overall conflict check incomplete; do not call any other time conflict-free.
- If a reservation inspection warns, still deliver the chat response when the transport succeeds. If the send itself fails, expose Retry and keep the user's text for a retry. Diagnose provider inspection and chat transport as separate failures.

## Post-fix cuisine replay

Trace `004c89256da445ef9e50ae503056dca6` preserves a separate replay of the original four user turns. Reservation queries retain Turkish or Mediterranean, and the agent checks SAJJ Mediterranean instead of Izakaya Ginji. It reports no reservation route and asks about another nearby matching venue. The journey still repeats discovery and passes a partial month into a full-date argument before recovering. These are recorded as `planning.redundant_discovery` and `schema.partial_date`; no selected slot or checkout request occurred. Missing independent browser evidence remains unscored. Frozen Braintrust run `observed-reservation-snapshots-7ad67e49` includes both captures; it does not execute a live journey.

## Month handoff and reservation continuation

Local runtime check: `bun tests/local/month-replay.ts` from app/. Configured-model decision replay: `bun tests/local/planning-replay.ts` (synthetic provider evidence, no real availability claim). Actual chat captures are in `local/reservation-journey-before-month-guard.json` and `local/month-chat-replay.json`. The former continues from SAJJ to Hummus and a second Hummus booking destination but still contains the partial-date failure that led to the runtime handoff. The latter opens the September day picker without invalid-date retries. Keep these distinct from the original failure and from synthetic decision evidence.

## Browser → Sentry → Braintrust

`bun run test:e2e` runs the existing UI regressions with mocked chat responses; `bun run test:e2e:live` runs `journey.spec.ts` through the authenticated browser, real chat API, configured model, and providers. Live runs are serial, have no retries, and stop before checkout or booking submission. Four model turns plus discovery/inspection can take several minutes and incur provider charges; frozen scoring makes no model/provider calls. The earlier Ai Fiori checkout test remains separately opt-in with `RUN_LIVE_RESERVATION=1` and `LIVE_RESERVATION_DATE`.

Keep the actual journey in ignored `app/tests/local/journey.json` (override with `E2E_CASE`). Its fields are `request` (a month → day → guests reservation request), `date` (future YYYY-MM-DD), and `partySize` (positive number). The current local case reproduces the San Mateo Turkish/Mediterranean flow. Authenticate with `bun run test:auth`; storage stays in ignored `tests/.auth/`. Cases and credentials are not committed.

Every test using `tests/evidence.ts` captures committed requests, completed SSE tool inputs/outputs, assistant text, HTTP status, browser exceptions, failed steps, and missing stream evidence. A UUID `e2e.run_id` links the case and Sentry event; real chat responses supply `x-sentry-trace-id`. Unexpected failures report a summary to Sentry in environment `e2e` when `E2E_REPORT_SENTRY=1` (enabled by the live command). No screenshots, transcripts, cookies, or raw network payloads are sent to Sentry. A flush result records transport success; verify ingestion by event ID before claiming an issue is visible. Test names are stable fingerprints; mock failures are labeled separately from live failures.

Screenshots, videos, browser traces, and HTML reports stay under ignored `tests/local/`. They contain authenticated UI/traffic and must not be uploaded automatically. Persistent captures are `tests/local/e2e-captures/<run-id>.json`; traces live in dated `tests/local/e2e-runs/` directories. `tests/local/e2e-cases.json` is the latest run, including successes, so rates are not measured on failures alone. Open `tests/local/playwright-report/index.html` or use `bunx playwright show-trace <local trace.zip>` for DOM snapshots, screenshots, and requests.

Run `bun run eval:e2e:local` to check frozen cases locally, then `bun run eval:e2e` to publish the `observed-browser-journeys` experiment in the existing Concierge Braintrust project. This exports the captured assistant text/tool arguments and bounded browser outcome facts, with run IDs, Sentry event IDs, trace links, and failed steps; raw requests, tool outputs, preview tickets/frames, and browser artifacts stay local. Completion, transport, browser exceptions, and complete reservation-date arguments are independent scores. No-request/missing-call criteria score null, rather than pretending the agent passed. This does not establish available inventory, correct cuisine, or a completed booking; use the existing reservation snapshot scorers and source evidence for those claims.

The live command publishes frozen scoring even when Playwright fails, and returns the original failing exit status. Set `E2E_PUBLISH_BRAINTRUST=0` for local scoring. Each experiment has a timestamp so later runs do not overwrite prior evidence. Reporting is bounded to test outcomes and committed conversation/tool arguments; use the local trace for raw provider evidence. A stream that never finishes leaves its pending tool evidence unknown, including a null full-date score when no bad argument was observed.

Live tests build the app and start their own production preview at `http://127.0.0.1:5183`, with `ORIGIN` set to that URL. They never reuse the changing development server. The journey asserts its origin so a canonical redirect cannot silently send it back to development. Authentication still uses the local account's saved session; cases and browser artifacts remain ignored inside the project.

Lifecycle cases deliberately lose or interrupt browser delivery **after a real model response and durable save**. They verify the saved answer is restored, survives refresh, re-enables the composer, and requires exactly one generation request. The interrupted case preserves the assistant message ID to expose incorrect identity-only restoration. Their Braintrust metadata records `fault`; deliberately broken delivery has a null transport score and a separate `durableResponseRecovered` score. These checks do not submit bookings or prove recovery from a server crash or an unknown provider write.

The pending-turn reload case reloads after real response headers, while generation is still running. It verifies the stored user message and eventual assistant reply return without another generation request. Chat body readers reject on a main-frame document navigation: Chromium/Playwright can otherwise leave `response.text()` pending for a discarded SSE fetch, with no `requestfailed` event. Capture `bodyError` and classify `execution.page_replaced_during_delivery` separately; a hanging body reader does not establish a hanging server socket. The ignored native reproduction is `bun tests/local/socket-probe.mjs`, and the original trace timeline is `tests/local/socket-rca.json`.
