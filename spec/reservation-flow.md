# Reservation flow

## Outcome

A signed-in user describes a restaurant reservation in chat. Concierge finds real, current availability on one reservation platform, shows the available times for the requested date, party, and time window, and attempts the chosen booking only after the user confirms its details.

## First slice

- Support one reservation platform end to end. SevenRooms is the current integration target; Mapbox supplies restaurant discovery only, never availability.
- Accept a named restaurant or a public neighborhood, date, party size, and optional time window. Ask for a missing detail only when it blocks a reliable search or booking.
- Search actual reservation inventory. Show every time exposed for the selected filters, including times behind expansion or pagination. Associate each time with its restaurant, date, party size, platform, and check time.
- Distinguish verified availability from candidate restaurant links, partial results, and unavailable searches. Never infer open times from map data or page titles.
- Before the final booking action, show the exact restaurant, date, local time, party size, and any material terms; require the user's explicit confirmation for that selection. If payment details are required, stop before entering or submitting them.
- Report the provider's outcome accurately. A clicked button is an attempt, not a confirmed reservation. Preserve a redacted confirmation or final confirmation screen as evidence of a real attempt; if a booking is made for a demo, cancel it promptly.

## Operating boundaries

- Use the user's own reservation account when authentication is required. Keep credentials and provider tokens out of the repo, chat transcript, traces, and screenshots.
- Keep chat session state transient. Persist only account data already needed for sign-in and any minimal booking evidence the user explicitly chooses to retain.
- Log the request stage, provider call, elapsed time, result count, and failure category without private payloads. Measure search and booking latency and estimate provider, browser, model, and hosting cost per attempt.
- If the provider blocks access, changes its UI, or returns uncertain data, stop claiming availability and show the failure clearly.

## Current proof gap

The local code can discover candidate reservation pages and inspect some visible SevenRooms times. It does not yet prove a complete time list, retain a browser session through booking, submit a booking, or provide booking evidence. These are the acceptance gaps for this slice.
