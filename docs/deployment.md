# Deployment & persistence

This is the WhatsFlow AI WhatsApp automation SaaS: a Next.js app with a live
backend (automation engine, REST API, team inbox, campaigns, drip flows,
analytics). This guide covers running it, persisting data, and deploying to
Vercel with your real WhatsApp Cloud API credentials.

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in values (all optional for a local demo)
npm run dev                  # http://localhost:3000
```

With no env vars set, the app runs in **sandbox mode** (simulated WhatsApp
sends) with seeded demo data — fully explorable out of the box.

## Persistence

The app keeps its working data in memory and persists a snapshot through a
pluggable adapter, chosen automatically from the environment:

| Condition | Adapter | Durability |
| --- | --- | --- |
| `DATABASE_URL` is set | **Postgres** | Durable — use in production / on Vercel |
| no `DATABASE_URL`, writable FS | **File** (`./.data/state.json`) | Durable for local dev / a long-running VM |
| `VERCEL` set, no `DATABASE_URL` | **none** (in-memory) | Resets on cold start |

The data-access layer lives in `src/lib/store.ts`; persistence I/O is in
`src/lib/persistence.ts`. The snapshot is a single JSON document — simple and
ideal for MVP / single-instance use. For high write concurrency across many
serverless instances, migrate to a normalised schema behind the same
`store.ts` functions.

### Using Postgres

Any standard Postgres works — Supabase, Neon, or Vercel Postgres. Set:

```
DATABASE_URL=postgres://user:pass@host:5432/dbname
# DATABASE_SSL=disable   # only if your DB has no TLS (rare)
```

The `app_state` table is created automatically on first run.

## Deploy to Vercel

1. Push this repo to GitHub (already done on branch
   `claude/whatsapp-cloud-api-0m2eon`).
2. At **vercel.com/new**, import the repository. Next.js is detected
   automatically — no build config needed.
3. Add **Environment Variables** (Project → Settings → Environment Variables):

   | Variable | Required | Purpose |
   | --- | --- | --- |
   | `DATABASE_URL` | **yes** (for durability) | Postgres connection string |
   | `WHATSAPP_ACCESS_TOKEN` | for real sending | Permanent system-user token |
   | `WHATSAPP_PHONE_NUMBER_ID` | for real sending | From WhatsApp API Setup |
   | `WHATSAPP_VERIFY_TOKEN` | for webhook | Any string you choose |
   | `WHATSAPP_APP_SECRET` | recommended | Validates webhook signatures |

4. Deploy. The included `vercel.json` registers a **cron** that hits
   `/api/cron/process` every minute so scheduled drip/follow-up steps fire.
5. After the first deploy, register the webhook in Meta → WhatsApp →
   Configuration:
   - Callback URL: `https://<your-vercel-domain>/api/whatsapp/webhook`
   - Verify token: your `WHATSAPP_VERIFY_TOKEN`
   - Subscribe to the **messages** field.
6. In the app's **Settings**, turn **Sandbox mode off** to send real messages.

> Sandbox vs live: with no WhatsApp credentials (or sandbox on), sends are
> simulated and recorded so the product is fully demonstrable. Once credentials
> are set and sandbox is off, messages go through the real Cloud API.

## API surface

All under `/api`:

- `POST /api/whatsapp/webhook` — incoming messages + statuses (Meta calls this)
- `GET  /api/whatsapp/webhook` — verification handshake
- `POST /api/whatsapp/simulate` — inject a test inbound message (demo/testing)
- `POST /api/whatsapp/send` — send a text/template directly
- `contacts`, `conversations`, `conversations/[id]`, `templates`, `campaigns`,
  `campaigns/[id]/send`, `automations`, `automations/[id]`, `flows`,
  `integrations`, `analytics`, `overview`, `settings`
- `GET|POST /api/cron/process` — run due scheduled drip steps

## Known limitations / next steps

- The API is **unauthenticated** — add session/API-key auth before exposing
  publicly.
- Single-tenant: one business number via env config. For onboarding clients,
  add Meta Embedded Signup and per-tenant credentials.
- JSON-snapshot persistence is great for MVP scale; move to a normalised schema
  for high concurrency.
