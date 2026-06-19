# Neuraxine AI — AI Voice Calling SaaS

Production-ready, multi-tenant SaaS for AI voice agents that make and receive real phone calls. India-focused: Hindi, Hinglish, English. TRAI/DLT compliant. Powered by Bolna + Plivo/Exotel + Gemini.

## Stack

- **Framework:** Next.js 16 (App Router, Server Components, Server Actions)
- **Language:** TypeScript (strict)
- **DB / Auth / Storage:** Supabase (Postgres + Auth + RLS)
- **LLM:** Google Gemini (`@google/genai`) — post-call analysis + in-call reasoning
- **Voice Engine:** Bolna (Indic-language voice agents) — abstracted behind `VoiceProvider` interface
- **Telephony:** Plivo or Exotel (Indian numbers, DLT, 140-series)
- **Styling:** Tailwind CSS + shadcn/ui, dark premium aesthetic
- **Animation:** Framer Motion
- **Charts:** Recharts
- **Billing scaffold:** Stripe

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env.local
# Fill in your Supabase, Gemini, and optionally Bolna/Plivo keys
```

For **local dev**, set `VOICE_PROVIDER=mock` — the mock provider simulates calls without spending money.

### 3. Run Supabase migrations

If using Supabase CLI:
```bash
supabase db push
# or apply manually via Supabase dashboard SQL editor
```

Migrations are in `supabase/migrations/`:
- `001_initial_schema.sql` — full data model + RLS policies
- `002_seed.sql` — demo org, agents, contacts, and calls

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

- Landing: `/`
- Dashboard: `/dashboard`
- Agents: `/dashboard/agents`
- Calls: `/dashboard/calls`
- Campaigns: `/dashboard/campaigns`
- Contacts: `/dashboard/contacts`
- Analytics: `/dashboard/analytics`
- Settings: `/dashboard/settings`

## Architecture

### Voice Provider Abstraction

```
VoiceProvider (interface)
├── MockVoiceProvider   — local dev, no cost, instant responses
└── BolnaAdapter        — production: Bolna manages STT→Gemini→TTS loop
                          Telephony: Plivo or Exotel (Indian numbers, 140/160-series)
```

Switch providers via `VOICE_PROVIDER=mock|bolna` env var.

### Call Lifecycle

```
Outbound:  Campaign engine → POST /api/calls/initiate → VoiceProvider.startCall()
                          → Provider makes call → Webhook events arrive → /api/webhooks/voice
                          → Persist transcript → call.ended → Gemini post-call analysis

Inbound:   Phone number rings → Telephony provider routes to Bolna agent
                          → Webhook events → same pipeline
```

### India Compliance (enforced, not optional)

| Rule | Enforcement |
|------|-------------|
| 140-series for promotional | Campaign engine blocks launch if number series mismatch |
| DLT approval required | Campaign cannot run without `dlt_status = 'approved'` |
| AI disclosure | Agents prepend disclosure text on every promotional call |
| DPDP consent | `consent_given + consent_source + consent_at` required before dialing |
| Calling hours | 9 AM–9 PM IST, Mon–Sat (configurable per campaign) |
| DND scrubbing | `dnd` flag on contacts; scrubbed before dialing |
| 1600-series | Blocked unless `org.is_bfsi = true` |

## Key Files

```
src/
  lib/
    supabase/          — browser, server, admin clients
    voice/             — VoiceProvider interface + MockVoiceProvider + BolnaAdapter
    gemini/            — post-call AI analysis (summary, sentiment, structured data)
    webhooks/          — fan-out to org webhook URLs (HMAC-signed)
  types/
    database.ts        — full TypeScript types for all tables
  app/
    api/
      webhooks/voice/  — inbound voice provider webhook handler
    dashboard/
      page.tsx         — overview dashboard
      agents/          — agent builder (list + create/edit + test call)
      calls/           — call log + call detail (transcript, recording, AI summary)
      campaigns/       — outbound campaign management
      contacts/        — contact database + lists + CSV import
      analytics/       — charts + KPIs
      automations/     — webhook subscriptions
      settings/        — org, team, numbers, API keys, billing, compliance
supabase/
  migrations/
    001_initial_schema.sql  — full schema + RLS
    002_seed.sql            — demo data
```

## Deploy

- **Web:** Vercel (Next.js)
- **DB:** Supabase (managed Postgres)
- **Voice/telephony:** Bolna cloud or self-hosted + Plivo/Exotel

Long-running voice/media processing runs inside Bolna's infrastructure — not in Vercel functions.

## Launch Sequence

1. **Start here:** Inbound agents + transactional outbound — quick to ship, light regulation
2. **Gate behind DLT verification:** Bulk promotional outbound — requires 140-series + DLT approval in Supabase before campaigns can launch
