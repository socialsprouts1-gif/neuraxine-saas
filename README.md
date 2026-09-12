# Neura Chat

Multi-tenant WhatsApp automation SaaS built on the **Meta WhatsApp Cloud API
directly** — no BSP intermediary. Each tenant connects their own WhatsApp
Business Account. A Neuraxine product.

## Stack

- **Next.js 16** (App Router, Turbopack) + TypeScript
- **Tailwind CSS** — dark glassmorphism theme, neon-green / purple-cyan gradient accents
- **Supabase** — Postgres + Auth + Realtime, with row-level security throughout
- **Meta Graph API** `v21.0` — pinned as a constant in `src/lib/meta-whatsapp.ts`
- **Claude** (`@anthropic-ai/sdk`) — powers the AI Assistant replies

## Getting started

```bash
npm install
cp .env.local.example .env.local   # then fill in real values
npm run dev
```

### 1. Database

Open the Supabase SQL editor, paste the whole of `supabase/setup.sql`, and
run it. It is generated from `supabase/migrations/*.sql` in filename order
and is safe to run more than once — tables use `if not exists`, functions use
`create or replace`, and every policy is dropped before being recreated, so
re-running it after adding a migration applies only what is missing.

```bash
node scripts/build-setup-sql.mjs   # regenerate after editing a migration
```

### 2. Environment variables

`.env.local` for local development; Vercel → Settings → Environment Variables
for production. `NEXT_PUBLIC_*` values are baked in at build time, so changing
one needs a redeploy, not just a restart.

| Variable | Required | Where it comes from |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | The publishable (or legacy anon) key |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | The secret (or legacy service_role) key. Bypasses RLS — server only, never `NEXT_PUBLIC_` |
| `META_APP_SECRET` | yes | Meta App → Basic Settings. Verifies `X-Hub-Signature-256` |
| `TOKEN_ENCRYPTION_KEY` | yes | `openssl rand -base64 32`. Encrypts stored WABA tokens |
| `ANTHROPIC_API_KEY` | fallback for Anthropic assistants | console.anthropic.com |
| `CRON_SECRET` | to run the flow scheduler | any long random string you choose |
| `OPENAI_API_KEY` | fallback for OpenAI assistants | platform.openai.com |
| `GOOGLE_API_KEY` | fallback for Gemini assistants | aistudio.google.com |

`META_ACCESS_TOKEN` appears in `.env.local.example` but is not read by any
code path — sending uses the per-org token from `waba_connections`.
The three provider keys are fallbacks only: each AI assistant can hold its
own key, pasted on its **AI Configuration** tab and encrypted at rest with
`TOKEN_ENCRYPTION_KEY`. An assistant reaches for the environment key only
when it has none of its own, so a tenant on their own OpenAI account needs
nothing set here. Everything except the AI Assistant works without all three.

### 3. Keep the schedulers running

Two endpoints do work on a timer, and nothing calls either on its own:

| Endpoint | What stops without it |
| --- | --- |
| `GET /api/cron/resume-flows` | A chatbot Delay longer than ten seconds parks the conversation; this resumes it. |
| `GET /api/cron/dispatch-campaigns` | Campaigns queue their recipients rather than sending inline; this drains the queue. Nothing is ever sent without it. |

On a Vercel **Pro** plan, add a `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/resume-flows", "schedule": "* * * * *" },
    { "path": "/api/cron/dispatch-campaigns", "schedule": "* * * * *" }
  ]
}
```

On **Hobby**, do not — Vercel rejects a deployment whose `vercel.json`
declares a cron more often than daily, and every push stops shipping. Point a
free pinger (cron-job.org, UptimeRobot) at both URLs once a minute instead,
sending `Authorization: Bearer <CRON_SECRET>`.

Without them, everything still works except the part of a flow that comes
after a Delay of more than ten seconds, and campaign delivery.

### 3. Connect a WhatsApp number

In the app: **Settings → WhatsApp connection**. Then register the webhook on
Meta's side — Settings shows both values Meta asks for (the callback URL and
the per-connection verify token) and the `messages` field to subscribe to.
Until that is done, no inbound message reaches the app.

## How an inbound message is handled

`POST /api/webhooks/whatsapp` verifies the signature, answers `200`
immediately, then does the work in `after()`:

1. upsert the contact and conversation, store the message
2. fire `contact.created` / `message.received` to the org's outgoing webhooks
3. run the bot pipeline (`src/lib/message-runner.ts`)

The pipeline picks exactly one reply, in this order — rules the business
wrote beat generated answers:

| # | Source | Beats |
|---|---|---|
| 1 | Handoff keyword → pauses the bot, flags the chat for a human | everything |
| 2 | The next step of a flow already in progress | |
| 3 | Keyword / menu chatbot | FAQ, automations, AI |
| 4 | Welcome bot (first message only) | |
| 5 | FAQ bot (keyword + question-overlap scoring) | automations, AI |
| 6 | Keyword automation | AI |
| 7 | AI assistant (Claude) | the fallback bot |
| 8 | Fallback bot | — |

Every evaluation, match or not, writes a row to `bot_runs`, visible at
**Automations → Bot activity** and in the inbox thread header. Agents can
pause and resume the bot per conversation from the inbox.

## Architecture notes

**Tenancy.** Every row is scoped to an `org_id`; users reach data only through
`org_members`. RLS is enforced in the database via `SECURITY DEFINER` helpers
— `is_org_member()`, `is_org_admin()`, `is_platform_admin()` — rather than
trusted at the application layer.

Writes to `org_members` and `waba_connections` are restricted to
owners/admins — the former to prevent self-granted privilege escalation, the
latter because it holds encrypted Meta credentials. All other tenant tables
use the flat any-member rule.

`messages.org_id` and `campaign_recipients.org_id` are denormalized from
their parents by a `BEFORE INSERT` trigger that overwrites whatever the
client sends, so RLS can check them without a join and the value cannot be
spoofed.

**Audit trail.** `bot_runs` has a select policy and nothing else — no insert,
update or delete for `authenticated`, because an audit trail a tenant can
rewrite is not an audit trail. Rows are written by the webhook handler
through the service-role client. A unique index on the inbound message id
means Meta's webhook retries cannot produce a duplicate reply.

**Webhook security.** The webhook route reads the raw request body, verifies
the HMAC-SHA256 signature against `META_APP_SECRET` using a constant-time
comparison, and only then parses the payload. It acks Meta immediately with
`200` and defers all work via `after()`, so slow processing never triggers
Meta's retry behaviour. Rejected deliveries are logged before the 401, so a
burst of them is visible in Admin → Webhook logs.

**Credential storage.** WABA access tokens and third-party integration
credentials are encrypted at rest with AES-256-GCM (`src/lib/crypto.ts`).

**Outgoing webhooks** are signed `sha256=<hex hmac of the raw body>` — the
same shape Meta and Stripe use, so an integrator already knows the drill.
Each delivery attempt is recorded in `webhook_deliveries`.

## Key paths

```
src/app/(dashboard)/            Neura Chat portal (auth-guarded)
  inbox | chatbot | ai-assistant | faq-bot | automations | campaigns
  contacts | integrations | commerce | gallery | reminders | api-endpoints
  billing | organizations | settings | support
src/app/admin/                  Platform admin (users, orgs, plans, add-ons,
                                coupons, orders, tickets, webhook logs, settings)
src/app/api/
  webhooks/whatsapp/route.ts    GET verify handshake + POST signature-verified ingest
  messages/send/route.ts        Authenticated outbound send (text or template)
src/lib/
  reply-matcher.ts              Pure matcher — decides what to reply with
  message-runner.ts             The I/O half — sends, advances state, audits
  whatsapp-send.ts              Shared outbound path + 24h service window guard
  ai-assistant.ts               Claude-backed reply generation
  outgoing-webhooks.ts          Signed event delivery
  meta-whatsapp.ts              Graph API client (pinned version)
  crypto.ts                     AES-256-GCM token encryption
  supabase/                     browser / server / admin / session clients
src/proxy.ts                    Session refresh (Next.js 16 renamed `middleware` → `proxy`)
supabase/migrations/            Schema, RLS policies, signup trigger, portal, runner
tests/                          Matcher unit tests (node:test)
```

## Behaviour without configuration

The app is designed to survive missing environment variables rather than
crash. With none set, public pages render normally, the dashboard shows a
setup notice naming the variables it needs, and the API routes return `503`
with an actionable message. Only features that genuinely require Supabase,
Meta or Anthropic are affected.

## Development

```bash
npm run dev     # dev server
npm test        # matcher unit tests
npm run build   # production build
npx tsc --noEmit
```

`src/lib/reply-matcher.ts` is deliberately pure — no Supabase, fetch or env
access — so the priority order and keyword-boundary rules can be tested
directly. `src/lib/message-runner.ts` holds everything that touches I/O.

## Not built yet

- Campaign dispatcher (campaigns are stored and scheduled, but nothing sends them)
- Reminder scheduler (pending reminders show as overdue rather than firing)
- Plan limit enforcement
- Bearer-token auth on `/api/messages/send` (API keys are issued but not yet accepted there)
- Per-provider integration sync — the catalogue connects and stores credentials;
  outgoing webhooks are the general-purpose path in the meantime
