// What a workspace is allowed to see.
//
// One entry per thing the sidebar offers. Turning a feature off hides it
// from the navigation and refuses the page — a hidden link whose URL still
// works is not "off", it is just harder to find, and anyone who has
// bookmarked it never notices.
//
// Three layers decide the answer, each one overriding the last:
//
//   1. the platform default   — what a brand new workspace gets
//   2. the plan               — what this tier includes
//   3. the workspace override — what this particular customer was given
//
// Written that way round because the common case is "everything on", the
// next most common is "this tier does not include commerce", and the rarest
// is "this one customer negotiated it". Each layer only has to say what it
// changes.

export type FeatureGroup = "Conversations" | "Growth" | "Money" | "Automation" | "Account";

export interface FeatureDef {
  key: string;
  label: string;
  group: FeatureGroup;
  /** One line for the admin toggle. */
  description: string;
  /**
   * Paths this feature owns. The first is the one the sidebar links to.
   * Matched as a prefix, so "/invoice" covers "/invoice/list".
   */
  paths: string[];
  /**
   * Locked features cannot be switched off by anybody. The product does not
   * exist without them, and a workspace that lost its inbox would look
   * broken rather than restricted.
   */
  locked?: boolean;
}

export const FEATURES: readonly FeatureDef[] = [
  // --- Conversations ---
  {
    key: "inbox",
    label: "Inbox",
    group: "Conversations",
    description: "The shared WhatsApp inbox.",
    paths: ["/inbox"],
    locked: true,
  },
  {
    key: "numbers",
    label: "WhatsApp Numbers",
    group: "Conversations",
    description: "Connecting and managing WhatsApp Business numbers.",
    paths: ["/numbers"],
    locked: true,
  },
  {
    key: "contacts",
    label: "Contacts",
    group: "Conversations",
    description: "The contact list, custom columns and tags.",
    paths: ["/contacts", "/columns", "/tags", "/groups"],
    locked: true,
  },
  {
    key: "canned",
    label: "Canned Messages",
    group: "Conversations",
    description: "Saved replies an agent can insert with a shortcut.",
    paths: ["/canned-messages"],
  },
  {
    key: "reminders",
    label: "Reminders",
    group: "Conversations",
    description: "Follow-up reminders on a conversation.",
    paths: ["/reminders"],
  },

  // --- Growth ---
  {
    key: "leads",
    label: "Leads",
    group: "Growth",
    description: "The lead board and pipeline stages.",
    paths: ["/leads"],
  },
  {
    key: "campaigns",
    label: "Campaigns",
    group: "Growth",
    description: "Bulk sends to a segment, and the approved-template picker.",
    paths: ["/campaigns", "/templates"],
  },
  {
    key: "forms",
    label: "WhatsApp Forms",
    group: "Growth",
    description: "Forms that open inside the chat.",
    paths: ["/forms"],
  },
  {
    key: "appointments",
    label: "Appointments",
    group: "Growth",
    description: "Bookable slots, the booking bot and its reminders.",
    paths: ["/appointments"],
  },
  {
    key: "meetings",
    label: "Meetings",
    group: "Growth",
    description: "The meeting list and calendar sync.",
    paths: ["/meetings"],
  },
  {
    key: "gallery",
    label: "Gallery",
    group: "Growth",
    description: "Hosted media that can be attached to a message.",
    paths: ["/gallery"],
  },
  {
    key: "opts",
    label: "Opts Management",
    group: "Growth",
    description: "Opt-in and opt-out lists for marketing sends.",
    paths: ["/opts"],
  },

  // --- Money ---
  {
    key: "invoicing",
    label: "Invoice",
    group: "Money",
    description: "GST invoices, recurring invoices and the public invoice page.",
    paths: ["/invoice", "/transactions"],
  },
  {
    key: "commerce",
    label: "Commerce",
    group: "Money",
    description: "The Meta product catalogue, product messages and orders.",
    paths: ["/commerce"],
  },
  {
    key: "wa_pay",
    label: "WA Pay",
    group: "Money",
    description: "Payment links and WhatsApp's native payment message.",
    paths: ["/wa-pay"],
  },

  // --- Automation ---
  {
    key: "chatbot",
    label: "Chatbot",
    group: "Automation",
    description: "The visual keyword-driven flow builder.",
    paths: ["/chatbot"],
  },
  {
    key: "ai_assistant",
    label: "AI Assistant",
    group: "Automation",
    description: "The AI that answers anything the rules do not.",
    paths: ["/ai-assistant"],
  },
  {
    key: "faq_bot",
    label: "FAQ Bot",
    group: "Automation",
    description: "Question-and-answer pairs matched against inbound messages.",
    paths: ["/faq-bot"],
  },
  {
    key: "automations",
    label: "Automations",
    group: "Automation",
    description: "Rules that fire on an event rather than a keyword.",
    paths: ["/automations"],
  },
  {
    key: "integrations",
    label: "Integrations",
    group: "Automation",
    description: "CRM, store, payment and calendar connections.",
    paths: ["/integrations"],
  },
  {
    key: "api",
    label: "API Endpoints",
    group: "Automation",
    description: "API keys and outgoing webhooks.",
    paths: ["/api-endpoints"],
  },

  // --- Account ---
  {
    key: "organizations",
    label: "Organizations",
    group: "Account",
    description: "Switching between workspaces and managing team members.",
    paths: ["/organizations"],
  },
  {
    key: "billing",
    label: "Billing",
    group: "Account",
    description: "The current plan, usage and payment history.",
    paths: ["/billing"],
    locked: true,
  },
  {
    key: "settings",
    label: "Settings",
    group: "Account",
    description: "Workspace settings and the team list.",
    paths: ["/settings"],
    locked: true,
  },
  {
    key: "support",
    label: "Support",
    group: "Account",
    description: "Raising a ticket with you.",
    paths: ["/support"],
    locked: true,
  },
];

export const FEATURE_GROUPS: readonly FeatureGroup[] = [
  "Conversations",
  "Growth",
  "Money",
  "Automation",
  "Account",
];

const BY_KEY = new Map(FEATURES.map((feature) => [feature.key, feature]));

export function featureDef(key: string): FeatureDef | undefined {
  return BY_KEY.get(key);
}

/** Every key that can actually be switched off. */
export function togglableKeys(): string[] {
  return FEATURES.filter((feature) => !feature.locked).map((feature) => feature.key);
}

/** Everything on. What a workspace gets when nobody has said otherwise. */
export function allFeatures(): Record<string, boolean> {
  return Object.fromEntries(FEATURES.map((feature) => [feature.key, true]));
}

/**
 * One layer of the decision: a stored object of key → boolean.
 *
 * Unknown keys are dropped rather than kept. A key left behind by a feature
 * that has since been renamed would otherwise sit in the database forever,
 * and worse, would be shown as a toggle nobody can explain.
 */
function clean(layer: unknown): Record<string, boolean> {
  if (!layer || typeof layer !== "object" || Array.isArray(layer)) return {};
  const out: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(layer as Record<string, unknown>)) {
    if (BY_KEY.has(key) && typeof value === "boolean") out[key] = value;
  }
  return out;
}

/**
 * A plan's included features, as a layer.
 *
 * An empty or absent list means "everything", not "nothing" — a plan row
 * written before features existed must not silently strip every screen from
 * the customers on it.
 */
export function planLayer(keys: unknown): Record<string, boolean> {
  if (!Array.isArray(keys) || keys.length === 0) return {};

  const included = new Set(keys.filter((key): key is string => typeof key === "string"));
  return Object.fromEntries(
    FEATURES.filter((feature) => !feature.locked).map((feature) => [
      feature.key,
      included.has(feature.key),
    ])
  );
}

export interface FeatureSources {
  /** The platform-wide default for a new workspace. */
  platform?: unknown;
  /** The plan's included keys, as a string array. */
  plan?: unknown;
  /** This workspace's own overrides. Wins over everything. */
  org?: unknown;
}

/**
 * The effective answer for one workspace.
 *
 * Locked features are forced on at the end, so no combination of a bad plan
 * row and a stale override can take the inbox away.
 */
export function resolveFeatures(sources: FeatureSources = {}): Record<string, boolean> {
  const effective = {
    ...allFeatures(),
    ...clean(sources.platform),
    ...planLayer(sources.plan),
    ...clean(sources.org),
  };

  for (const feature of FEATURES) {
    if (feature.locked) effective[feature.key] = true;
  }

  return effective;
}

/**
 * Which feature owns a path, or undefined for one nothing claims.
 *
 * Longest prefix wins, so "/invoice/settings" is matched by "/invoice"
 * rather than by a shorter entry that happens to share a prefix.
 */
export function featureForPath(pathname: string): FeatureDef | undefined {
  let best: FeatureDef | undefined;
  let bestLength = 0;

  for (const feature of FEATURES) {
    for (const path of feature.paths) {
      const matches = pathname === path || pathname.startsWith(`${path}/`);
      if (matches && path.length > bestLength) {
        best = feature;
        bestLength = path.length;
      }
    }
  }

  return best;
}

/** Whether this workspace may open this path. Unclaimed paths are allowed. */
export function pathAllowed(pathname: string, features: Record<string, boolean>): boolean {
  const owner = featureForPath(pathname);
  if (!owner) return true;
  return features[owner.key] !== false;
}
