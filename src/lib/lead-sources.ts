import "server-only";

import { jsonHeaders, providerFetch } from "@/lib/provider-http";
import { META_API_VERSION } from "@/lib/meta-whatsapp";
import { LEAD_LABEL, LEAD_PROVIDERS, type LeadProvider } from "@/lib/provider-meta";

export type { LeadProvider };
export { LEAD_LABEL, LEAD_PROVIDERS };

// Pulling leads in from where they are generated.
//
// Facebook and Instagram lead forms, and IndiaMART buyer enquiries. Both
// produce a name and a phone number and both are useless if nobody follows
// up within the hour, which is the whole reason for having them here: a lead
// that lands as a contact can be messaged on WhatsApp immediately.
//
// Polled rather than pushed. Facebook's leadgen webhook would be better, but
// it needs a second webhook subscription and a page-level app review; this
// works with the token the tenant already pasted, today.

export interface LeadConnection {
  provider: LeadProvider;
  credentials: Record<string, string>;
  config: Record<string, string>;
}

/** A lead, in the shape a contact is stored in. */
export interface ImportedLead {
  /** Digits only, no plus — a wa_id. */
  waId: string;
  name: string | null;
  email: string | null;
  company: string | null;
  /** What it was about, for the contact's notes. */
  note: string | null;
  /** Goes on contacts.source. */
  source: string;
}

export type LeadResult =
  | { ok: true; leads: ImportedLead[] }
  | { ok: false; error: string };

/**
 * A phone number as a wa_id: digits, no plus, with a country code.
 *
 * The default matters. IndiaMART returns bare ten-digit Indian mobiles, and
 * sending to one without the 91 either fails or, worse, reaches somebody
 * else in another country.
 */
export function toWaId(raw: string, defaultCountryCode = "91"): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length < 7) return null;

  // A ten-digit number is a local one; anything longer already carries its
  // country code.
  if (digits.length === 10) return `${defaultCountryCode}${digits}`;
  // A leading zero is a trunk prefix, which never belongs in an E.164 number.
  if (digits.length === 11 && digits.startsWith("0")) {
    return `${defaultCountryCode}${digits.slice(1)}`;
  }
  return digits;
}

// ------------------------------------------------------ Facebook Lead Ads

interface FacebookLead {
  id: string;
  created_time: string;
  field_data?: Array<{ name: string; values: string[] }>;
}

/**
 * Lead form fields are named by whoever built the form, so a value is found
 * by looking for any of the names people actually use rather than one.
 */
function fieldOf(lead: FacebookLead, ...names: string[]): string | null {
  for (const name of names) {
    const found = lead.field_data?.find(
      (field) => field.name.toLowerCase().replace(/[\s_-]/g, "") === name
    );
    const value = found?.values?.[0];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

async function facebookLeads(connection: LeadConnection): Promise<LeadResult> {
  const pageId = connection.config.page_id ?? "";
  const token = connection.credentials.access_token ?? "";
  if (!pageId) return { ok: false, error: "No Facebook Page ID stored." };

  // The forms first: leads live on a form, not on the page.
  const forms = await providerFetch(
    `https://graph.facebook.com/${META_API_VERSION}/${pageId}/leadgen_forms?fields=id,name&limit=50&access_token=${encodeURIComponent(token)}`
  );

  if (!forms.ok) {
    return {
      ok: false,
      error:
        forms.status === 400 || forms.status === 403
          ? `${forms.error ?? "Facebook refused the request."} The token needs leads_retrieval and pages_show_list, and must come from a System User — a personal token dies when your password changes.`
          : (forms.error ?? "Facebook refused the request."),
    };
  }

  const formIds = ((forms.body as { data?: Array<{ id: string }> } | null)?.data ?? []).map(
    (form) => form.id
  );
  if (formIds.length === 0) {
    return { ok: false, error: "This Page has no lead forms, so there is nothing to pull." };
  }

  const leads: ImportedLead[] = [];
  const seen = new Set<string>();

  for (const formId of formIds.slice(0, 10)) {
    const result = await providerFetch(
      `https://graph.facebook.com/${META_API_VERSION}/${formId}/leads?fields=id,created_time,field_data&limit=100&access_token=${encodeURIComponent(token)}`
    );
    if (!result.ok) continue;

    for (const lead of (result.body as { data?: FacebookLead[] } | null)?.data ?? []) {
      const phone = fieldOf(lead, "phonenumber", "phone", "mobilenumber", "mobile");
      const waId = phone ? toWaId(phone, connection.config.country_code ?? "91") : null;
      // A lead form without a phone number cannot be followed up on
      // WhatsApp, which is the only thing this app could do with it.
      if (!waId || seen.has(waId)) continue;
      seen.add(waId);

      leads.push({
        waId,
        name: fieldOf(lead, "fullname", "name", "firstname"),
        email: fieldOf(lead, "email", "emailaddress"),
        company: fieldOf(lead, "companyname", "company"),
        note: fieldOf(lead, "message", "whatareyoulookingfor", "comments"),
        source: "Facebook Lead Ads",
      });
    }
  }

  return { ok: true, leads };
}

async function facebookTest(connection: LeadConnection): Promise<string | null> {
  const pageId = connection.config.page_id ?? "";
  const token = connection.credentials.access_token ?? "";
  if (!pageId) return "No Facebook Page ID stored.";

  const result = await providerFetch(
    `https://graph.facebook.com/${META_API_VERSION}/${pageId}?fields=name&access_token=${encodeURIComponent(token)}`
  );

  if (result.ok) return null;
  return `${result.error ?? "Facebook refused the request."} The token must come from a System User with leads_retrieval.`;
}

// ------------------------------------------------------------ IndiaMART

/**
 * IndiaMART's pull API takes a window and refuses anything wider than seven
 * days, in a date format of its own: DD-MON-YYYYHH:MM:SS.
 */
function indiamartStamp(date: Date): string {
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${pad(date.getUTCDate())}-${months[date.getUTCMonth()]}-${date.getUTCFullYear()}` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
  );
}

interface IndiamartLead {
  SENDER_NAME?: string;
  SENDER_MOBILE?: string;
  SENDER_EMAIL?: string;
  SENDER_COMPANY?: string;
  SUBJECT?: string;
  QUERY_MESSAGE?: string;
}

async function indiamartLeads(connection: LeadConnection): Promise<LeadResult> {
  const key = connection.credentials.crm_key ?? "";
  if (!key) return { ok: false, error: "No IndiaMART CRM key stored." };

  const now = new Date();
  const from = new Date(now.getTime() - 7 * 24 * 3_600_000);

  const params = new URLSearchParams({
    glusr_crm_key: key,
    start_time: indiamartStamp(from),
    end_time: indiamartStamp(now),
  });

  const result = await providerFetch(
    `https://mapi.indiamart.com/wservce/crm/crmListing/v2/?${params}`,
    { headers: jsonHeaders() }
  );

  if (!result.ok) {
    return {
      ok: false,
      error:
        result.status === 429
          ? "IndiaMART allows one pull every five minutes. Wait and try again."
          : (result.error ?? "IndiaMART refused the request."),
    };
  }

  const body = result.body as
    | { CODE?: number; STATUS?: string; MESSAGE?: string; RESPONSE?: IndiamartLead[] }
    | null;

  // IndiaMART answers 200 with a failure code in the body rather than a 4xx,
  // so the HTTP status cannot be trusted on its own here.
  if (body?.CODE && body.CODE !== 200) {
    return {
      ok: false,
      error: `${body.MESSAGE ?? body.STATUS ?? "IndiaMART rejected the key"} (code ${body.CODE})`,
    };
  }

  const leads: ImportedLead[] = [];
  const seen = new Set<string>();

  for (const entry of body?.RESPONSE ?? []) {
    const waId = entry.SENDER_MOBILE
      ? toWaId(entry.SENDER_MOBILE, connection.config.country_code ?? "91")
      : null;
    if (!waId || seen.has(waId)) continue;
    seen.add(waId);

    leads.push({
      waId,
      name: entry.SENDER_NAME?.trim() || null,
      email: entry.SENDER_EMAIL?.trim() || null,
      company: entry.SENDER_COMPANY?.trim() || null,
      note: [entry.SUBJECT, entry.QUERY_MESSAGE].filter(Boolean).join(" — ").slice(0, 500) || null,
      source: "IndiaMART",
    });
  }

  return { ok: true, leads };
}

async function indiamartTest(connection: LeadConnection): Promise<string | null> {
  // There is no cheap ping, so the pull is the test — and it is rate limited
  // to once every five minutes, which the message has to say.
  const result = await indiamartLeads(connection);
  return result.ok ? null : result.error;
}

// ------------------------------------------------------------- dispatch

const FETCH: Record<LeadProvider, (c: LeadConnection) => Promise<LeadResult>> = {
  "facebook-lead-ads": facebookLeads,
  indiamart: indiamartLeads,
};

const TEST: Record<LeadProvider, (c: LeadConnection) => Promise<string | null>> = {
  "facebook-lead-ads": facebookTest,
  indiamart: indiamartTest,
};

export function fetchLeads(connection: LeadConnection): Promise<LeadResult> {
  return FETCH[connection.provider](connection);
}

export function testLeadProvider(connection: LeadConnection): Promise<string | null> {
  return TEST[connection.provider](connection);
}

export const __testing = { indiamartStamp, fieldOf };
