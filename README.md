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

Run `bun run eval:local` for two Braintrust cases using synthetic provider evidence and the configured OpenRouter model. It scores visible-time grounding and invented booking claims; `--no-send-logs` keeps the evaluation results local. This does not test a live reservation page or completed booking.

`app/tests/snapshots.md` records real multi-turn requests and their behavioral checks for future journey evals. These snapshots are not run by the current single-response Braintrust command.

## Scope and cuts

For a matching SevenRooms venue, Concierge shows checked times by experience and can carry a selected time to provider checkout. A local chat-to-checkout run reached an authenticated live browser view and stopped before guest details or payment. [The separate manual screenshot](proof/README.md) shows that provider screen. This does not prove a completed booking or that every provider time is captured.

AI tools used: Codex for code migration, implementation, review, and runtime checks; Svelte MCP for framework documentation and component diagnostics; iOS design skills for mobile layout and interaction guidance.
