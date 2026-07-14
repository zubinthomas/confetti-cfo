# Confetti CFO

Finance + HR dashboard for Confetti: a React SPA (Vite) backed by an Express
API with an embedded Postgres (PGlite) database. How to import financial data
(Excel upload and Google Sheets sync) is documented in [IMPORTING.md](IMPORTING.md).

## Prerequisites

- **Node.js 22.18 or newer** — the server runs its TypeScript directly
  (`node index.ts`), which relies on Node's built-in type stripping.
- npm. No external database or other services are needed: PGlite persists an
  embedded Postgres to `server/data/pg/`.

## First-time setup

The repo is two npm packages: the frontend at the root and the API in `server/`.
Install both:

```sh
npm install
cd server && npm install
```

Create the server's env file:

```sh
cd server
cp .env.example .env
```

For local development the defaults are fine as-is — every key in `.env` is
optional. Fill them in only when you need the feature:

| Key(s) | Feature |
|---|---|
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`, `LLM_PROVIDER` | AI Queries tab |
| `GOOGLE_SERVICE_ACCOUNT_FILE` or `GOOGLE_SERVICE_ACCOUNT_JSON` | Syncing *private* Google Sheets (see [IMPORTING.md](IMPORTING.md)) |
| `SHEETS_SYNC_INTERVAL_MINUTES` | Google Sheets auto-sync interval (default 30, `0` disables) |
| `SMTP_*` | OTP / password-reset emails (otherwise OTPs print to the server console) |
| `JWT_SECRET` | Change to a long random string before any real deployment |

Seed the database with the verified dataset so the dashboards have data on
first launch:

```sh
cd server
npm run db:seed
```

## Running the app

Two dev processes, in separate terminals:

```sh
# 1. API server — http://localhost:3001
cd server
npm run dev

# 2. Frontend — http://localhost:5173 (proxies /api and /uploads to the API)
npm run dev
```

Open http://localhost:5173 and log in — **auth is currently stubbed for
prototyping, so any email/password works**.

### PGlite is single-process

Only one process may hold the database at a time. Stop the API server before
running `db:seed`, the verify scripts, or a second server instance — a
lockfile turns this mistake into a clear startup error instead of silent
corruption.

## Checks and scripts

From the repo root:

- `npm run typecheck` — typechecks both the frontend and the server
- `npm run lint` / `npm run lint:fix`
- `npm run build` / `npm run preview` — production build of the frontend
- `npm run test:e2e` — Playwright tests

In `server/`:

- `npm run db:seed` — wipe and reload the dataset tables (idempotent)
- `npm run db:generate` — generate a migration after editing `db/schema.ts`
  (migrations apply automatically when the server starts)
- `npm run import:verify` — prove the Excel import pipeline reproduces the
  verified extraction (needs the source workbooks in `data-sources/`)
- `npm run sheets:verify` — offline test of the Google Sheets sync lifecycle
  (no Google account needed)
