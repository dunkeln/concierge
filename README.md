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

## Run locally

```sh
cd app
bun install
cp .env.example .env
# Set DATABASE_URL and BETTER_AUTH_SECRET in .env
bun run db:push
bun run dev
```

## Local checks

In another terminal, run `bun run test:auth`, sign in with your own local account, complete onboarding if prompted, then stop the recorder with Ctrl+C. This saves a git-ignored Playwright session. Run `bun run test:e2e` to check the chat calendar and selected-slot payload with a mocked chat response. No reservation provider is called.

Run `bun run eval:local` for two Braintrust cases using synthetic provider evidence and the configured OpenRouter model. It scores visible-time grounding and invented booking claims; `--no-send-logs` keeps the evaluation results local. This does not test a live reservation page or completed booking.

## Scope and cuts

Reservation page discovery and read-only inspection are in progress. A matching SevenRooms page can show visible times after setting a requested date and party size. [A manual SevenRooms checkout attempt](proof/README.md) reached the payment gate and stopped there. Complete time lists and an agent-driven booking attempt are still open.

AI tools used: Codex for code migration, implementation, review, and runtime checks; Svelte MCP for framework documentation and component diagnostics; iOS design skills for mobile layout and interaction guidance.
