import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { customEmail, type EmailBody, type EmailBrand } from "@/lib/email-templates";
import { isOn, readSwitches, type Switches } from "@/lib/email-automation";
import { fillIn, paragraphs, preheaderFrom } from "@/lib/email-compose";

// The operator's say over the automatic mail.
//
// Two questions, asked at the one place every message already passes
// through: may this kind go out at all, and did somebody rewrite it.
// Putting them in sendEmail rather than at each of the eight call sites
// is what stops a new caller quietly bypassing both — the next person to
// add an automatic email gets the switch and the override for free,
// because they cannot send without going through here.
//
// Cached for a minute. These are read on every send, including inside a
// sweep that writes to four hundred workspaces in a loop, and two queries
// per message for a pair of values that change about twice a year is a
// nightly job made slow for nothing.

interface Override {
  subject: string;
  body: string;
  actionLabel: string | null;
  actionPath: string | null;
}

interface Policy {
  switches: Switches;
  overrides: Map<string, Override>;
}

const TTL_MS = 60_000;
let cached: { at: number; policy: Policy } | null = null;

/** Dropped when the admin screen saves, so an edit is visible at once. */
export function forgetEmailPolicy(): void {
  cached = null;
}

async function load(): Promise<Policy> {
  const supabase = createAdminClient();

  const [{ data: setting }, { data: rows }] = await Promise.all([
    supabase.from("platform_settings").select("value").eq("key", "email_automation").maybeSingle(),
    supabase
      .from("email_templates")
      .select("overrides_kind, subject, body, action_label, action_path")
      .not("overrides_kind", "is", null)
      .eq("is_active", true),
  ]);

  const overrides = new Map<string, Override>();
  for (const row of rows ?? []) {
    if (!row.overrides_kind) continue;
    overrides.set(row.overrides_kind, {
      subject: row.subject,
      body: row.body,
      actionLabel: row.action_label,
      actionPath: row.action_path,
    });
  }

  return { switches: readSwitches(setting?.value), overrides };
}

async function policy(): Promise<Policy> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.policy;

  try {
    const fresh = await load();
    cached = { at: Date.now(), policy: fresh };
    return fresh;
  } catch (error) {
    // A missing table — the migration has not been run — must not stop
    // mail. Everything on, nothing rewritten, which is exactly how the
    // product behaved before any of this existed.
    console.error("Could not read the email policy; sending as configured in code", error);
    return { switches: readSwitches(null), overrides: new Map() };
  }
}

/** Whether this kind of automatic message is switched on. */
export async function maySend(kind: string): Promise<boolean> {
  return isOn((await policy()).switches, kind);
}

/**
 * The operator's wording for this kind, built with the values the caller
 * had, or null when nobody has rewritten it.
 *
 * Values are per-recipient — the workspace's name, their days left — so
 * this is called once per message rather than once per sweep, which is
 * why the expensive part is the cache above and not this.
 */
export async function overrideBody(
  kind: string,
  brand: EmailBrand,
  values: Record<string, string | null | undefined>
): Promise<EmailBody | null> {
  const found = (await policy()).overrides.get(kind);
  if (!found) return null;

  const body = fillIn(found.body, values);
  const label = found.actionLabel?.trim();
  const path = found.actionPath?.trim();

  return customEmail(brand, {
    subject: fillIn(found.subject, values),
    preheader: preheaderFrom(body),
    paragraphs: paragraphs(body),
    action: label && path ? { label, href: `${brand.appUrl}${path}` } : null,
  });
}
