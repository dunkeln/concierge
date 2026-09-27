# Snapshots

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

## Partial calendar and failed chat send

Observed 2026-09-26/27: one Google calendar was unavailable during free/busy lookup, and one reservation follow-up showed “That message didn't go through.”

- With one calendar unavailable, show known busy intervals and mark the overall conflict check incomplete; do not call any other time conflict-free.
- If a reservation inspection warns, still deliver the chat response when the transport succeeds. If the send itself fails, expose Retry and keep the user's text for a retry. Diagnose provider inspection and chat transport as separate failures.
