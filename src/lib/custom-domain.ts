// Relative, with the extension: the test runner strips types but does not
// resolve the "@/" alias, and this module has to be importable by a test.
import { hostKey, domainProblem } from "./brand.ts";

// An agency's own domain.
//
// Pure: no fetch, no env, so the rules can be tested rather than
// discovered on somebody's live domain.
//
// The whole point of this file is that an agency types their domain in
// themselves and it goes live without anybody at the platform touching
// the hosting dashboard. That means the checks that used to be a human
// glancing at the value have to be written down.

/** What to put where, at the agency's DNS provider. */
export interface DnsInstruction {
  type: "A" | "CNAME";
  /** The "Host" or "Name" box. "@" means the domain itself. */
  name: string;
  value: string;
  /** Said in words, because the boxes are labelled differently everywhere. */
  note: string;
}

/** Vercel's address for a bare domain, when nothing better is known yet. */
export const APEX_IP = "216.198.79.1";
/** Vercel's address for a subdomain. */
export const SUBDOMAIN_TARGET = "cname.vercel-dns.com";

/**
 * Why this domain cannot be used, or null when it can.
 *
 * `platformDomain` is the platform's own — the one check that is not
 * about the shape of the string. Without it an agency could claim the
 * platform's own address, or a subdomain of it, and serve their login
 * page to the platform's own customers.
 */
export function customDomainProblem(domain: string, platformDomain: string): string | null {
  const shape = domainProblem(domain);
  if (shape) return shape;

  const key = hostKey(domain);
  if (!key) return "Give the domain you want to use.";

  const platform = hostKey(platformDomain);
  if (platform && (key === platform || key.endsWith(`.${platform}`))) {
    return "That address belongs to the platform. Use a domain you own.";
  }

  // Hosting providers' own domains. Somebody who types their preview URL
  // here would be adding a domain they cannot point anywhere.
  for (const reserved of ["vercel.app", "netlify.app", "localhost", "herokuapp.com"]) {
    if (key === reserved || key.endsWith(`.${reserved}`)) {
      return `${key} is a hosting address, not a domain you own.`;
    }
  }

  // A trailing label that is all digits is an IP address with dots in it.
  const labels = key.split(".");
  if (/^\d+$/.test(labels[labels.length - 1] ?? "")) {
    return "That looks like an IP address. Give a domain name.";
  }

  if (labels.length > 5) return "That has too many parts to be a real address.";

  return null;
}

/** Whether this is a bare domain (acme.com) rather than a subdomain of one. */
export function isApex(domain: string): boolean {
  const key = hostKey(domain);
  if (!key) return false;

  const labels = key.split(".");
  if (labels.length <= 2) return true;

  // Two-part public suffixes, where acme.co.uk is still the bare domain.
  // Not the full public-suffix list — that is a megabyte of data for a
  // question whose only consequence here is which record to suggest, and
  // the instruction is re-read from the host anyway once it is added.
  const TWO_PART = new Set([
    "co.uk", "org.uk", "me.uk", "ac.uk", "gov.uk",
    "co.in", "net.in", "org.in", "firm.in", "gen.in", "ind.in",
    "com.au", "net.au", "org.au",
    "co.nz", "co.za", "com.br", "com.sg", "com.my",
  ]);
  return labels.length === 3 && TWO_PART.has(labels.slice(-2).join("."));
}

/**
 * The record the agency has to add, and where.
 *
 * A bare domain needs an A record because a CNAME cannot sit beside the
 * MX records that carry the agency's email — point acme.com at us with a
 * CNAME and their mail stops arriving. A subdomain has no such problem.
 */
export function dnsInstructionFor(domain: string): DnsInstruction {
  const key = hostKey(domain);

  if (isApex(key)) {
    return {
      type: "A",
      name: "@",
      value: APEX_IP,
      note: `An A record on ${key} itself. Some providers call the name box “@”, some leave it blank, some want the full domain.`,
    };
  }

  const label = key.split(".")[0] ?? "app";
  return {
    type: "CNAME",
    name: label,
    value: SUBDOMAIN_TARGET,
    note: `A CNAME record named “${label}”. Some providers want just that word, some want the whole ${key}.`,
  };
}

/**
 * Whether pointing this domain here would take the agency's website with it.
 *
 * Worth saying out loud before they do it. An agency that points
 * acme.com at us has moved their company website, not added a product —
 * and they usually meant app.acme.com.
 */
export function wouldReplaceTheirSite(domain: string): boolean {
  return isApex(domain);
}

/** How far along a domain is, in the only three states that matter. */
export type DomainState = "none" | "pending" | "live";

export function describeState(state: DomainState, domain: string | null): string {
  if (state === "live") return `${domain} is live. Send your customers there.`;
  if (state === "pending") {
    return `Waiting for ${domain} to point here. This usually takes a few minutes, sometimes a few hours.`;
  }
  return "No domain set up yet.";
}
