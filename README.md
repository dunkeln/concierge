<div align="center">concierge</div>

Restaurant reservation agent take-home, in progress.

Live app: https://concierge-pearl.vercel.app

The app provides account creation, login, onboarding, and an authenticated chat. Reservation page inspection is read-only; the app does not claim to book tables.

## Architecture

- SvelteKit handles the UI, form actions, and session checks.
- Better Auth stores users and sessions in a dedicated Neon Postgres project.
- Drizzle defines the authentication and onboarding schema in `app/src/lib/server/db/`.
- Vercel builds `app/` from pushes to the GitHub `mucho` branch. The browser never receives database credentials.
- Mapbox discovers restaurants. Browserbase Search finds reservation pages, and Stagehand reads visible SevenRooms page controls through a hosted browser. OpenRouter supplies Stagehand's extraction model.
- Google Calendar access is optional and separate from sign-in. Better Auth links a Google account with free/busy and calendar-list read-only scopes; the server returns busy intervals to the reservation widget, without event details or calendar data in the model context.

## Run locally

```sh
cd app
bun install
cp .env.example .env
# Set DATABASE_URL and BETTER_AUTH_SECRET in .env
bun run db:push
bun run dev
```

For calendar conflicts, enable Google Calendar API on the existing Google OAuth project and add `calendar.freebusy` and `calendar.calendarlist.readonly` to its consent screen. Add your Google account as a test user if the consent screen is in testing mode. Sign in to Concierge, choose **Connect Google Calendar**, then search for a reservation. The comparison assumes the restaurant shares the device timezone and a two-hour meal; it does not create events.

## Local checks

In another terminal, run `bun run test:auth`, sign in with your own local account, complete onboarding if prompted, then stop the recorder with Ctrl+C. This saves a git-ignored Playwright session. Run `bun run test:e2e` to check the chat calendar and selected-slot payload with a mocked chat response. No reservation provider is called.

Run `bun run eval:local` in `app/` to score the frozen, redacted Sentry observations in `app/tests/sentry-snapshots.json` without calling the agent, model, or provider. Run `bun run eval:braintrust` to record those same observed scores in the dedicated Concierge Braintrust project. Braintrust code lives in `app/tests/`, outside the app runtime. A score is null when the capture lacks the provider evidence needed to judge that claim.

For a human-triggered development review, pick a `POST /api/chat` trace in the Concierge Sentry project. Read the `chat.intake`, `gen_ai.generate_content`, and `gen_ai.execute_tool` spans, plus the AI conversation transcript. Append only the relevant observed request, calls, outcome, and answer to `app/tests/sentry-snapshots.json`, with its trace URL and without user details or secrets. Use empty `expected` for a turn without a selected slot. Set `providerOutcome` only from independent provider evidence; use `null` when it is absent. Then score those fixed observations. Sentry remains the evidence source; no automatic trace forwarding is configured.

`app/tests/snapshots.md` records qualitative journeys. Compare scores only across observed captures with the same applicable checks; an inapplicable check remains unscored.

## Scope and cuts

For a matching SevenRooms venue, Concierge shows checked times by experience and can carry a selected time to provider checkout. A local chat-to-checkout run reached an authenticated live browser view and stopped before guest details or payment. [The separate manual screenshot](proof/README.md) shows that provider screen. This does not prove a completed booking or that every provider time is captured.

AI tools used: Codex for code migration, implementation, review, and runtime checks; Svelte MCP for framework documentation and component diagnostics; iOS design skills for mobile layout and interaction guidance.
