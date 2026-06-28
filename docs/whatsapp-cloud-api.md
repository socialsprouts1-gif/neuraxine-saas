# WhatsApp Cloud API integration

This portal connects to Meta's **WhatsApp Cloud API** to send and receive
messages on a business-owned WhatsApp number. This is the "single number" stage
described in the project plan — multi-tenant Embedded Signup comes later.

## What's included

| Piece | Path |
| --- | --- |
| Cloud API client (send text/template, mark-read, webhook types) | `src/lib/whatsapp.ts` |
| Webhook (verification + incoming messages + auto-reply) | `src/app/api/whatsapp/webhook/route.ts` |
| Send endpoint (text + template) | `src/app/api/whatsapp/send/route.ts` |
| Environment template | `.env.example` |

## 1. Configure credentials

Copy `.env.example` to `.env.local` and fill in the values from your Meta App
and WhatsApp Manager:

```bash
cp .env.example .env.local
```

| Variable | Where to find it |
| --- | --- |
| `WHATSAPP_ACCESS_TOKEN` | Business Settings → System Users → permanent token |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp → API Setup |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | WhatsApp → API Setup (WABA ID) |
| `WHATSAPP_VERIFY_TOKEN` | A value you invent, reused in the webhook config |
| `WHATSAPP_APP_SECRET` | Meta App → Settings → Basic (optional, enables signature checks) |
| `WHATSAPP_AUTO_REPLY_MESSAGE` | Optional canned reply to incoming texts |

These are server-only secrets. Do **not** prefix them with `NEXT_PUBLIC_`.

## 2. Register the webhook

In the Meta App dashboard: **WhatsApp → Configuration → Webhook**

- **Callback URL:** `https://<your-domain>/api/whatsapp/webhook`
- **Verify token:** the value of `WHATSAPP_VERIFY_TOKEN`
- Subscribe to the **`messages`** field.

Meta calls the URL once with a `GET` handshake; the route echoes the
`hub.challenge` back when the token matches. After that, message and status
events arrive as `POST` requests.

For local development, expose your dev server with a tunnel (e.g. `ngrok`) and
use the public URL as the callback.

## 3. Send a message

```bash
# Text (only valid inside the 24h customer-service window)
curl -X POST http://localhost:3000/api/whatsapp/send \
  -H "Content-Type: application/json" \
  -d '{ "to": "15551234567", "type": "text", "body": "Hello from Neuraxine!" }'

# Template (to start a conversation / message outside the window)
curl -X POST http://localhost:3000/api/whatsapp/send \
  -H "Content-Type: application/json" \
  -d '{
        "to": "15551234567",
        "type": "template",
        "template": "hello_world",
        "language": "en_US"
      }'
```

`to` must be the recipient's number in international format, digits only.

## Notes & next steps

- Incoming messages now flow through the **automation engine** (`src/lib/
  automation.ts`): they are stored, matched against chatbot rules for an
  auto-reply, and enrolled into any matching drip flows. The team inbox,
  campaigns and analytics are all driven from this data.
- Data is persisted via a pluggable adapter (in-memory / file / Postgres) —
  see [`deployment.md`](./deployment.md).
- The send endpoint is currently **unauthenticated** because the portal has no
  auth layer yet. Put it behind session/API-key auth before exposing it.
- When ready for clients, replace the env-based single config with per-tenant
  credentials captured via Meta Embedded Signup.
