# Reservation flow

- Find and show all verified times for the requested date, party size, and window. Distinguish live availability from candidate places and incomplete searches.
- When a time window is given, keep exact matches distinct from verified times up to 30 minutes nearby. Retry a failed supported-page inspection once; a booking link alone never establishes availability.
- Keep place identity across turns. Expire time-sensitive observations by their check time: reservation times after 60 seconds and current weather after 10 minutes; recheck before checkout or a new claim of current availability. Expired facts stay in the visible transcript as history, not as selectable times or live evidence.
- If a chat request is too large, retry once with recent text and the user's selected place, date, and time. Keep the visible transcript; if the retry fails, show the failure without claiming the request was handled.
- Search by venue, neighborhood, or named public origin. Show origin and destination pins; use travel time for “nearby.” Explore neighborhoods as areas with sourced context, not unsupported scores.
- Rank eligible place listings by the requested venue and sourced cuisine category, then use explicit preferences as a tie-break. Apply the evidence and feedback rules in [recommendations.md](recommendations.md).
- Fit includes ambiance and the requested room, section, or table. Claim a seat is selectable only when the provider offers it. If a call is needed or online details cannot be verified, show a verified reservation number and what to ask.
- The agent calls `followup` through `execute` to ask a blocking question and end its turn. The question is its own assistant bubble; reply controls and any calendar sit beside it as separate surfaces in the same turn. The right-aligned controls accept free text and optional choices. When useful, the agent chooses an initial month, day, or time calendar view. Reservation results can use the same views for verified times and personal conflicts. Committed choices trigger one reply and remain context; browsing alone does not submit.
- Authorized calendar access may mark conflicts without exposing event details or creating events.
- Before handoff, show venue, date, local time, party size, and terms. Stop before final booking submission or payment; never claim a booking without confirmation.
