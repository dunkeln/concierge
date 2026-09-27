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

### 2026-09-26 — SevenRooms inspection can fall back to links

- Evidence: A local reservation probe hit a dynamic iframe/CDP error during Stagehand inspection. On production, two Ai Fiori searches for 2 guests on 2026-09-27 returned a candidate page but no inspected times. A fresh local Browserbase run selected that date and party, though Stagehand logged transient frame errors.
- Hypothesis or cause: The page's dynamic iframe changes while the browser client inspects it; the precise production failure stage is unconfirmed. Ai Fiori labels dinner as Monday to Saturday, while the requested date was Sunday.
- Change: The reservation capability catches inspection failures and returns candidate links without claiming availability. Local instrumentation now tags the failed inspection stage and error type in Sentry without storing page or account data.
- Verification: A local Ai Fiori probe reached the selected date and party and extracted times, but the page also showed "Next available date" times; those extracted times are not verified for the requested date. Both production probes failed to inspect.
- Regression guard: Repeat a dated venue query and check that the response either contains times verified against page buttons or labels the links as uninspected.
- Remaining limit: Time extraction must distinguish selected-date buttons from "Next available date" buttons before any extracted time can be treated as availability; no booking flow has been proven.
