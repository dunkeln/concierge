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

### 2026-09-27 — Ai Fiori inspection intermittently returned candidate links

- Evidence: The same dated, two-person Ai Fiori live browser test reached verified times and checkout on one run, then returned a reservation link with “page inspection was unavailable” on the next. The failing run exposed no verified time buttons.
- Hypothesis: The inspection branch failed after finding the SevenRooms page. The test output does not identify whether launch, navigation, filter verification, or extraction failed; no cause is established.
- Change: Open. The opt-in live test retains the failed transcript and Playwright page snapshot for diagnosis.
- Verification: The failing agent answer correctly said no times were confirmed. Mocked UI tests passed, and `bun run check` found no diagnostics.
- Regression guard: Run the live reservation test against a dated venue and inspect the `sevenrooms.inspect` stage when it fails.
- Remaining limit: One success and one failure do not establish a failure rate. Do not present this path as reliably available until repeated runs and stage-level traces agree.

### 2026-09-27 — Dinner search calendar offered breakfast

- Evidence: A live Ai Fiori search for two on September 28 described dinner times, while its calendar offered 7:00 am BREAKFAST. Selecting that option and continuing did not reach checkout.
- Cause: The browser inspection returns all visible times for the date and party. The calendar renders that set without the user's requested meal or time window.
- Change: Added an opt-in live browser test for search, selection, checkout handoff, and authenticated live-view redirect. Kept the product behavior unchanged pending a scoped time-filter design.
- Verification: The corrected test selected a 7–9 pm time and reached a Browserbase live-view redirect; no guest details or payment were submitted.
- Regression guard: [Ai Fiori snapshot](app/tests/snapshots.md) records the requested-window check. The live test currently verifies the dinner handoff, not exclusion of breakfast choices.
- Remaining limit: A Browserbase redirect establishes the live handoff, but the test does not independently compare every displayed time with the provider page or prove a completed booking.

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
