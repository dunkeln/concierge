# Observed issues

Record a new entry only when a failure or limitation is observed and useful to revisit. Keep private data and secrets out.

## Entry format

### YYYY-MM-DD — Short symptom

- Evidence: What happened and where it was observed.
- Hypothesis or cause: What explains it; mark uncertainty.
- Change: What was done, or `open`.
- Verification: What was checked and what remains unproven.
- Regression guard: The smallest repeatable check, if one exists.
- Remaining limit: What this check still does not prove.

## Entries

### 2026-09-27 — Area reservation search stopped before a named-venue check

- Evidence: The [Sentry trace](https://concierge-vn.sentry.io/explore/traces/trace/103b1071632c4f4a8099c45ba48913aa) captured a downtown San Mateo request for tomorrow at 6 pm, followed by four guests. Luna executed `reservations.find` with area, September 28, party size four, and 18:00, but no restaurant. It then recommended Izakaya Ginji with an OpenTable link and unverified times. The 63 chat spans show one reservation search, Browserbase page search, and no browser inspection. Search took 3.80 seconds; the reply turn took 8.71 seconds. The user reports that opening the link showed reservations; those slots were not captured here.
- Cause: The agent stopped after area discovery despite the prompt asking for a named-venue check before concluding times are unknown. Separately, `findReservationPages` launches inspection only for an exact SevenRooms venue; a Browserbase search key does not expose a general browser capability to the model. OpenTable remains outside the implemented inspection path. No inspection was attempted, so this trace does not show a browser failure or blocked provider.
- Change: Added this real turn and its source conversation/span IDs to the existing frozen Braintrust snapshots. Added `namedVenueChecked`, applicable only to captures annotated with a candidate and known date/party. No app behavior or provider coverage was changed.
- Verification: Local and [Braintrust snapshot scoring](https://www.braintrust.dev/app/whentor/p/Concierge/experiments/observed-reservation-snapshots-2e52f857) completed with zero model or provider calls. This case scored 0% on `namedVenueChecked` and passed tool-access truthfulness. Other captures are not applicable to the new score. This measures follow-through on a named candidate, not browser availability or completed booking; adding a case changes the cohort and is not evidence of improvement.
- Remaining limit: Captured model request messages are truncated. Tool arguments and final prose are recovered from individual model outputs; provider results are not fully captured. A stronger model cannot remove the SevenRooms-only adapter gate.

### 2026-09-27 — San Mateo venue lookup failed and the agent denied its browser capability

- Evidence: In a local chat, the user selected Izakaya Ginji from downtown San Mateo results, supplied two guests and September 28 at 6:00 PM, then asked to use browser inspection. The agent linked OpenTable but said the area could not resolve and falsely said it had no browser tool. The [Sentry trace](https://concierge-vn.sentry.io/explore/traces/trace/d71a4272f4644a08979b98ac14237f97) shows `reservations.find`, Geoapify geocoding, and Browserbase page searches, but no `sevenrooms.inspect` span.
- Cause or hypothesis: Geoapify returned other California downtowns for the plausible area input “downtown San Mateo, California”; adding San Mateo as the city returned the intended neighborhood. Sentry did not capture the model's exact area argument, so that part remains a hypothesis. The reservation adapter only opens an inspection browser for an exact SevenRooms page, so the OpenTable link was a lead rather than inspected inventory. The answer misstated this coverage limit as absence of a browser tool.
- Change: Normalize that observed downtown wording for geocoding and state the browser coverage limit in the intake prompt. Added the observed turn to the frozen Sentry snapshot eval with a tool-access truthfulness score.
- Verification: Live Geoapify queries showed the distinct geocoding results; `bun run check` passed. Braintrust scored the frozen turn at 0% for tool-access truthfulness with zero model or provider calls. A new live chat has not yet verified the revised response.
- Remaining limit: OpenTable availability is still not inspectable by the current adapter, and Sentry does not retain the exact tool arguments or outputs for this turn.

### 2026-09-27 — Old follow-up controls and unverified reservation calendars stayed in chat

- Evidence: The local transcript screenshot showed an answered date question with its reply form still visible, plus a new reservation calendar saying both “No verified times” and “Not checked for the requested date and party size.”
- Cause: The page rendered follow-up controls for every past tool result and built a reservation calendar from request parameters even when the provider returned no inspection.
- Change: Keep the old question in the transcript but render reply controls only for the current follow-up. Render a reservation calendar only when an inspection includes a check time and a times array, including verified empty results.
- Verification: `bun run check` and the existing calendar/text chat browser test passed. The specific live model conversation was not replayed.
- Remaining limit: A verified historical calendar remains visible but is disabled after a later turn; the agent's prose may still describe unsupported venues inaccurately.

### 2026-09-27 — Home page spent 270 ms loading the session

- Evidence: Sentry trace `3c67dfdeaff444afa2ec6d598e111ae5` showed a 428 ms local `GET /`; Better Auth's `get-session` took 270 ms, including separate Neon reads for session and user.
- Cause: The auth hook reads the database on every request because session cookie caching was disabled.
- Change: Enable Better Auth's signed session cookie cache for 60 seconds.
- Verification: `bun run check` passed. Two authenticated local `GET /` requests returned 200; the first set `better-auth.session_data` and took 468 ms to response headers, while the next used that cookie and took 162 ms. This is a local single-run comparison, not a production latency claim.
- Regression guard: Compare repeated authenticated `GET /` traces for `get-session` database spans and browser TTFB.
- Remaining limit: Session revocation on another device may take up to 60 seconds to take effect; this change does not remove the profile and page-load database reads.

### 2026-09-27 — Ai Fiori inspection intermittently returned candidate links

- Evidence: The same dated, two-person Ai Fiori live browser test reached verified times and checkout on one run, then returned a reservation link with “page inspection was unavailable” on the next. The failing run exposed no verified time buttons.
- Evidence from Sentry: The failed local `/api/chat` run reached `reservation.inspection_stage=verify_filters` and recorded a generic `Error`. The specific failing call or provider cause was not captured.
- Hypothesis: A call during date/guest filter verification failed. The trace does not establish whether snapshot access, page state, or another operation caused it.
- Change: Mark thrown inspection errors retryable for one agent retry, and record the failing operation and a bounded error code. The opt-in live test retains the failed transcript and Playwright page snapshot.
- Verification: The failing agent answer correctly said no times were confirmed. `bun run check` passes after the change; the next live inspection has not yet exercised the new diagnostic or retry.
- Regression guard: Run the live reservation test against a dated venue and inspect the `sevenrooms.inspect` stage when it fails.
- Remaining limit: One success and one failure do not establish a failure rate. Do not present this path as reliably available until repeated runs and stage-level traces agree.

### 2026-09-27 — Dinner search calendar offered breakfast

- Evidence: A live Ai Fiori search for two on September 28 described dinner times, while its calendar offered 7:00 am BREAKFAST. Selecting that option and continuing did not reach checkout.
- Cause: The browser inspection returns all visible times for the date and party. The calendar renders that set without the user's requested meal or time window.
- Change: Added an opt-in live browser test for search, selection, checkout handoff, and authenticated live-view redirect. A requested local time window now filters selectable provider times to that window plus 30 minutes on each side; nearby choices are labeled.
- Verification: The local live Ai Fiori test for September 28, 7–9 pm found a verified dinner time and reached the authenticated Browserbase live-view redirect after selection. No guest details or payment were submitted. The test does not assert that every out-of-window button is absent.
- Regression guard: [Ai Fiori snapshot](app/tests/snapshots.md) records the requested-window check. The live test currently verifies the dinner handoff, not exclusion of breakfast choices.
- Remaining limit: A Browserbase redirect establishes the live handoff, but the test does not independently compare every displayed time with the provider page or prove a completed booking.

### 2026-09-27 — Replayed place results blocked checkout follow-up

- Evidence: A live Ai Fiori search found verified dinner times, but clicking Continue to checkout returned HTTP 413 and “This chat is too long.” The checkout tool was never called.
- Cause: The client resent full tool results, including repeated place lists, and the chat route rejected the body above 32 KB.
- Change: Keep the visible transcript intact while sending at most 19 recent messages and up to 25 places in recent tool outputs; older tool outputs are omitted and follow-up questions remain. Raise the request guard from 32,000 to 128,000 characters so normal tool results can pass through to the server's bounded model-context projection. On HTTP 413, retry once with the last five messages' text and current selections while leaving the visible transcript intact.
- Verification: The three mocked chat UI tests passed; the same opt-in live search then reached the Browserbase checkout view without submitting a booking. After raising the guard, `bun run check` passed. A mocked browser run confirmed one smaller retry delivered the assistant response without removing earlier visible turns. A live request near the new limit has not been run.
- Remaining limit: A genuinely long text conversation can still hit the request-size limit; the model still receives a bounded projection of tool results, not the full request body. The compact retry may lose unselected older references, so the agent must ask or search again if needed.

### 2026-09-27 — Prior search results vanished on the next chat turn

- Evidence: After finding Amoura in South San Francisco, later questions lost the restaurant's listing context; the chat route replayed assistant prose but discarded place and reservation search outputs.
- Cause: The next model request rebuilt history from text and follow-up questions only. A place selection existed only when the user clicked a map pin.
- Change: Replay a bounded summary of recent place or reservation-page results as reference context. Carry weather and inspected times only while their check times are fresh; retain location or venue identity when they expire. Remove expired reservation choices from the calendar and offer a new check.
- Verification: Local two-turn chat listed Amoura, then identified the same South San Francisco listing and Mediterranean category on the follow-up. Freshness boundary checks, the existing reservation browser test, and a browser check that hides an expired time and shows “Check again” passed; `bun run check` passed.
- Remaining limit: This context lasts only within the open chat and is not server-authenticated evidence. It does not preserve a thread across reloads or prove live availability; checkout rechecks the provider.

### 2026-09-27 — South San Francisco rejected despite a valid Geoapify result

- Evidence: Local chat said it could not resolve South San Francisco, California. Geoapify returned that city and listed Amoura among its restaurants.
- Cause: The area matcher checked the full state name against a formatted address containing only `CA`.
- Change: Match a requested context against Geoapify's structured state, state code, or country as well as its formatted address.
- Verification: Local chat resolved South San Francisco, showed Amoura, identified its Mediterranean category, and answered a follow-up current-weather request. `bun run check` passed.
- Remaining limit: Place categories do not verify a restaurant menu or reservation availability.

### 2026-09-27 — Calendar selection snapped back

- Evidence: In local chat, choosing September 29 briefly opened its day view, then returned to the initial date/view.
- Cause: The shared calendar's prop-sync effect overwrote its own interactive date and view state.
- Change: Initialize local state from props once; remove the reset effect.
- Verification: Local follow-up kept September 29 selected and “Use date” sent `2026-09-29`; the time view accepted 11:30 and sent `11:30 AM on 2026-09-27`. `bun run check` and the existing reservation E2E passed.

### 2026-09-27 — Downtown Pittsburgh failed area resolution

- Evidence: A local reservation chat could not resolve `Downtown Pittsburgh, Pittsburgh`. Geoapify returned amenities for that wording but returned a Downtown suburb boundary for `Downtown, Pittsburgh`.
- Cause: The resolver required an exact neighborhood name and repeated the city in the provider query.
- Change: Collapse a repeated city suffix and accept a neighborhood plus city match.
- Verification: A local `places.search` chat resolved Downtown, Pittsburgh and displayed its mapped restaurant listings; this does not verify reservation times.

### 2026-09-27 — Bigham Tavern search stopped before availability inspection

- Evidence: In the local three-turn chat, the agent listed Mount Washington restaurants, found a Bigham Tavern reservation page, then could not verify a table for two right now. The matching Sentry trace shows two `reservations.find` calls and Browserbase search requests, but no `sevenrooms.inspect` span or error. A fresh SevenRooms search returned no exact Bigham Tavern match.
- Cause: `reservations.find` launches browser inspection only when a search result is an exact-name SevenRooms page and has an ISO date and party size. Other reservation pages remain uninspected candidate links. The trace does not record safe tool arguments or the branch outcome, so it cannot prove whether the model supplied the ISO date on the last turn.
- Change: Open; this RCA made no runtime change.
- Verification: Compared the live chat, the scoped Sentry trace, the adapter branch, and a fresh SevenRooms search. Browserbase search worked; no browser session was launched for this venue.
- Remaining limit: The prompt can request a search, but it cannot verify availability on a provider the current adapter does not inspect. Prior tool results are also removed from model history on the next turn, causing the agent to search again instead of retaining the candidate link.

### 2026-09-27 — Bigham Tavern uses Toast, which blocks the current browser session

- Evidence: Bigham Tavern's official reservation page links its Mount Washington location to Toast Tables. The public Toast guest page displayed date/party filters and reserve buttons in a normal browser, but a direct Browserbase/Stagehand visit reached Toast's security verification page instead of inventory.
- Cause: SevenRooms-only inspection cannot cover this venue, and the current Browserbase session cannot inspect Toast. Geoapify place data has no booking inventory.
- Change: Investigation only; no runtime change.
- Verification: Checked the official link, guest page, and one Browserbase visit for the same venue and date. No booking action was taken.
- Remaining limit: Area discovery can surface this venue and its official booking link, but the agent cannot truthfully show verified Toast times until an access path for this provider works.

### 2026-09-27 — Geoapify returned two West Village area candidates

- Evidence: A live geocode for `West Village, New York City` returned both a broad Manhattan result labeled as West Village and a West Village boundary; the first match displayed `Manhattan, New York`.
- Cause: The geocoder returns multiple matching features with different boundaries, and the first matching hierarchy is not always the intended area.
- Change: Prefer the candidate whose formatted name begins with the requested area, then search Geoapify Places within its `place_id` boundary. Replace Nominatim, Mapbox MCP, and Mapbox tiles with Geoapify search and map tiles.
- Verification: Live `places.search` returned 8 Mount Washington restaurants, 25 West Village restaurants, and 25 West Village cafés, each labeled with the intended area. The Geoapify dark map style returned HTTP 200; `bun run check` passed.
- Remaining limit: Venue results depend on Geoapify/OSM coverage and are capped at 25. A listing is not reservation availability; a full multi-area agent turn remains unverified.

### 2026-09-27 — MapLibre markers appeared before the new basemap

- Evidence: The local chat initially displayed Geoapify result pins over a black map, and the browser reported that the MapLibre worker failed to load.
- Cause: MapLibre v6 requires an explicit bundled worker URL under Vite.
- Change: Import its worker with Vite's `?worker&url` and set that URL before constructing the map.
- Verification: After a reload, the local agent returned Mount Washington listings, the browser rendered Geoapify's dark street tiles beneath the pins, and `bun run check` passed.
- Remaining limit: One local browser and one area were visually checked; the map key is browser-visible and should have provider-side usage limits before deployment.

### 2026-09-27 — Chat showed Markdown images as alt text

- Evidence: Assistant messages converted `![alt](url)` into text instead of displaying an image.
- Cause: A custom `markdown-it` image renderer escaped the alt text and discarded the image.
- Change: Removed the override so `markdown-it` renders images normally.
- Verification: Rendered Markdown contains an image element for a valid HTTPS URL; raw HTML remains escaped and unsafe URL schemes are not rendered as images. `bun run check` passed.
- Remaining limit: Remote image URLs supplied by the model are loaded by the viewer's browser.

### 2026-09-27 — Local chat message failed after reservation follow-up

- Evidence: The local chat showed “That message didn't go through” after the user supplied a party size and Tuesday preference. The matching Sentry chat trace contains a SevenRooms inspection warning at `verify_filters`.
- Hypothesis or cause: The inspection warning degrades reservation results but is caught by the adapter. The actual chat stream or transport error is still unknown because the stream handler logged no error type.
- Change: Record the stream error type and numeric provider status when available, without logging messages, provider responses, or credentials.
- Verification: The chat handler type-checks; a separate local browser check confirmed Enter sends and Shift+Enter inserts a line break. The failed request itself has not been reproduced.
- Remaining limit: The SevenRooms warning cannot yet be attributed as the cause of the failed send. Inspect the next failed chat trace or captured client request before changing the provider path.

### 2026-09-26 — Checkout handoff needs experience and browser capacity

- Evidence: Ai Fiori showed 7:15 pm under Dinner, Bar Fiori, and No Corkage Monday. The first prepare attempt stopped on that ambiguity. A later run advanced the selected Dinner slot to SevenRooms upgrades, where the next action was labeled “Next” and the upgrade total was $0.00. Further verification hit Browserbase HTTP 402: free plan browser minutes exhausted.
- Cause: Time alone does not identify the provider experience; Browserbase usage limits now block new sessions.
- Change: Include experience in the selected slot; recheck it before advancing; only advance past a zero-total upgrade screen; stop before guest details, payment, or final submit. Keep a successful live view behind an account-bound, expiring link.
- Verification: After Browserbase capacity was restored, a local chat run showed Ai Fiori dinner times for two on September 28, selected 7:30 pm Dinner, reached `checkout_ready`, and the signed-in view route returned a 302 to a live Browserbase session. The test session was released. A separate direct adapter run reached 7:15 pm Dinner checkout and confirmed its session was running before release.
- Remaining limit: No guest details, payment, or booking submission were attempted. The existing checkout screenshot is from a separate manual provider run.

### 2026-09-26 — Checkout session closed before live view

- Evidence: The handoff launched Browserbase with `keepAlive: true`, then called `browser.close()` in `finally`. The installed Stagehand browser handle releases its Browserbase session on `close()` even when created with `keepAlive`.
- Cause: `keepAlive` preserves the session after a disconnect; it does not override an explicit close.
- Change: Close failed handoffs immediately. Leave only a verified checkout session alive, with a five-minute provider timeout and a ticket that expires no later than that session.
- Verification: `bun run check` passed; the local chat-to-checkout run returned an authenticated live-view redirect, then requested session release.

### 2026-09-26 — Scene cards repeated the same composition

- Evidence: Five separate card images reused people seated at a table beneath similar lamps or windows; the repetition was visible in the local carousel.
- Cause: The initial artwork varied the mood but kept nearly identical framing.
- Change: Give Catch up, Date night, Take it easy, Weekend brunch, and Coffee catch-up distinct settings and viewpoints while retaining the ink-and-ivory style.
- Verification: The local home loaded the replacement artwork; all seven image paths are distinct and present, and `bun run check` passed.
- Remaining limit: These are editorial prompts, not real venue photos.

### 2026-09-26 — One unavailable Google calendar blocked all conflict checks

- Evidence: The authenticated local free/busy endpoint returned 503. Google's calendar list returned five calendars; free/busy succeeded for four and returned `notFound` for one.
- Cause: The endpoint treated any per-calendar error as a total failure.
- Change: Return intervals from the four readable calendars with `complete: false`. The UI labels non-conflicting times as an incomplete check rather than conflict-free.
- Verification: The local endpoint returned four checked calendars and `complete: false`; the reservation calendar displayed the partial status beside live Ai Fiori times.
- Remaining limit: The unavailable calendar could contain a conflict. No time is declared conflict-free until every listed calendar succeeds.

### 2026-09-26 — Selected reservation time cannot reach checkout through the agent

- Evidence: The local agent found verified Ai Fiori dinner times for two on September 28. After selecting 7:15 pm, a follow-up request to continue to checkout was correctly declined because no execution capability handles that step. Separately, a manual SevenRooms run reached checkout for the same time and party.
- Cause: `reservations.find` only searches and inspects; the selected slot is conversation context, not an executable provider handoff.
- Change: Open.
- Verification: The provider checkout showed the selected venue, date, time, and party, then stopped before guest details, payment, policy acceptance, or submission.
- Remaining limit: This is manual provider proof. Concierge itself still cannot advance a selected slot to checkout.

### 2026-09-26 — Empty chat framed every outing as dinner

- Evidence: The home screen said “Your kind of night,” and its cards and composer prompt only suggested dinner, despite the requested coffee use case.
- Cause: The initial scene set modeled five dinner moods and the place tool fixed Mapbox's restaurant category.
- Change: Remove the extra home copy, add coffee and brunch scenes, and allow a bounded café category in place and reservation searches.
- Verification: The local home showed daytime cards; a live Mapbox coffee category call returned café results; `bun run check` passed.
- Remaining limit: A café listing does not establish that it takes reservations; a SevenRooms café booking path has not been demonstrated.

### 2026-09-26 — Empty chat scenes were one cropped image and one visible card

- Evidence: The first local implementation used a five-panel image with CSS offsets; the signed-in user saw only one card because onboarding had one selected scenario.
- Cause: Image packing and a strict selected-scenarios filter made the scene UI less flexible than the intended small visual set.
- Change: Use individual image files per scene and show all scenes in the carousel, with onboarding choices first. A three-card limit was removed after it hid the remaining choices.
- Verification: The local home exposed all seven separate cards in the carousel; `bun run check` passed.
- Remaining limit: The extra scenes are editorial choices, not inferred restaurant matches or live availability.

### 2026-09-26 — Scene carousel motion and framing were too subtle

- Evidence: The local home showed three small cards with captions over the artwork; the requested Apple reference uses larger images with text outside the frame.
- Cause: The card sizing and gradient overlay dominated the small scroll-linked image shift.
- Change: Show two larger square image frames, put labels beneath them, and move the image within its clipped frame as the rail scrolls.
- Verification: The local browser showed the new framing at desktop and phone widths, all seven cards remained reachable by scrolling, and the phone frame measured 161 × 161 px.
- Remaining limit: CSS scroll-linked motion requires browser support; reduced-motion users receive static images.

### 2026-09-26 — Home composer did not visibly read as a squircle

- Evidence: The local home screenshot showed ordinary rounded corners after the shared squircle CSS change. In the live browser, the composer computed `corner-shape: superellipse(2)` but only a 19.6px radius.
- Cause: The curve was active, but the radius was too small relative to the composer's height to make the shape visible.
- Change: Increased the composer from `rounded-xl` to `rounded-4xl` and the send control from `rounded-lg` to `rounded-xl`.
- Verification: The local browser computed a 36.4px composer radius with `superellipse(2)` and the updated shape was visible in a screenshot.
- Regression guard: Inspect the local home composer at desktop width and confirm the computed corner shape and visible outline.
- Remaining limit: Browsers without `corner-shape` support use the larger ordinary rounded-corner fallback.

### 2026-09-26 — Concierge missed visible Ai Fiori dinner slots

- Evidence: Two local chat searches for two guests on 2026-09-28, 7–9 pm reported no verified times, while SevenRooms showed dinner slots. A traced chat call passed `restaurant: "Ai Fiori, New York City"` and `area: "New York City"`; the adapter returned only candidate links. The old extraction also included buttons under “Next available date” and missed collapsed “More times.”
- Cause: Exact venue matching rejected the redundant city suffix. Model-driven picker clicks were intermittent; page-wide time extraction mixed dates and experiences.
- Change: Strip the duplicated area suffix, load SevenRooms with its observed `date` and `party_size` URL filters, verify both selected controls, expand current-date cards, and read their visible time buttons by experience.
- Verification: A direct 2026-09-27 check returned Sunday Supper but no Monday-to-Saturday dinner times. A local chat check for 2026-09-28 returned the verified 7:15–9:00 pm dinner slots and named the experiences. After paid browser access, one general chat prompt rendered a calendar without the expected 7:30 pm Dinner button; a repeated prompt naming `reservations.find` showed it and completed the checkout handoff. `bun run check` passed.
- Regression guard: Repeat the Ai Fiori 2026-09-28 chat query and check that it lists selected-date dinner times; check 2026-09-27 never attributes next-date dinner buttons to Sunday.
- Remaining limit: The missing-button attempt was not diagnosed; provider UI changes or agent input choices can still break inspection. No booking was made.

### 2026-09-26 — Ai Fiori checkout requires guest details and payment method

- Evidence: A real SevenRooms slot for two on 2026-09-28 at 7:15 pm reached a temporary checkout hold; checkout showed guest fields and a Stripe payment field. See [proof/README.md](proof/README.md).
- Cause: This venue's checkout requires those details before submission.
- Change: Stopped at checkout and saved a viewport screenshot without personal or card details.
- Verification: The checkout showed the selected venue, date, time, and party; no reservation was submitted.
- Remaining limit: This is provider-path evidence, not an agent booking confirmation.

### 2026-09-26 — Mapbox restaurant search returned distant or weak matches

- Evidence: `restaurants in West Village, New York City` returned a restaurant in India and missed several local Italian restaurants.
- Cause: The app sent a generic restaurant query to Mapbox's named-place search without a location anchor; Mapbox recommends category search for generic place types.
- Change: Geocode the requested area, then run a restaurant category search near its center and within its bounds. Return Mapbox cuisine categories with each place.
- Verification: The local chat returned Via Carota, Palma, Rafele, and Fiaschetteria Pistoia for Italian restaurants in the West Village; Mapbox explicitly categorized all four as Italian.
- Regression guard: Repeat that query and check the returned coordinates fall within the resolved West Village bounds and cuisine claims come from `poi_category`.
- Remaining limit: Category search returns up to 25 nearby places; it is not an exhaustive restaurant catalog or reservation inventory.

### 2026-09-27 — Mount Washington search anchored to downtown Pittsburgh

- Evidence: `Mount Washington, Pittsburgh` resolved to the Pittsburgh city center in Mapbox, and its restaurant results clustered downtown while the reply named Mount Washington venues. A live Nominatim lookup resolved the neighborhood at 40.4309025, -80.0103312.
- Cause: The first Mapbox geocode result was accepted without checking that it represented the requested neighborhood. The UI also combined separate place searches into one map.
- Change: Resolve public areas through OpenStreetMap Nominatim, pass its center and bounds to Mapbox category search, and render each tool result as a labeled map. Keep selected place context tied to its area and show both data attributions.
- Verification: Live capability calls returned 25 venues in Mount Washington, including Shiloh Gastro, and 25 separate West Village venues, including L'Artusi. `bun run check` passed.
- Remaining limit: Public Nominatim allows at most one request per second across the whole app. The current queue and cache are process-local, so production traffic needs a hosted geocoder or shared limiter before deployment. Mapbox venues still do not prove reservation availability.

### 2026-09-26 — SevenRooms inspection can fall back to links

- Evidence: A local reservation probe hit a dynamic iframe/CDP error during Stagehand inspection. On production, two Ai Fiori searches for 2 guests on 2026-09-27 returned a candidate page but no inspected times. A fresh local Browserbase run selected that date and party, though Stagehand logged transient frame errors.
- Hypothesis or cause: The page's dynamic iframe changes while the browser client inspects it; the precise production failure stage is unconfirmed. Ai Fiori labels dinner as Monday to Saturday, while the requested date was Sunday.
- Change: The reservation capability catches inspection failures and returns candidate links without claiming availability. Local instrumentation now tags the failed inspection stage and error type in Sentry without storing page or account data.
- Verification: A local Ai Fiori probe reached the selected date and party and extracted times, but the page also showed "Next available date" times; those extracted times are not verified for the requested date. Both production probes failed to inspect.
- Regression guard: Repeat a dated venue query and check that the response either contains times verified against page buttons or labels the links as uninspected.
- Remaining limit: Time extraction must distinguish selected-date buttons from "Next available date" buttons before any extracted time can be treated as availability; no booking flow has been proven.
### 2026-09-27 — Reservation eval missed agent decisions

- Evidence: The previous Braintrust eval supplied provider facts inside a single prompt, so it could not score `search`, `execute`, per-stop arguments, or a selected-time checkout. The first tool-use run scored 60% on grounded times and 80% on response state.
- Cause: Single-response cases bypassed the agent loop. Two new scorer failures were measurement errors: curly apostrophes in “can’t verify” and a checkout time selected by the user were marked wrong.
- Change: Replayed seven synthetic cases through the current intake prompt and two public tool schemas in `app/tests/reservation.eval.ts`; corrected those scorer checks. Kept Braintrust out of `app/src`.
- Verification: `bun run check` passed; the local eval and final Concierge Braintrust experiment scored 100% on six deterministic checks across seven synthetic cases.
- Remaining limit: The score change came from scorer corrections, not an app behavior fix. This eval does not cover real provider pages, chat transport, or production traces.

### 2026-09-27 — Browser inspection was restricted to SevenRooms

- Evidence: Sentry trace `103b1071632c4f4a8099c45ba48913aa` found Izakaya Ginji's OpenTable page but never inspected it. Search preferred SevenRooms, inspection and checkout required a SevenRooms URL, and the prompt described other providers as unsupported. Combined place/page outputs also returned early during context extraction, losing the booking link on later turns.
- Cause: Provider-specific navigation was embedded in the shared reservation capability, while conversation references and live inventory were handled as one output branch. Browserbase credentials were present; the destination never reached the browser.
- Change: General discovery plus an optional user-requested provider; prefer the conversation's prior public booking URL. Reuse Stagehand act/extract for bounded controls, redirects, filter verification, expanded times, and checkout across providers. Keep both mapped places and booking references. Loading shells receive a short reread; failed filters expose selected-date/guest diagnostics. Checkout rechecks the chosen time as well as date/party, and unnamed seating remains unnamed. No new browser framework or collector.
- Verification: The authenticated local chat trace `1d49c41541e74f41aa9abe583fc0638d` attempted OpenTable inspection, retried once after a date-control error, and rendered 6:30/6:45/7:00 PM for four on September 28, plus separately labeled nearby times. A direct OpenTable inspection took 39.6 seconds; shared SevenRooms inspection verified Ai Fiori dinner times in 35.1 seconds. Shared OpenTable checkout took 63.1 seconds and reached the matching guest-details/review screen, then the verification script released the session without entering details or submitting. Svelte check and four existing chat/calendar/expiry checks passed.
- Evaluation: Added the real development-verification Sentry capture to `app/tests/sentry-snapshots.json`. [Braintrust judged the frozen observations](https://www.braintrust.dev/app/whentor/p/Concierge/experiments/observed-reservation-snapshots-2e220285) with zero LLM/provider calls. The new named-venue check passes; the earlier failing capture remains, so their applicable aggregate is 50%. Different captures are not evidence of a controlled improvement rate.
- Remaining limit: One OpenTable date-control exception and an earlier SevenRooms filter mismatch occurred; the precise SDK exception cause was not retained. Dynamic page changes, blocks, incomplete inventory, and model control selection remain fallible. The complete prior-reference multi-turn journey and other providers are not demonstrated by these directed checks. The shared checkout stops before final submission; no reservation was made. No deployment.

### 2026-09-27 — Follow-up controls had competing owners

- Symptom: The Turkish restaurant conversation asked for guest count after receiving September 28 at 4 pm, but showed a September 27 date/time picker, an inline reply form, and the footer composer.
- Evidence: User screenshot; `followup` accepted `calendarView` without an answer type, `FollowupWidget` always mounted a second text form, and the page could render a follow-up calendar alongside verified reservation times.
- Cause: Presentation was chosen independently of the missing detail. The tool contract did not constrain calendar ownership; two forms owned free-text replies. The exact model call behind the screenshot was not retrieved.
- Change: Add a bounded responseType to the existing follow-up contract; reject calendars for text/partySize questions. Ignore incompatible or legacy calendar settings in the client. The footer owns free text through the existing reply guard; inline controls retain choices/date/time only. Verified reservation times own the calendar when present. Prompt asks for one missing detail and passes the known date into time questions.
- Verification: Actual capability loaded through Vite rejected a partySize calendar, accepted a partySize reply without a calendar, and preserved September 28 on a time question. Existing browser calendar/text test passed with one calendar, no extra textbox, and no duplicate sends. Svelte check passed with zero errors/warnings. ESLint reports seven existing errors; identical rules fail on the unchanged HEAD versions of both Svelte files.
- Remaining limit: Prompt adherence for the original live conversation was not replayed. A model can still mislabel a question's answer type; the runtime validates the declared contract, not natural-language meaning. No provider search, booking, deployment, or additional service was added.

### 2026-09-27 — Follow-up choices and calendar presets were underspecified

- Symptom: User clarified that guest counts and other categorical questions must retain their own option UI, and calendars must start from the conversation's date and time.
- Evidence: Option buttons still existed but choices were optional; partySize had no fallback. The follow-up contract had a date field but no time preset, and CalendarView always initialized time to an empty string.
- Change: Keep separate choice buttons with A/B/C/D labels; provide guest-count defaults when choices are omitted, and instruct the agent to supply relevant categorical choices. Add validated HH:mm presets alongside the existing date, pass them through to the calendar, and update the local inputs when preset props change. A selected date provides a client fallback. Free text remains available in the footer.
- Verification: Svelte check passed with zero errors/warnings. The existing browser test passed for option clicks, guest counts without a calendar, one verified-times calendar, and a September 28/16:00 preset. The actual capability runtime preserved presets, supplied guest options, and rejected 25:00.
- Remaining limit: Browser checks used streamed tool fixtures, not a replay of the original conversation. A date/time typed only in chat still requires the model to pass the known values in the follow-up tool call. No booking or deployment.

### 2026-09-27 — Browser preview attached to a blank tab

- Symptom: The live preview tile and expanded view could remain blank while reservation inspection ran.
- Evidence: A live local OpenTable check rendered, establishing that the failure is intermittent. In a controlled Browserbase session with `about:blank` plus an active Example Domain page, the existing view route selected the blank page; the local iframe screenshot was empty. The provider's live-view documentation confirms separate URLs per page.
- Cause: Preview publication preceded Stagehand attachment/navigation, and the route used the session's default debugger URL rather than the inspected page's URL. CSS cropped and scaled the debugger instead of using its supported navbar setting.
- Change: Publish after navigation, sign the inspected page ID into the existing account-bound ticket, and resolve that exact page for inspection and checkout views. Use `navbar=false` for previews and remove CSS cropping. Expiry, authentication, read-only preview behavior, and session release remain intact.
- Verification: The same two-tab runtime probe now redirects to the inspected page's socket and visibly renders Example Domain in the local preview. All probe sessions were closed. `bun run check` passed with no errors/warnings; the existing follow-up browser regression passed. The existing opt-in live checkout check now asserts its exact page binding.
- Limit: The original screenshot's trace was not identified, so another provider or viewer failure could also have contributed there. The modified checkout assertion was not run against live booking inventory this turn. No booking or deployment was performed.

### 2026-09-27 — Concierge sounded like a cautious intake form

- Symptom: User reported repeated criteria questions, blaming a party of four for an unsuccessful check, conflicting venue explanations, and availability replies padded with hold/freshness disclaimers. They clarified that warmth and initiative across the conversation matter more than swapping “visible” for “available.”
- Cause: The prompt emphasized technical blocks and collecting date/party details without explicitly requiring discovery progress first. Its brief voice instruction competed with repeated evidence/hold language.
- Change: Update the existing intake prompt to acknowledge preferences naturally, discover before collecting every detail, avoid reconfirming clear guest-count answers, keep checked venues distinct, and offer a grounded next step. Keep inspection failures distinct from no availability and move routine caveats out of the conversational voice. Document this intent in the existing reservation spec.
- Verification: Svelte check passed with zero errors/warnings. One actual authenticated local chat requested Italian in downtown San Mateo without date/party details; the model called places.search with the Italian constraint before responding “Tomatina is an Italian option downtown at 401 South B Street. What day are you thinking?” No booking or browser inspection was requested in this check.
- Limit: One live discovery turn is not proof of consistent tone or the full booking conversation. That response asked its date question in text rather than using the existing followup capability. Provider failures and the intermittent blank browser preview remain separate unresolved issues. Model, tool contracts, freshness validation, and checkout authority were unchanged; no synthetic scoring or deployment.

### 2026-09-27 — Calendar follow-ups exposed every depth

- Symptom: User clarified that month/day/time is an agent-selected enum for the unresolved detail, rather than three tabs presented on every clarification. A known date should lead directly to a time picker.
- Cause: The tool already accepted calendarView, but CalendarView used it only as an initial tab. Follow-ups retained all view tabs and the redundant date input; its day view showed a personal-calendar timeline rather than day selection.
- Change: Reuse CalendarView with a progressive follow-up mode: month-only native input submits YYYY-MM without inventing a day, day selection submits one full date, and time selection keeps the known date fixed. Retain separate categorical choices. Validate date/time view compatibility and require a date for a time picker; update the existing prompt and spec to select depth from unknowns. Reservation-result browsing retains its existing controls.
- Verification: Svelte check passed with zero errors/warnings. Extended the existing browser regression with streamed tool observations: month-only and day-only replies each submit once, time retains September 28/16:00 without tabs or a date input, and categorical choices and verified-time selection still pass. git diff --check passed.
- Limit: Browser verification uses controlled streamed tool outputs, not a live-model conversation. The agent must still resolve ambiguous language and supply the correct enum and presets. No provider inspection, booking, or deployment.
