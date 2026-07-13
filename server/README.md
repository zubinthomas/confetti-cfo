# Confetti CFO — Express Backend

This is the self-hosted Express server behind the dashboard (auth, entity CRUD, file uploads and the LLM proxy).

## Quick start

```bash
cd server
cp .env.example .env          # fill in your secrets
npm install
npm run dev                   # starts on http://localhost:3001
```

## Running alongside the frontend

Open two terminals:

```bash
# Terminal 1 — backend
cd server && npm run dev

# Terminal 2 — frontend
npm run dev   # vite proxies /api → http://localhost:3001
```

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `JWT_SECRET` | **Yes** | Long random string; sign all user tokens |
| `ANTHROPIC_API_KEY` | For AI tab | Anthropic API key (`sk-ant-…`) |
| `LLM_PROVIDER` | No | `anthropic` (default) or `openai` |
| `LLM_MODEL` | No | Override default model |
| `OPENAI_API_KEY` | If `LLM_PROVIDER=openai` | OpenAI key |
| `GOOGLE_CLIENT_ID` | For Google login | From Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | For Google login | From Google Cloud Console |
| `SERVER_URL` | No | Public URL of this server (default `http://localhost:3001`) |
| `CLIENT_URL` | No | Public URL of the frontend (default `http://localhost:5173`) |

## Data storage

Entity data lives in the database (PGlite in development — an embedded PostgreSQL, no server to run; swap `server/db/client.ts` to a network driver + `DATABASE_URL` for production Postgres). Seed it from the verified Excel extraction with `npm run db:seed`, and prove the data model reconstructs `src/data/extracted_data.json` exactly with `npm run db:verify`.
Uploaded files are stored in `server/uploads/`.

> **For production** swap `server/db.js` for a real database (PostgreSQL, MongoDB, etc.) and use proper cloud file storage (S3, R2, etc.).

## API surface

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | — | Register + send OTP |
| POST | `/api/auth/verify-otp` | — | Verify OTP → get token |
| POST | `/api/auth/resend-otp` | — | Re-send OTP |
| POST | `/api/auth/login` | — | Email/password login |
| GET | `/api/auth/me` | Bearer | Current user |
| POST | `/api/auth/logout` | — | No-op (client drops token) |
| POST | `/api/auth/reset-password-request` | — | Send reset email |
| POST | `/api/auth/reset-password` | — | Consume reset token |
| GET | `/api/auth/google` | — | Google OAuth redirect |
| GET | `/api/auth/google/callback` | — | Google OAuth callback |
| GET | `/api/entities/:entity` | Bearer | List (optional `?sort=`) |
| POST | `/api/entities/:entity` | Bearer | Create |
| PUT | `/api/entities/:entity/:id` | Bearer | Update |
| DELETE | `/api/entities/:entity/:id` | Bearer | Delete |
| POST | `/api/integrations/upload` | Bearer | Upload file → `{ file_url }` |
| POST | `/api/integrations/llm` | Bearer | Invoke LLM → `{ text }` |
