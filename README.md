# Concierge

Restaurant reservation agent take-home, in progress.

The deployed app currently provides account creation, login, onboarding, and an authenticated home screen. The reservation platform integration is intentionally pending; the home screen does not claim to show live availability or accept bookings.

## Architecture

- SvelteKit handles the UI, form actions, and session checks.
- Better Auth stores users and sessions in a dedicated Neon Postgres project.
- Drizzle defines the authentication and onboarding schema in `app/src/lib/server/db/`.
- Vercel hosts the app. The browser never receives database credentials.

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

Pearl's Palate supplied the passport login and onboarding design. This repo has its own database and branding. Its map, explore pages, recommendation code, and unrelated service keys were left behind. The reservation platform, availability search, confirmation, and booking proof are the next vertical slice.

AI tools used: Codex for code migration, implementation, review, and runtime checks; Svelte MCP for framework documentation and component diagnostics; iOS design skills for mobile layout and interaction guidance.
