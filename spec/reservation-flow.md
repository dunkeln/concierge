# Reservation flow

## Outcome

A signed-in user describes a restaurant reservation in chat. Concierge finds real, current availability on one reservation platform, shows the available times for the requested date, party, and time window, and stops at the provider's final confirmation or payment screen.

## First slice

- Support one reservation platform end to end. SevenRooms is the current integration target; Mapbox supplies restaurant and café discovery only, never availability.
- Include café reservation requests when the provider has inventory; a café listing alone is not bookable.
- Accept a named restaurant or a public neighborhood, date, party size, and optional time window. Ask for a missing detail only when it blocks a reliable search or booking.
- Search actual reservation inventory. Show every time exposed for the selected filters, including times behind expansion or pagination. Associate each time with its restaurant, date, party size, platform, and check time.
- Distinguish verified availability from candidate restaurant links, partial results, and unavailable searches. Never infer open times from map data or page titles.
- Show the exact restaurant, date, local time, party size, and any material terms before handoff. Stop before final booking submission or payment entry.
- Preserve a redacted final confirmation or payment screen as evidence of the provider path. Never describe reaching that screen as a confirmed reservation.
- Let a signed-in user separately connect Google Calendar. Read free/busy across accessible calendars and mark estimated conflicts beside visible times, without exposing event details to the agent or creating calendar events.

## Operating boundaries

- Use the user's own reservation account when authentication is required. Keep credentials and provider tokens out of the repo, chat transcript, traces, and screenshots.
- Keep chat session state transient. Persist only account data already needed for sign-in and any minimal booking evidence the user explicitly chooses to retain.
- Log the request stage, provider call, elapsed time, result count, and failure category without private payloads. Measure search and booking latency and estimate provider, browser, model, and hosting cost per attempt.
- If the provider blocks access, changes its UI, or returns uncertain data, stop claiming availability and show the failure clearly.

## Current proof gap

A local chat-to-checkout run showed checked SevenRooms times for Ai Fiori, selected a Dinner experience, reached provider checkout, and returned an authenticated live-view redirect. The test browser was then released. A separate manual screenshot shows the provider checkout screen. No guest details, payment, final confirmation, or completed booking has been attempted; complete capture of every provider time remains unproven.
