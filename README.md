# Neuraxine Voice — AI Voice Calling Platform for India 🇮🇳

A SaaS platform where Indian businesses build their own AI voice calling agents (OmniDimension-style) that speak Hindi, English and 10+ regional languages — plus a separate admin panel for the platform owner.

## What's inside

### Client product
- **Landing page** (`/`) — features, Indian-language showcase, ₹ pricing, use cases, FAQ
- **Auth** (`/auth/login`, `/auth/register`) — demo auth (any credentials work)
- **Dashboard** (`/dashboard`)
  - **Voice Agents** — create agents from templates (sales, support, appointment booking, EMI reminders, surveys) and configure them in a full builder: persona & system prompt, voice & language, LLM model & call behaviour, knowledge base FAQs, integrations/webhooks, and a test-call panel. Agents persist in `localStorage`.
  - **Call Logs** — with per-call transcript viewer, sentiment and cost in ₹
  - **Campaigns** — bulk outbound calling with CSV upload and TRAI call windows
  - **Contacts** — DND-scrubbed calling lists
  - **Phone Numbers** — virtual/toll-free Indian numbers (Exotel, Plivo, Tata Tele)
  - **Analytics** — minutes by language, outcomes, agent leaderboard
  - **Billing & Wallet** — ₹ wallet, UPI recharge, GST invoices
  - **Settings** — business profile, API key, notifications

### Admin panel (platform owner)
- Separate login at `/admin/login` — owner email: `admin@neuraxine.in` (any password, demo mode)
- **Overview** — MRR, clients, platform minutes, signups vs churn
- **Clients** — suspend/re-activate accounts, adjust wallet credit
- **All Agents** — agents across every tenant
- **Plans & Pricing** — edit plan price/minutes/limits
- **Payments** — Razorpay recharges, renewals, failures
- **Providers** — telephony (Exotel/Plivo/Twilio), TTS (Sarvam/ElevenLabs), STT (Deepgram/Sarvam), LLMs
- **Support** — ticket desk
- **Settings** — trials, GST, maintenance mode, TRAI/DoT compliance IDs

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Notes

This is a frontend demo: data is mock/seeded (see `src/lib/data.ts`) and agent CRUD persists in the browser's `localStorage` (`src/lib/agent-store.ts`). Wiring a real backend means replacing the store and seed data with API calls to your telephony/LLM stack.

Built with Next.js (App Router), Tailwind CSS, Framer Motion, Recharts and lucide-react.
