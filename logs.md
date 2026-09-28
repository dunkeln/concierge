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

### 2026-09-27 — Repeated place searches duplicated maps

- Symptom: User screenshots showed two San Mateo maps with overlapping venue cards and the follow-up question repeated in the footer.
- Cause: The page mounted a map for every completed place-search output. MapWidget drew pins only at mount, preventing existing maps from receiving updated results. The footer used the full follow-up question as its placeholder.
- Change: Derive one latest place result per resolved area, anchored to its first message. Update markers and cards in the existing map; skip redraws for unchanged results, retain separate areas, and clear maps on empty results. Use a short reply placeholder. Original tool outputs remain available to model context.
- Verification: Svelte check passed with zero errors/warnings. Browser regression passed for duplicate searches within one turn, updates across turns preserving the map canvas, replaced markers and selection context, distinct areas, empty results, and new-chat reset. Existing follow-up/calendar browser check passed.
- Limit: Verification used streamed tool fixtures and a local map style, not the original model conversation. Area identity uses the provider's resolved area label; differently named areas remain separate. No provider calls, booking, or deployment.


### 2026-09-27 — Live browser preview opened without a click

- Symptom: The expanded browser popup appeared automatically when reservation inspection started; user requested explicit opening and assigned preview rendering regressions to another agent.
- Cause: BrowserPreviewStack called open() on mount, so the first live-session event also opened a modal and moved focus.
- Change: Remove only the mount-time open call. Keep the existing preview trigger, dismissal, focus restoration, session lifecycle, and rendering behavior.
- Verification: A local browser check with a streamed session fixture stayed collapsed, opened after clicking the preview, then closed on Escape and restored trigger focus. This does not prove provider video rendering.
- Limit: Blank previews and loader readiness remain with the other agent. No provider calls or deployment.

### 2026-09-27 — Basemap was monochromatic

- Symptom: The user reported that the map inherited the app's monochrome appearance and was difficult to read visually.
- Cause: MapWidget explicitly selected Geoapify's dark-matter basemap; no parent desaturation filter was found.
- Change: Use the existing provider's colored osm-carto style. Keep dark cards, attribution, and map interactions.
- Verification: Svelte check passed with zero errors/warnings. A local browser probe using a synthetic place result loaded the live style successfully and showed colored water, parks, roads, and labels in Pittsburgh.
- Limit: The visual probe did not exercise a live model search; existing unrelated work remains uncommitted. No deployment.

### 2026-09-27 — Cuisine was lost before reservation inspection; embedded preview remained blank

- Symptom: Turkish or Mediterranean in downtown San Mateo led through three date/guest questions to a Japanese venue check and a request to broaden the area. Assistant questions appeared on the user's side. The live browser preview was blank.
- Evidence: [Actual chat trace](https://concierge-vn.sentry.io/explore/traces/trace/2447abd5613c436fbb351e2dfb35732d), 13 captured model outputs, and the user's screenshot. Every reservation search supplied cuisine; none supplied a named restaurant. The final turn took 42.56 seconds, with 33.34 seconds spent inspecting Ginji. The captured category identifies Ginji as Japanese; the final answer acknowledges the mismatch. No time was selected and checkout was not authorized.
- Cause: findReservationPages omitted cuisine from its web query, then inspected the first area-only result once date and party were present. Message alignment depended on tool results instead of speaker. Separately, a fresh in-app-browser check showed the embedded viewer blank while the same signed exact-page viewer rendered OpenTable when opened directly. Removing local and provider redirect hops did not resolve embedding; its underlying cause remains unconfirmed.
- Change: Validate and retain cuisine in booking-page search, require a named venue before inspection, and tell the agent to reuse discovery and try accepted cuisine alternatives before widening the area. Keep assistant text left and answer controls right. Add an open-in-tab preview fallback; remove the unsuccessful redirect-resolution trial. Preserve the failed user journey in the existing frozen Braintrust cohort, with reusable cuisine propagation, venue-fit, and named-inspection scores plus failure-family metadata.
- Verification: Runtime assertions on the actual reservation adapter passed for cuisine propagation, unnamed-inspection prevention, and invalid cuisine rejection. Svelte check and the existing calendar/text and rolling-map browser regressions passed. [Braintrust frozen scoring](https://www.braintrust.dev/app/holdthatheat/p/Concierge/experiments/observed-reservation-snapshots-9058cf84) reports cuisine arguments 100%, inspected venue fit 0%, and named inspection 0% for this failure, with zero model/provider calls during scoring. The separate direct-view browser probe displayed OpenTable without choosing a slot or submitting a booking.
- Remaining limit: These frozen scores diagnose the pre-fix capture; they do not prove improved live model behavior. The full cuisine-specific multi-turn journey has not been replayed after the fix. Embedded preview remains unresolved in the in-app browser; the fallback bypasses that rendering failure. Tool positional bias is untested. No booking or deployment.

### 2026-09-28 — Blank embedded inspection preview replaced with streamed browser frames

- Symptom: The preview remained blank during real reservation inspection after page-binding fixes.
- Evidence: Sandbox/referrer changes, keeping the iframe mounted, and resolving the provider redirect could render an idle probe but did not consistently render active inspections. The exact provider viewer failure remains unconfirmed.
- Change: Capture JPEG frames through the existing Stagehand connection at inspection steps and send them as transient chat events. Render the latest frame in the thumbnail and expanded preview; remove iframe loading heuristics. Keep explicit opening, Escape/focus restoration, account-bound external view, and inspection closure. Frames do not enter model context or persisted transcript; the client bounds individual frames to two million characters. No new service or dependency.
- Verification: A real Izakaya Ginji/OpenTable inspection showed the provider date picker in the expanded local preview, changed frames during inspection, and disappeared on session closure. No slot or booking was submitted. Screenshot: `app/tests/local/concierge-preview-streamed.png`. Svelte check passed with zero errors/warnings. The browser regression passed for frame decoding/update, explicit opening, Escape/focus restoration, and closure.
- Replay: The original four-turn cuisine journey now checks SAJJ Mediterranean with cuisine retained; repeated discovery and partial-date errors remain captured separately in trace `004c89256da445ef9e50ae503056dca6`. Frozen Braintrust run `observed-reservation-snapshots-7ad67e49` completed successfully.
- Limit: Frames update at inspection steps, not continuous video. One measured frame was about 170 KB; the existing twelve-action bound permits up to thirteen captures per inspection. External viewer reliability remains separate; no production deployment or successful booking is claimed.

### 2026-09-27 — Carousel verification blocked by local home error

- Symptom: The existing map regression could not find the composer; local home rendered HTTP 500 during concurrent chat-persistence work.
- Cause: Not established in this slice. Svelte checking separately reports an unrelated chat stream-outcome type error and four persistence warnings.
- Verification: An isolated browser run mounted the real MapWidget and checked sourced cuisine/address, exact cuisine match, sparse results, card-to-pin and pin-to-card selection, and mobile overflow. Desktop and mobile renders were inspected; no provider or model calls.
- Limit: The full chat-to-map regression remains blocked by home loading. Carousel work adds no provider fields or availability claims; no deployment.

### 2026-09-27 — Carousel gradient intercepted mobile pin clicks

- Evidence: The isolated mobile browser check found the decorative gradient intercepting a selected pin after viewport resize.
- Change: Only cards and credit links receive pointer events in the overlay; selecting a venue explicitly centers its pin above the carousel. Reduced-motion users get immediate camera and carousel movement.
- Verification: The same browser probe passed card/pin selection in both directions, selected-card visibility at 390px, and no page overflow. Uses synthetic place data and a local style, not live provider inventory.

### 2026-09-28 — Month replies and continuation after ordering-only venues

- Symptom: Selecting a month sent YYYY-MM to a full-date reservation field; the agent retried discovery and a rejected picker call. An area-and-cuisine request stopped after SAJJ's ordering-only page.
- Cause: The progressive calendar emits a month, while followup only accepted full-date presets. Prompt guidance alone did not reliably keep months out of reservation lookup. Continuing within already authorized area/cuisine constraints was underspecified.
- Change: Accept valid month presets for month/day followups, anchoring the calendar display to day one without choosing a booking date. Route month-only reservations.find calls directly to the existing day followup before network calls, and stop on any returned followup. Keep full-date validation for booking/time checks. Explicitly continue to another matching booking destination or venue, retaining date and guests; preserve requests for one named venue.
- Verification: Local runtime assertions passed for valid month presets, invalid month/day rejection, month-only time/booking rejection, and reservation-to-day-picker routing. Real configured-model replay with synthetic provider output continued from ordering-only SAJJ to another matching venue. A real four-turn chat replay checked SAJJ, then Hummus Mediterranean Kitchen, then Hummus's separate reservation page, retaining September 29 and four guests; no times were verified or booking submitted. A later real month reply produced the September day picker without an invalid-date error. Svelte check passed with zero errors/warnings. All scripts, exact captures, and logs are in gitignored app/tests/local/.
- Limits: The model still sometimes repeats discovery without invalid arguments. The existing calendar browser regression timed out on the disabled Send button during concurrent chat UI/persistence work; it does not establish a picker failure. Earlier HTTP 500/type-check blockers cleared during this turn. No deployment.

### 2026-09-27 — Durable chat threads and editable preferences

- Symptom: Refreshing the app discarded chat transcripts and selected context; completed onboarding preferences could not be edited. A first-message browser check also exposed a transcript reset when invalidation reloaded the original root URL after a shallow history update.
- Cause: Chats lived only in the client SDK. There was no thread/message storage or history navigation. The first save needed a real navigation to its persisted thread URL rather than invalidation of the previously loaded root page.
- Change: Add owner-scoped Neon chat tables, indexed paged history, atomic turn claims/completion, user-before-generation and assistant-after-completion writes, disconnect stream consumption, and a collapsible desktop/mobile chat sidebar. Load bounded model context from storage; keep explicit session selections in the thread and edit durable preferences through the existing onboarding form. Preserve timestamps and exclude reasoning, signed browser tickets, browser sessions, and frames from storage.
- Verification: Applied the additive migration on a Neon verification branch, then the configured app database. Actual two-turn chat restored both speakers and remembered the earlier request. Actual composer/refresh/thread-switch/mobile-dismissal and unchanged-preference save roundtrip passed. Aborting the browser request still saved the assistant; a concurrent turn and a duplicate completed message were rejected. Missing threads and invalid cursors were rejected; unsigned requests followed the existing login boundary. Existing map, calendar/text, and streamed-preview browser regressions passed (3 tests); Svelte check passed with zero errors/warnings and production build passed. Runnable probes and screenshots are in ignored app/tests/local/.
- Limit: Preexisting ephemeral conversations cannot be recovered. Model context is bounded to 19 recent messages; older transcript history remains accessible without summarization. Deployment and real reservation booking are separate gates. The additive migration assumes the existing auth/profile/passport tables.

### 2026-09-28 — Real browser journeys linked to Sentry and Braintrust

- Symptom: API replays bypassed a previously disabled composer, and UI failures lacked a shared browser/Sentry/eval capture.
- Change: Reuse installed Playwright, Sentry, and Braintrust. Add serial opt-in live month → day → guests reservation journey, automatic local capture of committed requests/completed SSE evidence/browser exceptions, screenshots/video/traces on failure, and a UUID shared with server traces and test failure events. The live command reports unexpected failures to Sentry in environment e2e, scores the frozen case in Braintrust even after a failed test, and preserves the failing exit status. Cases and all authenticated artifacts remain in ignored app/tests/local/; no browser artifacts or raw network payloads are uploaded. New measurement scores browser completion, transport, exceptions, and full-date arguments separately; missing evidence is null.
- Verification: Existing calendar/text (12 replies) and streamed-preview browser regressions passed. A real four-turn San Mateo cuisine journey submitted exactly four replies, completed month/day/guest handoffs, then timed out at 300 seconds waiting for the fourth response body. Three responses finished; the fourth returned HTTP 200 but its captured body remained incomplete. Six browser exceptions said document is not defined. The first run was conducted while concurrent home/profile changes introduced separate type errors, so their contribution is unconfirmed.
- Evidence: Run 3336d9ba-9680-47a2-adcb-16651827263e, local case app/tests/local/first-live-e2e.json, dated trace/screenshots under app/tests/local/e2e-runs/2026-09-28T02-57-01-271Z/. Sentry ingestion independently verified as https://concierge-vn.sentry.io/issues/JAVASCRIPT-SVELTEKIT-F (event 8ae0aa01eeef430faa32b129180cc651). Matching trace https://concierge-vn.sentry.io/explore/traces/trace/a975d29c5eef40f4a81aaae59e7bf80f shows the final agent span ending in 41.1 seconds, including two reservation checks. This narrows the next investigation to the response/persistence/client boundary after generation; it does not establish why the body never completed. Frozen failure scoring published at https://www.braintrust.dev/app/holdthatheat/p/Concierge/experiments/observed-browser-journeys with zero model/provider calls during scoring.
- Limits: This implements evidence capture, not a repair of the new stream failure. The initial date score only covered completed streams; it now returns null for missing pending evidence. No inventory or booking was asserted, no submission occurred, and no deployment. Reused development server can still receive concurrent HMR changes; isolate future controlled comparisons from edits.
- Final measurement verification: two mocked UI regression captures plus the independently preserved real failure were scored in https://www.braintrust.dev/app/holdthatheat/p/Concierge/experiments/observed-browser-journeys-2026-09-28T03-10-33-687Z. The incomplete real stream now has a null date score, not a pass. Mixed mocked/live aggregate percentages are not a model quality estimate. Final Svelte check cleared with zero errors/warnings after concurrent profile edits settled.

### 2026-09-28 — Recover committed chat turns after failed delivery

- Symptom: The browser waited indefinitely after “4 guests” even though the agent span had ended. Reading the original owner-scoped thread confirmed all eight messages, including the final assistant reply, were saved. The original trace's six browser exceptions came from Vite's CSS HMR handler inside a worker, not the map component's marker code.
- Cause/boundary: Durable completion and browser delivery were conflated. Browser fetch had no delivery deadline; recovery depended on receiving the chat response headers, and equal assistant IDs could suppress restoration of interrupted content. Concurrent development edits also contaminated the test runtime. The exact reason the original socket stopped delivering is not established; successful persistence rules out a lost commit for that incident.
- Change: Bound browser delivery to 210 seconds; recover the owner-scoped stored thread after disconnect/timeout without resending generation; permit saved content to replace an errored client message even when IDs match. Keep navigation scoped to the current thread. Live E2E now builds and owns a production preview on port 5183 with matching ORIGIN and asserts the browser origin, avoiding HMR or silent canonical redirects. No new dependencies, workflow engine, provider-write retries, or database migration.
- Observed corrective failure: The first recovery check exposed my use of Number.MAX_SAFE_INTEGER as a history cursor, which exceeded PostgreSQL's integer position range and returned 500. Corrected the recovery cursor to 2147483647 and rejected larger cursors at the API boundary. The preserved failed case is app/tests/local/lifecycle-first-verification.json; Sentry event 626f55cb1d9f4c3e95dd08af932c5e27 belongs to JAVASCRIPT-SVELTEKIT-H. This is a schema/range mismatch, separate from the original delivery failure.
- Verification: The real four-turn journey passed in 88.1 seconds, with four complete streams and refresh/composer checks. Real-backend failure injection after durable save passed for lost headers and interrupted content with the original assistant ID; both recovered, survived refresh, rejected the invalid cursor, and made exactly one generation request. Final rechecks of the narrower restoration guard passed in 6.1 and 6.4 seconds. Three existing map, calendar/reply, and streamed-preview regressions passed. Build passed. Generated Playwright report JavaScript initially polluted type checking; excluded tests/local from the existing SvelteKit-generated TypeScript configuration while preserving its defaults.
- Evidence: Final cohort app/tests/local/lifecycle-final-cohort.json; production journey trace 154ee205478741b58ef9315e820190c7; final recovery traces 0c51594a79e342f1be06053b4e023bca and e36ffe756c7d4ea58685bfbc4c2d58f0. Frozen Braintrust results: https://www.braintrust.dev/app/holdthatheat/p/Concierge/experiments/observed-browser-journeys-2026-09-28T03-34-16-473Z. Deliberately broken transport scores null; durableResponseRecovered separately scores the recovery assertions. E2E issues JAVASCRIPT-SVELTEKIT-F and JAVASCRIPT-SVELTEKIT-H marked resolved after successful replays.
- Limits: This verifies local browser delivery recovery after a real durable commit, not server restart recovery, available inventory, booking submission, or deployment. Local cancellation does not prove server/provider work stopped. Stored turn ownership still controls concurrency. Authenticated artifacts and cases remain ignored inside the project.
- Final check: Svelte check passed with zero errors and warnings after concurrent preferences icon edits settled; git diff --check passed. The final frozen cohort scored each applicable journey/recovery criterion at 100%, with transport and date criteria null where intentionally inapplicable. These three cases establish their named boundaries, not a general reliability rate.

## 2026-09-27 — Avatar menu dismissal

- Symptom: The account menu remained open after selecting Passport and clicking outside it.
- Cause: The layout used native `details`; it had no outside-click or selection dismissal behavior.
- Fix: Replace it with the installed Bits UI DropdownMenu primitive used by shadcn-svelte. Keep account actions, submit sign-out through the existing POST form, and let the primitive own selection, Escape, focus, and outside-click dismissal.
- Verification: Authenticated browser check passed outside click, Escape, Passport selection, keyboard opening, and intercepted sign-out POST with no browser errors. Runnable local check: `cd app && node tests/local/account-menu-check.mjs`.

### 2026-09-27 — Passport hierarchy and loose chat selections

- Symptom: Merged preferences repeated the full onboarding form inside a narrow card stack, while selected place/date actions floated above the composer.
- Evidence: Local desktop screenshot showed preferences occupying the entire first viewport; the visit ledger and save action were pushed below it.
- Change: Widen passport into adjacent preference/ledger sections with a compact-screen stack, shorten preference labels, remove outer card framing, and use a segmented travel control. Place selected context inside the composer with independent accessible removal actions; keep checkout and session-cuisine behavior.
- Verification: Source Svelte check passed with zero errors/warnings. Local browser probe passed mocked transcript → map/time selection → independent clearing, Enter submission, mobile overflow, and actual unchanged-preference save/inline validation. Screenshots were inspected at 1100px and 390px; desktop Save is visible. Runnable probe: app/tests/local/ui-polish-probe.ts.
- Limits: Synthetic place/time data checks UI behavior, not live inventory or checkout. No push or deployment.

## 2026-09-27 — Shared chat sidebar

- Symptom: Passport had no chat sidebar; history navigation belonged only to the home page.
- Cause: The page owned the sidebar and explicitly excluded passport mode.
- Fix: Move the sidebar, pagination, and thread-list load to the authenticated layout. Keep transcript state in the home page and guard navigation away from an active reply.
- Verification: Local authenticated browser check passed passport/preferences visibility, reopening history, new chat, mobile dismissal/width, and anonymous login exclusion with no browser exceptions. Svelte check passed with zero errors/warnings. Runnable check: app/tests/local/sidebar-layout-check.mjs.

## 2026-09-27 — Personal home invitation

- Symptom: The empty home chat showed scene cards without a personal invitation.
- Cause: Saved cuisine and outing preferences ordered cards and informed searches, but supplied no home greeting.
- Change: Add one reactive line above the carousel using the account first name and up to two saved cuisines, with outing/general fallbacks. Hide it when chat begins; reuse loaded data with no extra generation or provider call.
- Verification: Runnable app/tests/local/welcome-prompt-check.mjs passed saved/custom cuisine, duplicate, outing, missing-name, homepage, mobile text bounds, and saved-transcript checks with no browser exceptions. Svelte check passed with zero errors/warnings after concurrent preference edits resolved their icon type errors.
- Remaining limit: This is a preference invitation, not retrieved venue recommendations. The mobile carousel still produced document overflow with this line hidden; the greeting did not alter its width.

### 2026-09-27 — Preference taxonomy and carousel containment

- Symptom: Cuisine preferences were restricted to five hard-coded entries, and the first gradient-carousel browser check exposed horizontal page overflow.
- Cause: Server validation treated suggestions as an exhaustive taxonomy; native fieldset sizing and an unpositioned visually hidden checkbox let carousel content escape its container.
- Change: Searchable suggestion picker with removable selections and bounded custom cuisine names; labeled static CSS gradient atmosphere tiles with native checkbox state, selection cap, local scroll, and focus feedback. Constrain fieldset sizing and position each tile's hidden input.
- Verification: Source Svelte check: zero errors/warnings. Authenticated local browser probe passed keyboard atmosphere selection, cuisine search/custom addition/removal/cap/Escape, invalid server submissions, mobile containment, and real save/reload. Original preferences restored. Runnable check: `cd app && bun tests/local/gradient-preferences-probe.ts`.
- Limit: Gradients are static CSS inspired by Paper, without WebGL animation. No push or deployment.

### 2026-09-27 — Social sign-in visibility

- Symptom: Sign-in presented stacked “Continue with” text actions in a constrained passport panel, making providers difficult to discover.
- Change: One compact row of locally served monochrome Google, Apple, and GitHub brand icons with accessible provider labels, native submit forms, 44px targets, and visible disabled states. Preserve the server's provider/configuration checks.
- Verification: Source Svelte check passed with zero errors/warnings. Anonymous local browser probe verified loaded icons, enabled-provider form submission with correct provider (intercepted), and mobile containment. Apple is disabled by the current local HTTPS requirement. Runnable check: `cd app && bun tests/local/oauth-icons-probe.ts`.
- Limit: This checks entrypoint presentation and form routing, not OAuth callback completion. No push or deployment.

### 2026-09-27 — Memory entry felt administrative

- Symptom: Renaming “Record a visit” left a disclosure, boxed fields, dropdown, and separator-heavy passport layout; the user rejected the interaction itself.
- Change: Replace the disclosure with an always-open memory composition, reactive colored stamp, borderless place/date fields, and native radio-backed color swatches. Remove passport section/list divider rules and empty explanatory filler; retain explicit save and existing owner-scoped actions.
- Verification: Local authenticated browser probe passed reactive stamp, keyboard scene selection, mobile containment, and real temporary memory save/removal. Temporary entry removed. Source Svelte check passed with zero errors/warnings. Runnable check: `cd app && bun tests/local/memory-composition-probe.ts`.
- Limit: Manual memories remain distinct from booking proof. No push or deployment.

### 2026-09-27 — Hidden chat context compression

- Symptom: The persisted transcript kept older messages, but model context silently discarded everything beyond 19 messages.
- Change: Replace the count cutoff with a rolling summary and position watermark in existing server-private thread context. Use the model's cached reported window or an operational override, a default 60% threshold, conservative UTF-8 sizing, and reserved tool/output space. Summarize complete older exchanges without tools; preserve recent turns, corrections, references, and historical evidence boundaries. Save under the turn lease and strip summaries from page data. No schema migration or transcript deletion.
- Verification: Live local 64K-budget probe passed summary persistence, original 50-message transcript retention, earlier allergy and corrected cuisine/party recall, hidden page data, and reuse on the next turn (52 messages). The two-turn path including compression took 13.2 seconds. Temporary thread removed. Runnable probe: `cd app && node --env-file=.env --env-file-if-exists=.env.local tests/local/context-compression-check.mjs` with a separate dev server using `CHAT_CONTEXT_WINDOW=65536 CHAT_CONTEXT_FRACTION=0.6` on port 5174.
- Observed corrective failure: A 32K probe left too little room after the system prompt and tool reserve, so the second turn summarized again. Reject budgets with insufficient summary headroom; the 64K probe confirmed reuse. The initial probe's Bun/Playwright transport and off-origin auth endpoint were harness failures; the final probe uses Node and the existing local session.
- Limit: Byte sizing is conservative, not an exact model tokenizer; compression may trigger early. Summaries are lossy, while original messages remain stored. Metadata discovery adds a cold request (cached one hour); summary calls add latency and model input/output cost only at compression. A failed summary stops the attempt without dropping history, and very large single exchanges or in-turn tool outputs remain a separate budget limit. No deployment or Braintrust case ingestion.

### 2026-09-27 — Saved memories expanded the passport

- Symptom: Saved records formed a growing list below Save memory.
- Change: Replace the inline collection and heading count with one circular count below Save memory. Existing Bits UI popover reveals records on demand with bounded internal scrolling; save/remove actions unchanged.
- Verification: Local authenticated runtime probe passed hidden records, keyboard opening, real save/delete and count 0 → 1 → 0; temporary record removed. Source Svelte check: zero errors/warnings. No deployment.


### 2026-09-28 — Diagnose the original five-minute body-reader stall

- Symptom: The first live journey timed out in Playwright response.text() after the fourth reply, despite a completed agent span and stored answer. Earlier notes called this an unexplained socket stall; that attribution was too strong.
- Evidence: Sentry trace a975d29c5eef40f4a81aaae59e7bf80f records the final agent completing in 41.1 seconds with zero trace errors. The original Playwright recording has the fourth request at 21.783 seconds, a new main-frame document load at 40.469 seconds during concurrent development updates, and the restored thread's polling response at 64.130 seconds reporting pending=false and all eight saved messages. The reload's HTML retains the date and guest replies; the screenshot change was a scroll reset, not erased history. Later document reloads are also recorded. Timeline extracted into ignored app/tests/local/socket-rca.json.
- Cause: A document reload discarded an in-flight browser fetch. With the installed Chromium/Playwright, response.text() for that old SSE response remains pending without requestfailed or requestfinished being delivered to the test. The test awaited that old response rather than the restored UI, until its 300-second deadline. A native Node HTTP SSE + Playwright browser reproduction establishes the same behavior without the model, Neon, Browserbase, Sentry instrumentation, or Vite: the unchanged-page control completes; the reload leaves the raw reader pending after seven seconds. This establishes the timeout mechanism, not an indefinitely open server socket. The recording does not preserve which edit or reload initiator caused the original document reload.
- Fix: Keep the previously isolated production preview for live journeys. Reuse one body reader in the journey and evidence fixture that rejects immediately on a main-frame document navigation, records bodyError, and maps the event to execution.page_replaced_during_delivery in Sentry/Braintrust. Add an actual-backend pending-turn reload check: reload after headers, recover the stored user message and eventual assistant reply through existing polling, enable Send, and assert exactly one generation request. No application/provider rewrite was needed for this timeout.
- Observed corrective failure: My first reload assertion rejected the successfully restored word because Markdown added a trailing newline. Its real failed capture remains app/tests/local/socket-reload-failure.json, run 31ee3a78-c97c-44ac-a648-7c97888bed43, Sentry event fab3db474ae24b0cb55340ca88829b4b / JAVASCRIPT-SVELTEKIT-J. Allow surrounding whitespace, preserving the exact word check. Issue J was verified ingested and resolved after the successful recheck; this was a test assertion failure, not an agent/recovery failure.
- Verification: Native reproduction and guarded-reader assertions passed. Full real cuisine journey passed in 63.8 seconds, run 38f1ea42-3cbf-42d5-b302-7d567f575d1c, trace 9a88ea61dbda43d2b573627041eba011. Pending real-turn reload recovery passed in 5.1 seconds, run 94200d79-ad65-43f0-bf5b-39f789af26ed, trace 2191937654494b9b8aac1f190a480fdc. Svelte check passed with zero errors/warnings; production build and git diff --check passed. Reproduction, cases, and authenticated browser artifacts remain ignored inside app/tests/local.
- Evaluation: Original frozen observations remain unchanged. A derived four-case cohort adds the confirmed navigation failure family to the original failure and preserves the failed assertion plus both final successes: app/tests/local/socket-diagnosed-cohort.json. Published with zero additional model calls at https://www.braintrust.dev/app/holdthatheat/p/Concierge/experiments/observed-browser-journeys-2026-09-28T03-55-46-145Z. Its mixed before/after aggregate is not a reliability estimate. Intentional reload transport is null; durable recovery is scored independently.
- Limits: The exact edit initiating the original reload was not captured. The final cuisine trace also contains the caught Reservation browser inspection failed warning, JAVASCRIPT-SVELTEKIT-K; this did not prevent response completion and is separate from the body-reader timeout. No availability, booking submission, or deployment is asserted.

### 2026-09-28 — Calendar connection visibility

- Symptom: Calendar consent appeared as explanatory prose in the home scene surface rather than a persistent compact control.
- Change: Put an icon-only 32px white squircle with a black Google logo left of the avatar on home/passport (44px Connect hit area), with an accessible Connect action before consent and a small Lucide green check at its bottom right for existing scoped consent, without a backplate. A muted calendar tile sits vertically behind it as decoration. Remove the redundant home prompt. No Apple Calendar or Gmail integration is represented.
- Verification: Source Svelte check clean; authenticated header, connected/disconnected rendered states, keyboard native POST interception, anonymous absence, and passport mobile containment passed in tests/local/calendar-header-probe.ts. No OAuth permissions granted.
- Limit: Stored scopes indicate authorization, not token health. The broader probe fails home document containment: scene-carousel descendants extend document width to 616px at 390px, while the header fits x=20–370. That separate overflow remains. No deployment.

### 2026-09-28 — Icon dependency hot reload failed

- Evidence: Existing local dev server returned HTTP 500 after installing @lucide/svelte, while a fresh diagnostic server with identical source returned 200. Restarting the original development server restored /login to 200.
- Hypothesis: The existing dev process retained stale dependency/SSR state. No production configuration changed. Diagnostic server stopped; normal local server remains on 5173.

### 2026-09-28 — Cheap tester-readiness sweep and tool-selection evaluation

- Scope: Reuse installed Playwright, production preview, existing chat persistence, Sentry, and Braintrust. Twenty cheap cases cover browser/HTTP contracts; seven opt-in live checks cover a four-turn journey, four delivery faults, concurrent/replayed messages, and four serial tool probes. Normal readiness uses thirteen successful generation requests; frozen scoring adds no model/provider calls. Auth/database reads and provider/title work have their own costs; dollar usage is not captured. Cases, auth and traces remain gitignored inside app/tests/.
- Observed application failure: A clean SSE EOF with a partial assistant carrying the committed message ID left the UI unfinished, although storage held the full answer. The restore effect skipped matching IDs without comparing content. Reconcile saved content even for equal IDs and preserve a same-thread draft. Real reproduction failed before repair and passed after repair with one generation request. Sentry P was independently verified and resolved.
- Observed application failure: The expanded preview's custom Tab handler trapped focus on Close, making the fallback link inaccessible. Reuse native dialog modal focus/inert behavior and explicit tabindex=0 on the link and close button. Chromium and WebKit reproduce and verify keyboard access, Escape and trigger focus restoration. WebKit exposed both directions separately; keep those failed cases. Sentry Q was verified and resolved after the final WebKit suite.
- Observed validation gap: Chat accepted 99:99 PM in selectedSlot.time. Enforce a valid 12-hour clock at intake, before persistence/model work. Checkout already rejected invalid minutes; no successful booking exploit was demonstrated. Real HTTP rejection checks pass.
- Harness failures separated from application failures: Pre-hydration actions sent zero requests; wait for hydrated Send. An anonymous request followed a correct 303 redirect and looked like 200; inspect the redirect directly. An originless calendar POST was correctly rejected by production CSRF; send the actual application origin. Bun/Playwright relative-URL cookie parsing failed on a read-only request while Node returned 200; live capture now runs under Node. The old 413 fixture asserted a removed automatic compact retry; align it with newest-message-only input and explicit retry. Sentry M/N/S/V were verified and resolved after narrow rechecks.
- Measurement repair: Playwright --list could overwrite the latest evidence with an empty cohort; skip reporter writes with no cases and verify preservation by hash. A stale-times test ended after counting the recheck request, before reading its reply; retain that incomplete capture and await its finish frame. These are capture/contract issues, not proof that a model or provider stalled.
- Verification: Chromium cheap cases passed sixty executions over three repetitions. WebKit cheap cases passed twenty executions after focus repair. Actual four-turn cuisine journey passed in 57.2 seconds; pending reload, lost delivery, interrupted delivery and clean EOF recovery passed without regeneration. Concurrent identical requests produced 200/409 and one stored answer; subsequent identical or altered reuse returned 409. Existing authenticated browser/provider checks do not submit any booking or calendar event.
- Agent evaluation: Four real probes preserve no-tool / missing-location / exploration-only / named-reservation intent, with paired results required for execution proof. Applicable structural scores pass; thirty labeled positive/negative/null calibration checks pass. Named Izakaya Ginji, October 5, four guests, 18:00–20:00 produced five provider-observed times in 52.32 seconds, trace e3e90cb2621c40babb036d8d6507a9c7. Sentry independently confirms provider inspection consumed 40.976 seconds of a 50.198-second intake span. This timestamped observation is not current inventory. Tool experiment: https://www.braintrust.dev/app/holdthatheat/p/Concierge/experiments/tool-selection-observed-2026-09-28T04-23-01-662Z. Historical ten-case failures: https://www.braintrust.dev/app/holdthatheat/p/Concierge/experiments/observed-browser-journeys-2026-09-28T04-33-48-892Z.
- Limits: search currently advertises the permitted catalog without filtering its query. No matched direct-tool baseline establishes an efficiency advantage. Process restart can leave a lease pending for ten minutes; no worker resumes it. K's original provider exception lost its cause in generic warning telemetry; a later successful candidate does not establish that cause. Real fresh social login, calendar token health, second-account isolation/revocation, provider checkout, deployment, arbitrary provider changes and two-day soak remain separate gates. The concurrently observed home scene overflow at 390px is recorded above and is outside the tested reservation-widget containment. See app/tests/readiness.md for commands and proof boundaries.

- Final verification: Corrected stale-times completion captured both requests/replies in three passing production runs. Final Svelte check: zero errors/warnings. Final 47-case frozen evaluation has 100% applicable contract/browser/transport/recovery scores: https://www.braintrust.dev/app/holdthatheat/p/Concierge/experiments/observed-browser-journeys-2026-09-28T04-39-04-117Z. Latest successful cohort is a proof record, not a reliability estimate.

### 2026-09-28 — Follow-up labels and calendar hierarchy

- Symptom: Guest choices read as letter-prefixed bare numbers; calendar controls repeated date context and crowded small inputs inside nested surfaces.
- Cause: The reply widget added letter prefixes, and the shared calendar gave its date header, duplicate date field, and time input competing emphasis.
- Change: Keep natural agent-authored choices, normalize bare guest counts only for party-size replies (including stored messages), and remove letter prefixes. Month follow-ups use a twelve-month grid with year navigation; day follow-ups retain the compact day grid; time uses a prominent native field with a quiet date caption. Reservation browsing keeps its three views and calendar conflict evidence, with date editing in Day and a single calendar surface.
- Verification: Existing twelve-reply calendar/text browser regression passed. Ignored calendar-polish-probe.ts passed twelve desktop/mobile scenarios covering presets, exactly one reply per commitment, disabled controls, and busy/incomplete/unavailable evidence; screenshots inspected. No provider calls, consent, or booking writes in these checks.
- Limit: Native time field appearance follows the browser. These checks cover local UI with synthetic tool/calendar results, not live provider availability or deployment.

### 2026-09-28 — Named restaurant lookup stopped at map listings

- Symptom/evidence: Saved user thread 3da9868f-ec50-48e6-8853-7402eb288479, assistant positions 9 and 11, used places.search for an opinion about selected Izakaya Mai. Downtown-area geocoding failed; the plain-city retry returned nearby listings without that venue. The agent asked for a link. The next request used reservations.find and found the official website, but missing booking filters prevented page inspection. There was no recorded standalone page fetch in either turn: the capability gap and stopping decision explain the unanswered lookup. Original transcript retained ignored in app/tests/local/latest-user-lookup-transcript.json. The same thread also carried Japanese into an explicit SAJJ request and produced repeated area-alias errors.
- Minimal path: Add places.lookup to the existing search/execute catalog, using installed Browserbase SDK search.web and fetchAPI.create. One search returns at most five public HTTPS sources; up to two page reads return at most 12,000 characters each, checked time, status and source URL. Each provider request has a fifteen-second timeout, no automatic retries, no redirect following, no insecure TLS or submitted forms. No geocoding/date/guest dependency and no browser-session startup. Failed page reads preserve the remaining sources; headers, credentials and raw error payloads are excluded. Sentry spans separate search/fetch, with bounded error class/HTTP status on exceptions.
- Agent instruction: Use named lookup before requesting a link for an absent map listing; ground claims in actual readings rather than titles; ignore external instructions. An explicit venue overrides an earlier conflicting cuisine. This instruction change does not independently establish every SAJJ turn is corrected. Existing booking discovery/inspection and nearby maps are unchanged.
- Verification: Two real production-browser lookups passed in 10.1 and 9.7 seconds. Both called places.lookup, read official restaurant content, completed the chat, rendered a response, and avoided reservation inspection/date/guest arguments. First official page returned 200 with 2,970 content characters; a second source returned 307 and remained unread. Independently fetched Sentry traces d756fd04b24e44c6b377f3f6c42b6155 and 502a5a6a32de49f49f66f40289d3ba73 report zero errors. First lookup boundary took 1.456 seconds: search 764ms, parallel reads 691/664ms. Final production build passed; Svelte check has zero errors/warnings. Runnable regression: cd app && RUN_LIVE_JOURNEY=1 bunx playwright test tests/lookup.spec.ts.
- Evaluation: https://www.braintrust.dev/app/holdthatheat/p/Concierge/experiments/named-restaurant-lookup-2026-09-28T04-47-13-001Z preserves two historical failed choices and two successful live replays. Scores separately measure named lookup selection, actual successful page content, and avoiding reservation inspection for an information request. The historical request text is reconstructed from selected venue/context and labeled; stored tool calls/results remain source evidence. Persisted historical turns are not scored as observed SSE delivery. Mixed 50% lookup/content scores reflect deliberately retained before/after rows, not a reliability estimate or matched stochastic comparison. Scoring uses no judge/model calls.
- Limits: Search links do not establish restaurant identity or live reservation availability. Reading two returned pages may omit a menu or current review content; blocked/redirected pages stay explicit. Named lookup bypasses the observed geocoding failure; it does not fix all downtown aliases. No provider booking, deployment, or comprehensive SAJJ replay was performed.

### 2026-09-28 — Menu extraction joined unrelated source fragments

- Symptom/evidence: The first live Amoura menu check extracted many candidate dishes but only one passed grounding. The source was the readable official `amourasf.com/menus/` page.
- Cause: The extractor prepended distant section headings to item quotes. Those reconstructed snippets were not contiguous source excerpts, so validation rejected them.
- Change: Menu extraction requires contiguous item excerpts and omits optional section labels when they are outside the quote. Exact source checks remain; invented fields are excluded. The capability reuses named lookup and makes one bounded extraction call, with no browser session startup or selection-triggered model call.
- Verification: The second live capability check returned 20 source-verified dishes in 10.8 seconds with one extraction call (7,458 input / 1,602 output tokens). Local desktop/mobile menu probes cover compact disclosure, selection/removal, no automatic sends, next-turn provenance, disabled controls and containment. Profile probe checks account-scoped bounds and deduplication; existing calendar/reply regression passed; source check is clean.
- Limit: Public excerpts may be partial or dated; inaccessible/PDF menus remain unverified. Taste evidence is bounded explicit interest from saved chat selections, not a visit, an order, or inferred dietary facts. Mocked browser/profile checks are separate from the live adapter check. No deployment.

### New-chat questionnaire replay — 2026-09-28

- User requested a visible replay of the prior reservation and named-restaurant questions. Created app chat `226334fd-a867-47e9-948d-7e0a0b11202a` through the existing browser. Saved transcript and screenshot inside ignored `app/tests/local/new-chat-questionnaire-*`.
- The AX quick-choice action targeting “3 people” submitted “2 people”; this is an observed automation targeting discrepancy, not proof of a product guest-count defect. Corrected through text before the SAJJ lookup. Thus this is a similar journey, not an exact controlled replay.
- Ginji showed no verified times within the requested 3 pm window. SAJJ correctly omitted the earlier Japanese cuisine and used party size 3, but returned `filter_mismatch`; the assistant stopped without pursuing another reservable restaurant. This remains an observed continuation failure; no fix made in this replay turn.
- Both Mai information follow-ups used `places.lookup`. One fetched Foodnut successfully (200), then another fetched Restaurantji successfully (200); each independently encountered an Uber Eats 301 without following it. The assistant attributed old/directory information and warned about listed 6 pm opening hours. No reservation inspector used for either information question.
- Browser visibly completed all five responses, one map updated in place. No booking made. Screenshots showed that manual scrolling was needed to reach later responses; scroll-follow behavior not diagnosed.

### One actionable calendar picker — 2026-09-28

- Symptom: Month/Day/Time tabs mixed preference entry with provider slot selection. A follow-up picker was suppressed whenever the turn had any inspection, even an empty result; later chat messages left historical controls disabled without clear purpose.
- Minimal repair: CalendarView renders only the model-selected month, day or time mode. Removed the tab switcher, unused daily timeline and duplicate date field. Date/time follow-ups take priority in the same turn; historical inspections render a plain summary. Native time entry stays distinct from provider-verified slot buttons. Month-only reservation-picker replies clear selectedDate and ask for a day instead of selecting an invented booking date.
- Accessibility: Kept full-date/month accessible names, native input validation, 44px targets and focus indicators; return focus to the footer on a widget reply. No silent selection or timed automatic submission. Existing polite response announcements and expiry/recheck safety remain.
- Prompt: Ask a brief, warm time-flexibility follow-up when it helps after absent checked slots; preserve known date/time presets, check day availability when time is optional, and never infer a picked slot from silence. UI changes use existing capabilities and native controls; no dependencies or extra judge calls.
- Verification: Production Chromium and WebKit focused calendar/expiry checks pass (two each); Svelte check zero errors/warnings. Extended month-only reservation/date selection checks also run locally. An editing regression briefly removed the day grid and was caught by the browser test, restored before completion. Two earlier test failures concerned fixture text/whitespace assertions. All evidence stays in ignored app/tests/local.
- Live proof: Saved chat 226334fd-a867-47e9-948d-7e0a0b11202a position 13 called followup with responseType=time, calendarView=time and date=2026-09-28. Browser showed one native time field and the question “What time would you like me to check for 3 people on September 28?”; left it waiting for the user. Captured single-picker-live-transcript.json and single-time-picker.png. The model omitted its earlier time preset in this observed turn, so the field is blank; no arbitrary time was chosen. This verifies one requested adjustment follow-up, not every spontaneous missing-slot decision or provider booking.

### Reservation checkout submission gate — 2026-09-28

- Observed first real attempt: Ai Fiori on October 5, two guests, 7–9 pm returned verified OpenTable times. Clicking 7 pm then generated a redundant selection-message model turn; Continue to checkout remained disabled beyond the test's 30-second wait. Test termination interrupted that turn, so this does not establish the underlying model delay or an independent socket failure. Failed run retained in app/tests/local/e2e-captures/b002b942-3655-4284-a3fe-1c43cfb1ada9.json.
- Minimal fix: Choosing a verified slot updates local selection and focuses the composer without sending a model turn. Continue to checkout submits the selection through the existing authenticated chat boundary. The preparation capability still rechecks venue/date/guests/time and stops before guest/payment details or final submission. No provider adapter or booking automation added.
- Verification: Production Chromium calendar/reply and expiry regressions passed. Real browser journey passed in 2.4 minutes: Ai Fiori, October 5, 7 pm, two guests, OpenTable guest-details/review. Independently attached Playwright to the retained provider session, verified venue and blank first/last-name fields, and captured the actual review page showing matching date, time, guest count, card/cancellation terms and Complete reservation. No guest/card details entered and no booking submitted; test releases its browser session. Svelte check: zero errors/warnings.
- Sentry independently reports zero errors in trace e56f176c042e412c8dcc6abdf44fe208. Frozen Braintrust preserves failed-before and successful-after cases with separate browser/transport scores: https://www.braintrust.dev/app/holdthatheat/p/Concierge/experiments/observed-browser-journeys-2026-09-28T05-42-15-397Z. No judge/model calls for scoring.
- Limits: This proves a named-venue local production journey, not every provider/cuisine discovery path. The earlier SAJJ continuation failure remains separate. Current changes have not been deployed or exercised on the hosted link; fresh-login/calendar health and full booking confirmation remain separate gates. Recording is sped up for README use; raw authenticated test evidence remains gitignored inside app/tests/local.
- Recorded repeat: The same live checkout journey passed again in 1.9 minutes with two chat requests (trace 815bfb2e5f754f04808ae5aba7019567). Retain successful opt-in checkout videos as well as failed ones. Created proof/reservation-journey.gif from the accelerated actual app recording, its handoff screenshot and the real provider review screenshot; inspected representative frames. README embeds the GIF and links provider/evaluation evidence. Final booking remains untouched.

### README preview image mismatch — 2026-09-28

- Observed: Codex README preview displayed the previous white evaluation card beside the updated latency paragraph, and a literal closing details tag. The referenced SVG on disk contained the new transparent latency plot.
- Hypothesis: the viewer retained the image at its reused path; its Markdown rendering did not handle the details wrapper consistently.
- Fix: gave the latency chart a distinct filename and updated both documentation links; removed the HTML details wrapper. No application behavior changed.
- Verification: checked the linked asset exists, parses as SVG, contains the expected latency title and no background rectangles; README contains no details tags. Native preview refresh still needs visual confirmation.
