// Turning a WhatsApp contact into a CRM record.
//
// Three providers, three different words for the same six fields. HubSpot
// wants flat `properties`, Zoho wants a `data` array with capitalised keys,
// Salesforce wants a Lead with a mandatory LastName. The mapping is the part
// that is easy to get subtly wrong and impossible to notice — a contact
// lands in the CRM with a blank name and nobody finds out for a month — so
// it lives here, on its own, and is tested.
//
// Pure by design: no fetch, no env, no server-only. The HTTP half is in
// crm-sync.ts.

export type CrmProvider = "hubspot" | "zoho-crm" | "salesforce";

/** The catalogue slugs this module can actually push to. */
export const CRM_PROVIDERS: CrmProvider[] = ["hubspot", "zoho-crm", "salesforce"];

export function isCrmProvider(slug: string): slug is CrmProvider {
  return (CRM_PROVIDERS as string[]).includes(slug);
}

export const CRM_LABEL: Record<CrmProvider, string> = {
  hubspot: "HubSpot",
  "zoho-crm": "Zoho CRM",
  salesforce: "Salesforce",
};

/** What each provider calls the thing we create. */
export const CRM_RECORD_LABEL: Record<CrmProvider, string> = {
  hubspot: "contact",
  "zoho-crm": "lead",
  salesforce: "lead",
};

/**
 * A contact, as far as a CRM cares.
 *
 * `waId` is the WhatsApp id — digits, no plus — and is the only field
 * guaranteed to exist. Everything else may be blank, which is exactly why
 * each provider needs its own fallback for the name.
 */
export interface CrmContact {
  waId: string;
  name: string | null;
  email: string | null;
  company: string | null;
  leadStage: string | null;
  source: string | null;
  leadScore: number | null;
  tags: string[];
}

/** Where a contact ended up in each CRM, keyed by provider slug. */
export type CrmRefs = Partial<Record<CrmProvider, string>>;

/**
 * E.164, which is what all three expect.
 *
 * A wa_id is already a full international number without the plus — Meta
 * strips it — so this is a prefix, not a guess at a country code.
 */
export function toE164(waId: string): string {
  const digits = waId.replace(/\D/g, "");
  return digits ? `+${digits}` : "";
}

/**
 * Splits a display name into first and last.
 *
 * Everything after the first space is the surname, so "Ravi Kumar Sharma"
 * keeps "Kumar Sharma" together rather than dropping the middle name. A
 * single-word name goes in the surname for Salesforce and Zoho, whose Lead
 * object requires one and would otherwise reject the record.
 */
export function splitName(name: string | null, fallback: string): {
  firstName: string;
  lastName: string;
} {
  const trimmed = (name ?? "").trim().replace(/\s+/g, " ");
  if (!trimmed) return { firstName: "", lastName: fallback };

  const space = trimmed.indexOf(" ");
  if (space === -1) return { firstName: "", lastName: trimmed };
  return { firstName: trimmed.slice(0, space), lastName: trimmed.slice(space + 1) };
}

/**
 * Our lead stages in the words each CRM uses.
 *
 * Left unmapped, a stage is simply not sent: writing "demo" into a picklist
 * that has never heard of it fails the whole record in Zoho and Salesforce,
 * and a contact with a missing stage is better than no contact.
 */
const HUBSPOT_STAGE: Record<string, string> = {
  new: "subscriber",
  contacted: "lead",
  qualified: "marketingqualifiedlead",
  demo: "salesqualifiedlead",
  proposal: "opportunity",
  won: "customer",
  lost: "other",
};

const SALESFORCE_STATUS: Record<string, string> = {
  new: "Open - Not Contacted",
  contacted: "Working - Contacted",
  qualified: "Working - Contacted",
  demo: "Working - Contacted",
  proposal: "Working - Contacted",
  won: "Closed - Converted",
  lost: "Closed - Not Converted",
};

const ZOHO_STATUS: Record<string, string> = {
  new: "Not Contacted",
  contacted: "Contacted",
  qualified: "Contacted",
  demo: "Contacted",
  proposal: "Contacted",
  won: "Contacted",
  lost: "Not Contacted",
};

/** The line that says where this record came from, in every provider. */
function sourceLine(contact: CrmContact): string {
  return contact.source ? `WhatsApp · ${contact.source}` : "WhatsApp";
}

export interface HubspotPayload {
  properties: Record<string, string>;
}

export function hubspotProperties(contact: CrmContact): HubspotPayload {
  const { firstName, lastName } = splitName(contact.name, toE164(contact.waId));
  const properties: Record<string, string> = {
    phone: toE164(contact.waId),
  };

  if (firstName) properties.firstname = firstName;
  if (lastName) properties.lastname = lastName;
  if (contact.email) properties.email = contact.email;
  if (contact.company) properties.company = contact.company;
  properties.hs_lead_status = "NEW";
  properties.lifecyclestage =
    HUBSPOT_STAGE[contact.leadStage ?? ""] ?? HUBSPOT_STAGE.new;

  return { properties };
}

export interface ZohoPayload {
  data: Array<Record<string, unknown>>;
  duplicate_check_fields?: string[];
}

export function zohoLead(contact: CrmContact): ZohoPayload {
  const { firstName, lastName } = splitName(contact.name, toE164(contact.waId));
  const record: Record<string, unknown> = {
    // Zoho rejects a Lead without Last_Name, and rejects Company on the
    // Leads module being blank on most editions — the phone number stands in
    // for both rather than the record being dropped.
    Last_Name: lastName || toE164(contact.waId),
    Company: contact.company || contact.name || toE164(contact.waId),
    Phone: toE164(contact.waId),
    Lead_Source: sourceLine(contact),
  };

  if (firstName) record.First_Name = firstName;
  if (contact.email) record.Email = contact.email;

  const status = ZOHO_STATUS[contact.leadStage ?? ""];
  if (status) record.Lead_Status = status;
  if (contact.leadScore !== null) record.Rating = String(contact.leadScore);
  if (contact.tags.length > 0) record.Tag = contact.tags.map((name) => ({ name }));

  // Phone is what makes two WhatsApp contacts the same person; without this
  // every sync creates a fresh duplicate.
  return { data: [record], duplicate_check_fields: ["Phone"] };
}

export function salesforceLead(contact: CrmContact): Record<string, string> {
  const { firstName, lastName } = splitName(contact.name, toE164(contact.waId));
  const record: Record<string, string> = {
    LastName: lastName || toE164(contact.waId),
    // Company is required on Lead. There is no way round it, so the contact's
    // own name stands in when we do not know where they work.
    Company: contact.company || contact.name || toE164(contact.waId),
    Phone: toE164(contact.waId),
    MobilePhone: toE164(contact.waId),
    LeadSource: "Other",
    Description: sourceLine(contact),
  };

  if (firstName) record.FirstName = firstName;
  if (contact.email) record.Email = contact.email;

  const status = SALESFORCE_STATUS[contact.leadStage ?? ""];
  if (status) record.Status = status;

  return record;
}

/** SOQL escaping. Only a quote can break out, and only a backslash hides it. */
export function escapeSoql(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/**
 * The row shape the sync log stores, so both the writer and the screen that
 * reads it agree on what an entry means.
 */
export interface CrmSyncOutcome {
  provider: CrmProvider;
  contactId: string;
  status: "created" | "updated" | "skipped" | "failed";
  externalId: string | null;
  error: string | null;
}

/**
 * Reads a contact row into the shape above.
 *
 * Email and company are not columns — they live in the custom_fields jsonb
 * that Manage → Columns writes — so this looks under the handful of keys
 * people actually name them.
 */
export function crmContactFromRow(row: {
  wa_id: string;
  name?: string | null;
  tags?: string[] | null;
  lead_stage?: string | null;
  lead_score?: number | null;
  source?: string | null;
  custom_fields?: Record<string, unknown> | null;
}): CrmContact {
  const custom = row.custom_fields ?? {};
  const pick = (...keys: string[]): string | null => {
    for (const key of keys) {
      const value = custom[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return null;
  };

  return {
    waId: row.wa_id,
    name: row.name ?? null,
    email: pick("email", "Email", "email_address"),
    company: pick("company", "Company", "organisation", "organization", "business"),
    leadStage: row.lead_stage ?? null,
    source: row.source ?? null,
    leadScore: typeof row.lead_score === "number" ? row.lead_score : null,
    tags: row.tags ?? [],
  };
}
