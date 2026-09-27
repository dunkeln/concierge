# Reservation flow

- Find and show all verified times for the requested date, party size, and window. Distinguish live availability from candidate places and incomplete searches.
- Search by venue, neighborhood, or named public origin. Show origin and destination pins; use travel time for “nearby.” Explore neighborhoods as areas with sourced context, not unsupported scores.
- Fit includes ambiance and the requested room, section, or table. Claim a seat is selectable only when the provider offers it. If a call is needed or online details cannot be verified, show a verified reservation number and what to ask.
- The agent calls `followup` through `execute` to ask a blocking question and end its turn. Its right-aligned widget accepts free text and optional choices. A calendar can answer date or time questions. Committed choices trigger one reply and remain context; browsing alone does not submit.
- Authorized calendar access may mark conflicts without exposing event details or creating events.
- Before handoff, show venue, date, local time, party size, and terms. Stop before final booking submission or payment; never claim a booking without confirmation.
