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

### 2026-09-26 — Concierge missed visible Ai Fiori dinner slots

- Evidence: Two local chat searches for two guests on 2026-09-28, 7–9 pm reported no verified times, while SevenRooms showed dinner slots. A traced chat call passed `restaurant: "Ai Fiori, New York City"` and `area: "New York City"`; the adapter returned only candidate links. The old extraction also included buttons under “Next available date” and missed collapsed “More times.”
- Cause: Exact venue matching rejected the redundant city suffix. Model-driven picker clicks were intermittent; page-wide time extraction mixed dates and experiences.
- Change: Strip the duplicated area suffix, load SevenRooms with its observed `date` and `party_size` URL filters, verify both selected controls, expand current-date cards, and read their visible time buttons by experience.
- Verification: A direct 2026-09-27 check returned Sunday Supper but no Monday-to-Saturday dinner times. A local chat check for 2026-09-28 returned the verified 7:15–9:00 pm dinner slots and named the experiences. `bun run check` passed.
- Regression guard: Repeat the Ai Fiori 2026-09-28 chat query and check that it lists selected-date dinner times; check 2026-09-27 never attributes next-date dinner buttons to Sunday.
- Remaining limit: The agent does not continue into checkout or make a booking; provider UI changes can still break card inspection.

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
