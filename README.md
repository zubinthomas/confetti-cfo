# Confetti CFO

Finance + HR dashboard for Confetti: a React SPA (Vite) backed by an Express
API with an embedded Postgres (PGlite) database. How to import financial data
(Excel upload and Google Sheets sync) is documented in [IMPORTING.md](IMPORTING.md).

## Prerequisites

- **Node.js 22.18 or newer** - the server runs its TypeScript directly
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

For local development the defaults are fine as-is - every key in `.env` is
optional. Fill them in only when you need the feature:

| Key(s) | Feature |
|---|---|
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `OPENROUTER_API_KEY`, `LLM_PROVIDER` | AI Queries tab |
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
# 1. API server - http://localhost:3001
cd server
npm run dev

# 2. Frontend - http://localhost:5173 (proxies /api and /uploads to the API)
npm run dev
```

Open http://localhost:5173 and log in with a user created via the CLI (see
[Managing users](#managing-users)) - there is no open registration; accounts
are created via the CLI or by accepting an invite from someone who already
has an account.

### PGlite is single-process

Only one process may hold the database at a time. Stop the API server before
running `db:seed`, the user commands, the verify scripts, or a second server
instance - a lockfile turns this mistake into a clear startup error instead
of silent corruption.

## Managing users

Accounts are created two ways: from the CLI, or by a user with the `Invite`
permission sending an invite link from the dashboard (Invites page), where
they choose which of their own permissions to grant the invitee. There is no
open registration UI. The CLI commands below run from `server/`, **with the
dev server stopped** (see above):

```sh
npm run user:create -- alice@example.com "Alice Smith"   # prompts for a password
npm run user:list                                        # id, email, name, created
npm run user:password -- alice@example.com               # set a new password
npm run user:delete -- alice@example.com
```

Notes:

- Passwords are prompted interactively with hidden input (typed twice) and
  stored bcrypt-hashed. For scripting, `--password <pw>` or piping the
  password on stdin both work - but `--password` ends up in your shell
  history, so prefer the prompt.
- Passwords must be at least 8 characters; emails are validated and stored
  lowercased.
- A fresh user has no permissions until one is granted, either directly
  (`npm run user-permission:grant`) or via a role (`npm run role:assign`) -
  see `npm run role:list` / `npm run permission:list` for what exists. The
  very first user ever created is auto-assigned the built-in `Admin` role.

## Checks and scripts

From the repo root:

- `npm run typecheck` - typechecks both the frontend and the server
- `npm run lint` / `npm run lint:fix`
- `npm run build` / `npm run preview` - production build of the frontend
- `npm run test:e2e` - Playwright tests

In `server/`:

- `npm run db:seed` - wipe and reload the dataset tables (idempotent)
- `npm run db:verify` - prove the database reconstructs the verified
  extraction exactly
- `npm run db:generate` - generate a migration after editing `db/schema.ts`
  (migrations apply automatically when the server starts)
- `npm run user:create` / `user:list` / `user:password` / `user:delete` -
  see [Managing users](#managing-users)
- `npm run import:verify` - prove the Excel import pipeline reproduces the
  verified extraction (needs the source workbooks in `data-sources/`)
- `npm run sheets:verify` - offline test of the Google Sheets sync lifecycle
  (no Google account needed)
- `node sheets/sa-live-test.ts [sheet-url]` - live diagnostic for the Google
  service account: lists what it can access and fetches one spreadsheet
  (needs real credentials in `.env`)
