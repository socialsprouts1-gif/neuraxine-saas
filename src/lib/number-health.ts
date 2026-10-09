// What Meta actually thinks of the account a number sends from.
//
// Pure by design: no fetch, no env, no server-only, so it can be tested.
//
// The gap this closes: a business portfolio can show "Verified" and a
// payment method next to a green tick, and sends still fail — because
// that panel was showing a different WhatsApp Business Account than the
// one the app sends from. Portfolios routinely hold several, often with
// the same name, and the WhatsApp Business app appears in the same list
// as the Cloud API accounts. Checking the wrong one looks exactly like
// checking the right one.
//
// So the fix is not advice. It is reading the facts back for the exact
// WABA id the app is configured with, and saying which gate is shut.

export interface NumberFacts {
  /** The account the app is configured to send from. */
  wabaId: string;
  phoneNumberId: string;
  /** Whether the WABA actually lists this phone number id. */
  numberOnWaba: boolean;
  /** The numbers it does list, for when it does not. */
  wabaNumbers: string[];
  /** Meta's own strings. Absent when Meta did not return the field. */
  businessVerification?: string | null;
  accountReview?: string | null;
  qualityRating?: string | null;
  platformType?: string | null;
  numberStatus?: string | null;
  nameStatus?: string | null;
  /** What Meta calls this account, and what kind it says it is. */
  wabaName?: string | null;
  ownershipType?: string | null;
  /**
   * Whether the token may manage templates here.
   *
   * true / false from an actual probe, null when Meta could not be asked.
   */
  canManageTemplates?: boolean | null;
  manageProblem?: string | null;
  /** The Meta app the stored token was issued by. */
  connectionAppId?: string | null;
  /** The Meta app this deployment is configured as. */
  deploymentAppId?: string | null;
}

export type CheckTone = "ok" | "warn" | "bad" | "unknown";

export interface Check {
  label: string;
  tone: CheckTone;
  detail: string;
}

const norm = (value: string | null | undefined) => value?.trim().toUpperCase() ?? "";

/**
 * The line that matters most, first.
 *
 * Ordered by what blocks what: an id mismatch makes every other answer
 * on this page about the wrong account, so it goes above them.
 */
export function healthChecks(facts: NumberFacts): Check[] {
  const checks: Check[] = [];

  checks.push(numberBelongsCheck(facts));
  checks.push(accountIdentityCheck(facts));
  checks.push(verificationCheck(facts.businessVerification));
  checks.push(reviewCheck(facts.accountReview));
  checks.push(numberStatusCheck(facts.numberStatus));
  checks.push(qualityCheck(facts.qualityRating));
  checks.push(platformCheck(facts.platformType));
  checks.push(templateManagementCheck(facts));
  checks.push(appIdentityCheck(facts));

  return checks;
}

function numberBelongsCheck(facts: NumberFacts): Check {
  if (facts.numberOnWaba) {
    return {
      label: "Number is on this account",
      tone: "ok",
      detail: `WhatsApp Business Account ${facts.wabaId} lists this number. Everything below is about that account — the one the app actually sends from.`,
    };
  }

  const listed = facts.wabaNumbers.filter(Boolean).join(", ");
  return {
    label: "Number is on this account",
    tone: "bad",
    detail: `Account ${facts.wabaId} does not list this number — it holds ${
      listed || "no numbers at all"
    }. Sending may still work, because a send only uses the number id, but templates, forms and flows are created on the account and will keep failing. Correct the WABA id under Integrations, taking it from the account in WhatsApp Manager that lists this number.`,
  };
}

/**
 * Which of your accounts this is.
 *
 * Never a fault, always worth saying. A business portfolio can hold the
 * WhatsApp Business app beside real Cloud API accounts, and several
 * accounts sharing a name — so "templates are refused on this one and
 * work on that one" is only actionable once the two can be told apart.
 * Reported rather than judged: Meta's ownership_type enum is not stable
 * enough to branch on, and guessing which values are fatal is how an
 * error message ends up confidently wrong.
 */
function accountIdentityCheck(facts: NumberFacts): Check {
  const name = facts.wabaName?.trim();
  const ownership = facts.ownershipType?.trim();

  if (!name && !ownership) {
    return {
      label: "Which account this is",
      tone: "unknown",
      detail: `Meta did not name account ${facts.wabaId}. Usually it means the token may send from it but not read its settings.`,
    };
  }

  const said = [
    name ? `Meta calls it \u201c${name}\u201d` : null,
    ownership ? `ownership type ${ownership}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return {
    label: "Which account this is",
    tone: "ok",
    detail: `${said}. Templates belong to an account, so a template created here is not available on your other numbers unless they are on this same one.`,
  };
}

function verificationCheck(value: string | null | undefined): Check {
  const status = norm(value);
  if (!status) {
    return {
      label: "Business verification",
      tone: "unknown",
      detail: "Meta did not report this. It usually means the token cannot read the account's settings, only send from it.",
    };
  }
  if (status === "VERIFIED") {
    return { label: "Business verification", tone: "ok", detail: "Verified." };
  }
  if (status === "PENDING" || status === "PENDING_NEED_MORE_INFO" || status === "PENDING_SUBMISSION") {
    return {
      label: "Business verification",
      tone: "warn",
      detail: `Meta says ${status.toLowerCase().replace(/_/g, " ")}. Publishing a Flow stays blocked until this finishes.`,
    };
  }
  return {
    label: "Business verification",
    tone: "bad",
    detail: `Meta says ${status.toLowerCase().replace(/_/g, " ")} for THIS account. A different account in the same portfolio being verified does not carry over — verification is per business, and the Flow publish check reads this field. Meta Business Suite → Business settings → Security Centre.`,
  };
}

function reviewCheck(value: string | null | undefined): Check {
  const status = norm(value);
  if (!status) {
    return {
      label: "Account review",
      tone: "unknown",
      detail: "Meta did not report this.",
    };
  }
  if (status === "APPROVED") {
    return { label: "Account review", tone: "ok", detail: "Approved." };
  }
  if (status === "PENDING") {
    return {
      label: "Account review",
      tone: "warn",
      detail: "Meta is still reviewing this account. Template sends are usually limited until it clears.",
    };
  }
  return {
    label: "Account review",
    tone: "bad",
    detail: `Meta says ${status.toLowerCase()}. While an account is rejected or restricted its templates will not send, whatever their own status says.`,
  };
}

function numberStatusCheck(value: string | null | undefined): Check {
  const status = norm(value);
  if (!status) {
    return {
      label: "Number status",
      tone: "unknown",
      detail: "Meta did not report this. Some tokens and number types omit it; on its own that is not a fault.",
    };
  }
  if (status === "CONNECTED") {
    return { label: "Number status", tone: "ok", detail: "Connected and able to send." };
  }
  if (status === "PENDING" || status === "MIGRATED") {
    return {
      label: "Number status",
      tone: "warn",
      detail: `Meta says ${status.toLowerCase()}. It is not fully live yet.`,
    };
  }
  return {
    label: "Number status",
    tone: "bad",
    detail: `Meta says ${status.toLowerCase()}. A number that is flagged or restricted cannot send until that clears.`,
  };
}

function qualityCheck(value: string | null | undefined): Check {
  const rating = norm(value);
  if (!rating || rating === "UNKNOWN") {
    return {
      label: "Quality rating",
      tone: "unknown",
      detail: "Not rated yet. Normal for a number that has sent very little.",
    };
  }
  if (rating === "GREEN") {
    return { label: "Quality rating", tone: "ok", detail: "Green." };
  }
  if (rating === "YELLOW") {
    return {
      label: "Quality rating",
      tone: "warn",
      detail: "Yellow. Recipients have been blocking or reporting; the daily sending limit may be cut if it drops further.",
    };
  }
  return {
    label: "Quality rating",
    tone: "bad",
    detail: "Red. The number is close to being restricted, and sending limits are already reduced.",
  };
}

function platformCheck(value: string | null | undefined): Check {
  const platform = norm(value);
  if (!platform) {
    return { label: "Platform", tone: "unknown", detail: "Meta did not report this." };
  }
  if (platform === "CLOUD_API") {
    return { label: "Platform", tone: "ok", detail: "Cloud API, which is what this app uses." };
  }
  return {
    label: "Platform",
    tone: "bad",
    detail: `Meta says ${platform.toLowerCase().replace(/_/g, " ")}. This app sends over the Cloud API — a number still on the WhatsApp Business app or on-premises cannot be driven from here.`,
  };
}

/**
 * Whether templates can be created on this account.
 *
 * Sending and managing are separate permissions on Meta's side, which is
 * why an account can run a perfect inbox and refuse every template. The
 * only honest way to report it is to ask: listing templates needs the
 * same permission creating one does, so a successful read proves the
 * permission without writing anything.
 */
function templateManagementCheck(facts: NumberFacts): Check {
  if (facts.canManageTemplates === true) {
    return {
      label: "Templates",
      tone: "ok",
      detail:
        "The stored token can read the templates on this account, which is the same permission creating one needs. If creating still fails, the refusal is not about permission.",
    };
  }

  if (facts.canManageTemplates === false) {
    return {
      label: "Templates",
      tone: "bad",
      detail:
        facts.manageProblem ??
        "Meta will not let this token manage templates on this account. Sending and managing are separate permissions, which is why the inbox works and templates do not.",
    };
  }

  return {
    label: "Templates",
    tone: "unknown",
    detail: "This could not be checked — Meta did not answer.",
  };
}

/**
 * Which Meta app issued the token that runs this number.
 *
 * App Review approves a permission for one app, not for a business. A
 * token minted by a different app carries that other app's approvals,
 * so an approved whatsapp_business_management on the app you are looking
 * at says nothing about the token actually being used — and nothing on
 * the connection screen has ever shown which app that is.
 *
 * A mismatch is not automatically a fault: a deployment can legitimately
 * hold connections made through another app. It is reported as something
 * to check rather than something broken, because the alternative is
 * asserting a cause again.
 */
function appIdentityCheck(facts: NumberFacts): Check {
  const connection = facts.connectionAppId?.trim();
  const deployment = facts.deploymentAppId?.trim();

  if (!connection) {
    return {
      label: "Which Meta app",
      tone: "unknown",
      detail: "No Meta app is recorded against this connection.",
    };
  }

  if (!deployment) {
    return {
      label: "Which Meta app",
      tone: "unknown",
      detail: `The token was issued by Meta app ${connection}. This deployment has no app configured, so there is nothing to compare it against.`,
    };
  }

  if (connection === deployment) {
    return {
      label: "Which Meta app",
      tone: "ok",
      detail: `Meta app ${connection}, which is the one this deployment is configured as. App Review approvals on that app apply to this token.`,
    };
  }

  return {
    label: "Which Meta app",
    tone: "warn",
    detail: `The token was issued by Meta app ${connection}, but this deployment is configured as ${deployment}. App Review approves a permission for one app, not for a business — so approvals granted on ${deployment} do not apply to this token. Check which of the two actually holds whatsapp_business_management, and reconnect this number through the approved one if they differ.`,
  };
}

/** The worst thing found, for colouring the summary. */
export function worstTone(checks: readonly Check[]): CheckTone {
  if (checks.some((check) => check.tone === "bad")) return "bad";
  if (checks.some((check) => check.tone === "warn")) return "warn";
  if (checks.some((check) => check.tone === "unknown")) return "unknown";
  return "ok";
}

/**
 * One sentence for the top.
 *
 * Names the count of real problems rather than saying "issues found",
 * because one blocked gate and four is a different afternoon.
 */
export function headline(checks: readonly Check[]): string {
  const bad = checks.filter((check) => check.tone === "bad").length;
  const warn = checks.filter((check) => check.tone === "warn").length;

  if (bad > 0) {
    return `${bad} thing${bad === 1 ? "" : "s"} here will stop messages going out. Meta reported ${
      bad === 1 ? "it" : "them"
    } for this exact account.`;
  }
  if (warn > 0) {
    return `Nothing is blocked outright, but ${warn} thing${warn === 1 ? " needs" : "s need"} attention.`;
  }
  // Two different "still not working"s, and they lead to different places.
  // A send that fails after all of this is about the message. A template
  // refused after all of this has one gate left that no Graph call
  // exposes: whether the permission sits at Standard or Advanced Access.
  // Standard only reaches assets connected to your own app, and a
  // CLIENT_OWNED account belongs to somebody else's business — which is
  // exactly the shape of a read that works and a write that does not.
  return [
    "Meta reports no problem with this account or number.",
    "If a send is failing, the reason is on the message rather than the account — check the reason shown against the failed recipients.",
    "If a template is being refused, one gate is left that no check here can see: App Review → Permissions and Features → whatsapp_business_management, and whether it reads Advanced Access or Standard Access. Standard only reaches assets connected to your own app, and this account is owned by another business.",
  ].join(" ");
}
