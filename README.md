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

## Scope and cuts

Reservation page discovery and read-only inspection are in progress. A matching SevenRooms page can show visible times after setting a requested date and party size. Complete time lists, booking, and proof of a booking attempt are still open.

AI tools used: Codex for code migration, implementation, review, and runtime checks; Svelte MCP for framework documentation and component diagnostics; iOS design skills for mobile layout and interaction guidance.
