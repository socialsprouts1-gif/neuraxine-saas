// The WhatsApp messages the platform sends its own customers.
//
// Pure by design: no fetch, no env, no server-only, so it can be tested.
//
// This started as one setting — a welcome for new sign-ups — and the
// moments that matter turned out to be the same shape: something happens
// to a customer's account, and a template goes to the number they gave.
// So it is a list rather than a special case, and adding a fourth moment
// means adding a row to EVENTS and nothing else.
//
// Every one of them has to be an approved template. These reach people
// who have not messaged the platform, so WhatsApp's 24-hour service
// window is shut and Meta refuses free-form text to them outright.

export type EventKey = "otp" | "signup" | "trial_ended" | "payment_received";

export interface EventMeta {
  key: EventKey;
  label: string;
  /** What has just happened, in the words somebody configuring it thinks in. */
  when: string;
  /** A template name that would make sense here, shown as the placeholder. */
  suggestion: string;
  /**
   * Whether this one carries a one-time code rather than a greeting.
   *
   * The code event is the odd one out in every direction: its template has
   * to be an AUTHENTICATION template, its one variable is the code and
   * never the person's name, and it is sent again every time somebody asks
   * for another — so the "already sent this" rule the others rely on has
   * to be off for it.
   */
  carriesCode?: boolean;
}

export const EVENTS: EventMeta[] = [
  {
    key: "otp",
    label: "Sign-up code",
    when: "Somebody types their WhatsApp number while signing up and has to prove it is theirs.",
    suggestion: "signup_code",
    carriesCode: true,
  },
  {
    key: "signup",
    label: "New sign-up",
    when: "Somebody creates an account and gives their WhatsApp number.",
    suggestion: "welcome_to_neurachat",
  },
  {
    key: "trial_ended",
    label: "Free trial ended",
    when: "A workspace's trial runs out and sending is paused until they pay.",
    suggestion: "trial_ended_choose_a_plan",
  },
  {
    key: "payment_received",
    label: "Payment received",
    when: "A payment lands and the workspace goes onto a plan.",
    suggestion: "payment_received_thanks",
  },
];

export interface EventMessage {
  enabled: boolean;
  /** An approved template on the sending number. */
  templateName: string;
  language: string;
  /**
   * Whether the template takes the person's name as its one variable.
   *
   * It has to match what Meta holds. A template declaring one variable
   * sent none is refused with 132000, and one declaring none sent a
   * parameter is refused exactly as hard.
   */
  usesName: boolean;
}

export interface WhatsAppEventSettings {
  /** The workspace whose WhatsApp connection sends these — the platform's own. */
  orgId: string;
  /** Which of that workspace's numbers. Empty means its default. */
  connectionId: string;
  messages: Record<EventKey, EventMessage>;
}

const BLANK: EventMessage = {
  enabled: false,
  templateName: "",
  language: "en",
  usesName: false,
};

export const DEFAULT_EVENTS: WhatsAppEventSettings = {
  orgId: "",
  connectionId: "",
  messages: {
    otp: { ...BLANK },
    signup: { ...BLANK },
    trial_ended: { ...BLANK },
    payment_received: { ...BLANK },
  },
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readMessage(value: unknown): EventMessage {
  const raw = (value ?? {}) as Record<string, unknown>;
  return {
    // Off unless literally true. A half-configured message that tries to
    // send is one Meta error per customer, and nobody would see them.
    enabled: raw.enabled === true,
    templateName: text(raw.template_name).toLowerCase(),
    language: text(raw.language) || "en",
    usesName: raw.uses_name === true,
  };
}

/**
 * Reads the stored settings, in either shape.
 *
 * The first version of this was a single flat welcome — enabled,
 * template_name and the rest at the top level. Those rows still exist, so
 * a flat one is read as the sign-up message rather than thrown away and
 * silently switched off on whoever had already configured it.
 */
export function readEvents(value: unknown): WhatsAppEventSettings {
  const raw = (value ?? {}) as Record<string, unknown>;
  const messages = raw.messages as Record<string, unknown> | undefined;

  const settings: WhatsAppEventSettings = {
    orgId: text(raw.org_id),
    connectionId: text(raw.connection_id),
    messages: {
      otp: readMessage(messages?.otp),
      signup: readMessage(messages?.signup),
      trial_ended: readMessage(messages?.trial_ended),
      payment_received: readMessage(messages?.payment_received),
    },
  };

  // The old flat shape, carried forward onto the sign-up message.
  if (!messages && (raw.template_name !== undefined || raw.enabled !== undefined)) {
    settings.messages.signup = readMessage(raw);
  }

  return settings;
}

export function writeEvents(settings: WhatsAppEventSettings): Record<string, unknown> {
  const messages: Record<string, unknown> = {};
  for (const event of EVENTS) {
    const message = settings.messages[event.key];
    messages[event.key] = {
      enabled: message.enabled,
      template_name: message.templateName,
      language: message.language,
      uses_name: message.usesName,
    };
  }

  return {
    org_id: settings.orgId,
    connection_id: settings.connectionId,
    messages,
  };
}

/**
 * Why one message cannot send, or null when it can.
 *
 * The reason rather than a boolean, because this is shown to whoever is
 * configuring it: "not set up" tells them nothing about which field they
 * left blank.
 */
export function messageProblem(
  settings: WhatsAppEventSettings,
  key: EventKey
): string | null {
  const message = settings.messages[key];
  if (!message.enabled) return null;

  if (!settings.orgId) return "Choose which of your WhatsApp numbers sends these.";
  if (!message.templateName) return "Choose the approved template to send.";
  if (!/^[a-z0-9_]+$/.test(message.templateName)) {
    return "A template name is lowercase letters, digits and underscores — pick it from the list rather than typing it.";
  }
  if (!message.language) return "Give the template's language, such as en or en_US.";
  return null;
}

/** The first problem across every switched-on message, for a save to refuse on. */
export function firstProblem(settings: WhatsAppEventSettings): string | null {
  for (const event of EVENTS) {
    const problem = messageProblem(settings, event.key);
    if (problem) return `${event.label}: ${problem}`;
  }
  return null;
}

export function canSend(settings: WhatsAppEventSettings, key: EventKey): boolean {
  return settings.messages[key].enabled && messageProblem(settings, key) === null;
}

export interface EventComponent {
  type: "body";
  parameters: Array<Record<string, unknown>>;
}

/**
 * The template parameters for one recipient.
 *
 * Empty unless the template declares a variable, because Meta counts them
 * and refuses a mismatch outright.
 */
export function eventComponents(
  settings: WhatsAppEventSettings,
  key: EventKey,
  name: string
): EventComponent[] {
  // The code template's one variable is the code, which this function has
  // no business knowing — see otpComponents in signup-otp.ts. Guarded here
  // so a caller that reaches for the wrong one sends nothing rather than
  // somebody's name where Meta expects six digits.
  if (carriesCode(key)) return [];
  if (!settings.messages[key].usesName) return [];
  // Never blank: Meta refuses an empty parameter, and "there" reads as a
  // greeting rather than as a missing value.
  const value = (name ?? "").trim() || "there";
  return [{ type: "body", parameters: [{ type: "text", text: value }] }];
}

/** The first name, for a greeting. "Vivek Sharma" should not say "Hi Vivek Sharma". */
export function greetingName(fullName: string | null | undefined): string {
  return (fullName ?? "").trim().split(/\s+/)[0] ?? "";
}

/** Whether this event's template carries a one-time code rather than a name. */
export function carriesCode(key: EventKey): boolean {
  return EVENTS.find((event) => event.key === key)?.carriesCode === true;
}

/** How a sent message is labelled in the inbox, and how a repeat is recognised. */
export function eventSource(key: EventKey): string {
  const found = EVENTS.find((event) => event.key === key);
  return found ? found.label : key;
}
