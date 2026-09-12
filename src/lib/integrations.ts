// The integration catalogue lives in code, not the database: it is the same
// for every tenant, and shipping it as data would mean a migration every
// time a provider is added. Only per-org connection state is stored.
//
// `capability` is deliberately explicit about what each entry actually does
// today, so the UI never implies a provider syncs data when all it does is
// hold credentials.

export type IntegrationCapability =
  | "live" // works end to end right now, no third-party app registration needed
  | "sync" // credentials are used: contacts are pushed to the provider for real
  | "import" // credentials are used: data is pulled in from the provider
  | "payments" // credentials are used: payment links are created for real
  | "lookup" // credentials are used: a live read, on demand
  | "credentials" // stores and validates credentials; per-provider sync not built
  | "via_webhook"; // works today by consuming our outgoing webhook / API

export type IntegrationCategory =
  | "Automation"
  | "E-commerce"
  | "CRM"
  | "Payments"
  | "Productivity"
  | "Support"
  | "Developer";

export interface IntegrationField {
  name: string;
  label: string;
  type?: "text" | "password" | "url";
  placeholder?: string;
  hint?: string;
  required?: boolean;
}

export interface IntegrationDef {
  slug: string;
  name: string;
  category: IntegrationCategory;
  description: string;
  capability: IntegrationCapability;
  /** What the user must do on the provider's side before this can work. */
  prerequisite?: string;
  /**
   * A short caveat shown on the card itself, for the things people get
   * wrong before they ever open the connect form.
   */
  note?: string;
  fields: IntegrationField[];
  /** Brand colour used for the logo tile background wash. */
  brand: string;
  /** Surfaced under the Featured tab: what most businesses connect first. */
  featured?: boolean;
  /**
   * Reachable from a chatbot or automation flow. True only where a flow can
   * actually call the provider today — the webhook-driven entries.
   */
  flows?: boolean;
}

export const INTEGRATIONS: IntegrationDef[] = [
  // ---------------- Works today, no third party needed ----------------
  {
    slug: "webhooks",
    name: "Outgoing Webhooks",
    category: "Developer",
    description:
      "Push every inbound message, status change and new contact to any HTTPS endpoint, signed with your secret.",
    capability: "live",
    fields: [],
    brand: "#00FF87",
    flows: true,
    note:
      "Every delivery is signed with your secret in the X-Neura-Signature header. Verify it before trusting the payload.",
  },
  {
    slug: "api",
    name: "REST API",
    category: "Developer",
    description:
      "Send messages and read contacts from your own code using a scoped API key.",
    capability: "live",
    fields: [],
    brand: "#00D4FF",
    flows: true,
  },

  // ---------------- Work today by consuming our webhook / API ----------------
  {
    slug: "zapier",
    name: "Zapier",
    category: "Automation",
    description:
      "Trigger Zaps from WhatsApp events and send messages from any of 6,000+ Zapier apps.",
    capability: "via_webhook",
    prerequisite: "Create a Zap with a 'Webhooks by Zapier' catch hook, then paste its URL below.",
    fields: [
      { name: "target_url", label: "Zapier catch hook URL", type: "url", required: true, placeholder: "https://hooks.zapier.com/hooks/catch/…" },
    ],
    brand: "#FF4F00",
    featured: true,
    flows: true,
  },
  {
    slug: "make",
    name: "Make",
    category: "Automation",
    description: "Route WhatsApp events into Make scenarios for multi-step automation.",
    capability: "via_webhook",
    prerequisite: "Add a 'Custom webhook' module in Make and paste its URL below.",
    fields: [
      { name: "target_url", label: "Make webhook URL", type: "url", required: true, placeholder: "https://hook.eu2.make.com/…" },
    ],
    brand: "#6D00CC",
    flows: true,
  },
  {
    slug: "n8n",
    name: "n8n",
    category: "Automation",
    description: "Self-hosted workflow automation driven by your WhatsApp events.",
    capability: "via_webhook",
    prerequisite: "Add a Webhook node in n8n and paste its production URL below.",
    fields: [
      { name: "target_url", label: "n8n webhook URL", type: "url", required: true, placeholder: "https://n8n.yourdomain.com/webhook/…" },
    ],
    brand: "#EA4B71",
    flows: true,
  },
  {
    slug: "google-sheets",
    name: "Google Sheets",
    category: "Productivity",
    description: "Append every new contact and message to a spreadsheet row.",
    capability: "via_webhook",
    prerequisite:
      "Publish a Google Apps Script web app that writes to your sheet, then paste its /exec URL below.",
    fields: [
      { name: "target_url", label: "Apps Script web app URL", type: "url", required: true, placeholder: "https://script.google.com/macros/s/…/exec" },
    ],
    brand: "#0F9D58",
    featured: true,
    flows: true,
    note:
      "Deploy the Apps Script as “Execute as me” and “Anyone”. Any other setting drops the rows silently — Google returns success either way.",
  },
  {
    slug: "slack",
    name: "Slack",
    category: "Support",
    description: "Mirror new WhatsApp conversations into a Slack channel.",
    capability: "via_webhook",
    prerequisite: "Create a Slack incoming webhook for the channel and paste its URL below.",
    fields: [
      { name: "target_url", label: "Slack incoming webhook URL", type: "url", required: true, placeholder: "https://hooks.slack.com/services/…" },
    ],
    brand: "#4A154B",
    flows: true,
  },

  // ---------------- Credential storage; per-provider sync not built ----------------
  {
    slug: "shopify",
    name: "Shopify",
    category: "E-commerce",
    description:
      "Pull your products into the WhatsApp catalogue — name, price, stock and photo — so you can send them in a conversation.",
    capability: "import",
    prerequisite:
      "Shopify admin → Settings → Apps and sales channels → Develop apps → create an app with read_products, then install it on the store.",
    fields: [
      { name: "shop_domain", label: "Shop domain", required: true, placeholder: "your-store.myshopify.com", hint: "The myshopify.com domain, not your custom one." },
      { name: "access_token", label: "Admin API access token", type: "password", required: true, placeholder: "shpat_…" },
      { name: "currency", label: "Currency", placeholder: "INR", hint: "The currency your prices are in. Defaults to INR." },
    ],
    brand: "#95BF47",
    featured: true,
    note:
      "Creating the custom app is not enough — it has to be installed on the store as well, or every request comes back 401.",
  },
  {
    slug: "woocommerce",
    name: "WooCommerce",
    category: "E-commerce",
    description:
      "Pull your published products into the WhatsApp catalogue so you can share them in a conversation.",
    capability: "import",
    prerequisite: "WooCommerce → Settings → Advanced → REST API → create a key with Read access.",
    fields: [
      { name: "store_url", label: "Store URL", type: "url", required: true, placeholder: "https://yourstore.com" },
      { name: "consumer_key", label: "Consumer key", required: true, placeholder: "ck_…" },
      { name: "consumer_secret", label: "Consumer secret", type: "password", required: true, placeholder: "cs_…" },
      { name: "currency", label: "Currency", placeholder: "INR", hint: "The currency your prices are in. Defaults to INR." },
    ],
    brand: "#7F54B3",
    note:
      "The store URL has to be https. WooCommerce refuses key-pair auth over plain HTTP, and the failure looks exactly like a wrong secret.",
  },
  {
    slug: "hubspot",
    name: "HubSpot",
    category: "CRM",
    description:
      "Every WhatsApp contact becomes a HubSpot contact, matched on phone number so the same customer is never created twice.",
    capability: "sync",
    prerequisite:
      "HubSpot → Settings → Integrations → Private Apps → create an app with the crm.objects.contacts read and write scopes.",
    fields: [
      { name: "access_token", label: "Private app token", type: "password", required: true, placeholder: "pat-na1-…" },
    ],
    brand: "#FF7A59",
    featured: true,
    note:
      "The token needs crm.objects.contacts.write as well as read. Read alone connects and then fails on the first contact, because searching works and creating does not.",
  },
  {
    slug: "zoho-crm",
    name: "Zoho CRM",
    category: "CRM",
    description:
      "Every WhatsApp contact becomes a Zoho lead, deduplicated on phone number by Zoho itself.",
    capability: "sync",
    prerequisite:
      "Zoho API Console → Self Client → generate a code for the ZohoCRM.modules.ALL and ZohoCRM.settings.ALL scopes, then trade it for a refresh token.",
    fields: [
      { name: "client_id", label: "Client ID", required: true, placeholder: "1000.XXXXXXXX" },
      { name: "client_secret", label: "Client secret", type: "password", required: true },
      { name: "refresh_token", label: "Refresh token", type: "password", required: true },
      {
        name: "data_center",
        label: "Data centre",
        required: true,
        placeholder: "in",
        hint: "The suffix of your Zoho URL: in, com, eu, com.au or jp. An Indian account is 'in'.",
      },
    ],
    brand: "#E42527",
    note:
      "Refresh tokens are tied to the data centre that issued them. A token from zoho.in used against zoho.com fails as 'invalid code', which reads like a typo but is not one.",
  },
  {
    slug: "salesforce",
    name: "Salesforce",
    category: "CRM",
    description:
      "Every WhatsApp contact becomes a Salesforce lead, matched on phone number before anything is created.",
    capability: "sync",
    prerequisite:
      "Create a Connected App with OAuth enabled, tick 'Enable Client Credentials Flow', and set a run-as user under Manage → Client Credentials Flow.",
    fields: [
      { name: "instance_url", label: "Instance URL", type: "url", required: true, placeholder: "https://yourorg.my.salesforce.com" },
      { name: "client_id", label: "Consumer key", required: true },
      { name: "client_secret", label: "Consumer secret", type: "password", required: true },
    ],
    brand: "#00A1E0",
    note:
      "Without a run-as user on the Connected App, Salesforce issues no token at all and answers every request with invalid_grant.",
  },
  {
    slug: "razorpay",
    name: "Razorpay",
    category: "Payments",
    description:
      "Ask for money in a conversation: a UPI payment link the customer taps, and the order marked paid when it clears.",
    capability: "payments",
    prerequisite: "Razorpay Dashboard → Account & Settings → API Keys → generate a key pair.",
    fields: [
      { name: "key_id", label: "Key ID", required: true, placeholder: "rzp_live_…" },
      { name: "key_secret", label: "Key secret", type: "password", required: true },
      {
        name: "webhook_secret",
        label: "Webhook secret",
        type: "password",
        hint: "From Razorpay → Settings → Webhooks. Without it a payment notification cannot be trusted and orders are never marked paid.",
      },
    ],
    brand: "#0C2451",
    featured: true,
    note:
      "A live Key ID with a test secret fails identically to a wrong secret. Check both came from the same mode.",
  },
  {
    slug: "stripe",
    name: "Stripe",
    category: "Payments",
    description: "Payment links sent in a WhatsApp conversation, for customers paying by card.",
    capability: "payments",
    prerequisite: "Stripe Dashboard → Developers → API keys → copy your secret key.",
    fields: [
      { name: "secret_key", label: "Secret key", type: "password", required: true, placeholder: "sk_live_…" },
      {
        name: "webhook_secret",
        label: "Webhook signing secret",
        type: "password",
        placeholder: "whsec_…",
        hint: "From Stripe → Developers → Webhooks, after adding the endpoint. Without it orders are never marked paid.",
      },
    ],
    brand: "#635BFF",
    note: "No UPI. For an Indian customer, Razorpay or Cashfree is the one to connect.",
  },
  {
    slug: "shiprocket",
    name: "Shiprocket",
    category: "E-commerce",
    description:
      "Look up where a parcel is by AWB number, so you can answer “where is my order?” without leaving the inbox.",
    capability: "lookup",
    prerequisite: "Shiprocket → Settings → API → Configure → create an API user.",
    fields: [
      { name: "email", label: "API user email", required: true },
      { name: "password", label: "API user password", type: "password", required: true },
    ],
    brand: "#E94B3C",
    note:
      "It has to be an API user, not your dashboard login. Shiprocket refuses the dashboard account on this endpoint.",
  },
  {
    slug: "calendly",
    name: "Calendly",
    category: "Productivity",
    description:
      "Pull your Calendly booking links so you can share the right one in a conversation.",
    capability: "lookup",
    prerequisite: "Calendly → Integrations → API & Webhooks → create a personal access token.",
    fields: [
      { name: "access_token", label: "Personal access token", type: "password", required: true },
    ],
    brand: "#006BFF",
    note:
      "For booking on WhatsApp itself — a menu of days and times the customer taps — use the built-in Appointments screen instead. This only shares links.",
  },
  {
    slug: "facebook-lead-ads",
    name: "Facebook Lead Ads",
    category: "CRM",
    description:
      "New leads from your Facebook and Instagram lead forms arrive as contacts, ready for an instant WhatsApp follow-up.",
    capability: "import",
    prerequisite:
      "Meta Business Settings → System Users → generate a token with leads_retrieval and pages_show_list, then note the Page ID.",
    fields: [
      { name: "page_id", label: "Page ID", required: true, placeholder: "123456789012345" },
      { name: "access_token", label: "Page access token", type: "password", required: true, placeholder: "EAAG…" },
      { name: "country_code", label: "Default country code", placeholder: "91", hint: "Added to any number that arrives without one." },
    ],
    brand: "#1877F2",
    featured: true,
    note:
      "The token must come from a System User, not your own login. A personal token dies when your password changes and takes the lead sync with it.",
  },
  {
    slug: "cashfree",
    name: "Cashfree",
    category: "Payments",
    description:
      "UPI payment links sent in a conversation, and the order marked paid when the money lands.",
    capability: "payments",
    prerequisite: "Cashfree Merchant Dashboard → Developers → API Keys.",
    fields: [
      { name: "app_id", label: "App ID", required: true },
      { name: "secret_key", label: "Secret key", type: "password", required: true },
      { name: "mode", label: "Mode", placeholder: "production", hint: "production or sandbox. Must match where the keys came from." },
      {
        name: "webhook_secret",
        label: "Webhook secret",
        type: "password",
        hint: "Cashfree uses your secret key to sign webhooks — paste it here too. Without it orders are never marked paid.",
      },
    ],
    brand: "#6933FF",
    note:
      "Sandbox and production are different hosts and do not accept each other's keys — a sandbox key against production is a 401 that reads like a bad secret.",
  },
  {
    slug: "indiamart",
    name: "IndiaMART",
    category: "CRM",
    description:
      "Pull the last week of buyer enquiries in as contacts, so no lead sits waiting for a callback.",
    capability: "import",
    prerequisite: "IndiaMART Seller Panel → Lead Manager → CRM Integration → copy your CRM key.",
    fields: [
      { name: "crm_key", label: "CRM key", type: "password", required: true },
      { name: "mobile", label: "Registered mobile", required: true, placeholder: "9198XXXXXXXX" },
      { name: "country_code", label: "Default country code", placeholder: "91", hint: "IndiaMART returns bare ten-digit mobiles; this is prefixed to them." },
    ],
    brand: "#2D3E88",
    featured: true,
    note:
      "IndiaMART allows one pull every five minutes and only returns the last seven days, so run it regularly rather than once.",
  },
  {
    slug: "google-calendar",
    name: "Google Calendar",
    category: "Productivity",
    description:
      "Every appointment booked on WhatsApp becomes an event in your calendar, and moves or disappears when the booking does.",
    capability: "sync",
    prerequisite:
      "Google Cloud Console → enable the Calendar API, create an OAuth client, then authorise once with the calendar scope to get a refresh token.",
    fields: [
      { name: "client_id", label: "Client ID", required: true, placeholder: "….apps.googleusercontent.com" },
      { name: "client_secret", label: "Client secret", type: "password", required: true },
      { name: "refresh_token", label: "Refresh token", type: "password", required: true },
      {
        name: "calendar_id",
        label: "Calendar",
        placeholder: "primary",
        hint: "Leave blank for your main calendar, or paste an id from Google Calendar → Settings → Integrate calendar.",
      },
    ],
    brand: "#4285F4",
    featured: true,
    note:
      "Keep the OAuth consent screen out of Testing mode. A refresh token from a Testing app expires after seven days, and the calendar quietly stops updating.",
  },
];

export function integrationBySlug(slug: string): IntegrationDef | undefined {
  return INTEGRATIONS.find((i) => i.slug === slug);
}

export const CAPABILITY_LABEL: Record<IntegrationCapability, string> = {
  live: "Works now",
  sync: "Syncs contacts",
  import: "Imports data",
  payments: "Takes payments",
  lookup: "Live lookup",
  via_webhook: "Works via webhook",
  credentials: "Stores credentials",
};

export const CAPABILITY_HELP: Record<IntegrationCapability, string> = {
  live: "Fully functional — nothing to register with a third party.",
  sync:
    "Functional today: contacts are pushed to this CRM as they arrive, matched on phone number so the same person is never created twice.",
  import:
    "Functional today: press the button and data is pulled in from this provider for real.",
  payments:
    "Functional today: payment links are created through this gateway and sent in the conversation.",
  lookup:
    "Functional today: the credentials are used for a live read whenever you ask for one.",
  via_webhook:
    "Functional today: we deliver signed events to the URL you provide, which is exactly how this provider consumes data.",
  credentials:
    "Credentials are stored encrypted and the connection is tracked, but the per-provider data sync is not implemented yet.",
};
