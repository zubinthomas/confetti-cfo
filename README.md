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

## Restaurant: locations, areas and tables

The Restaurant module (guest register, reservations, floor) is organised as
location -> area -> table: a venue ("Sienna, Hindustan Park") holds areas (Cafe
on the Ground Floor, Restaurant and Bar on the First Floor, Second Floor,
Curbside) and each area holds tables. Staff manage all three levels under
Restaurant -> Locations & Tables. A fresh database gets the location and the
five empty areas at startup. The module lives at `/restaurant` (API
`/api/restaurant`) and is gated by the `Restaurant` permission; it was called
Reservations until migration 0050, which renamed the permission and the saved
layout ids in place.

The tables come from the POS bill-wise sales export. To load them into a
database, in `server/` with the server stopped (PGlite is single-process):

```bash
npm run db:seed-reservation-tables
```

It creates 29 tables (Cafe 1-7, T1, T2; Restaurant F1-F10; Bar BAR 1-3, B1, B3,
B5; Curbside C1-C4) and prints what it made and what it left alone. Re-running is safe: existing tables are never
changed and nothing is deleted. Seats are 4 per table (the export has no seat
counts), except the Curbside bays at 1. Delivery rows and the "N. C KOT" code are not
seeded. Run it once on dev, staging and production, then fix capacities in the
UI. `npm run reservation-seed:verify` checks the seed against a throwaway
database.

Reservations -> Day view has a Day | All switch. All is a flat list of every
booking (`GET /api/restaurant/all`, paged 25 at a time): Upcoming (default,
soonest first), Past or All, with guest/phone/email search, status, area and
From / To filters, and the same status buttons as the day view.

For staff who only work the restaurant, `npm run db:seed-restaurant-role` (same
rules: in `server/`, server stopped, safe to re-run) adds a "Restaurant" role
with Restaurant read, write and delete and nothing else. With one nav item the
shell shows no navigation beyond the user menu, and they land on `/restaurant`.
Assign it on the Users page.

## Layouts by permission, role and user

What each person sees in the navigation, on page tabs and on the overview is
a layout, resolved per request from four layers (later wins):

1. the built-in defaults in `src/lib/layout/registry.ts`
2. permission layouts (lower priority number wins)
3. role layouts (lower role rank wins)
4. the person's own layout

Whatever the layers say, an item is only shown if `can(resource, action)`
allows it, so a layout can never reveal something the person can't open.
Layouts are presentation only, not a security boundary: hiding a link does
not block the route or the API.

- Everyone edits their own layout at `/settings/user` (also the "Edit layout"
  link on the overview). Admins cannot author a person's layout, only reset it
  (Users tab, needs `User:write`).
- Role and permission layouts are edited on Users and Permissions -> Layouts.
  `Layout:read` shows the tab, `Layout:write` changes layouts, and role layouts
  also need `Role:read`. `Role:read` alone never lets anyone edit a layout.
- Item ids in the registry are stored in layouts. Rename one only together with
  a data migration.
- The "Apply Leadership preset" button writes the Leadership role layout. On
  each database that has a `Leadership` role, run
  `npm run db:seed-leadership-layout` in `server/` (stop the server first,
  PGlite is single-process; add `--force` to overwrite an existing layout).
- `npm run layouts:verify` in `server/` checks the layout tables, validator
  and seed script.

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
