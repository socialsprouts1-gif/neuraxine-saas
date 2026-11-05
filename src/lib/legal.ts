// Company details used across the legal pages. Meta, Google and every app
// store reviewer checks that a privacy policy names a real, contactable
// entity — so these are collected in one place rather than scattered
// through the page copy, and are meant to be edited before launch.
//
// NOT LEGAL ADVICE. The pages built from this describe what the software
// actually does, which is the honest starting point, but a lawyer in your
// jurisdiction should review them before you take paying customers.

export const LEGAL = {
  productName: "Neura Chat",
  companyName: "Neuraxine",
  // TODO: replace with your registered entity name and address.
  legalEntity: "Neuraxine",
  address: "India",
  jurisdiction: "India",

  // TODO: use a mailbox you actually monitor. Reviewers do email these.
  contactEmail: "support@neuraxine.in",
  privacyEmail: "privacy@neuraxine.in",

  lastUpdated: "22 August 2026",
} as const;

// The third parties that process customer data on our behalf. Naming them
// is a GDPR/DPDP requirement and, more practically, it is what an
// enterprise customer's security review asks for first.
export const SUBPROCESSORS = [
  {
    name: "Meta Platforms",
    purpose: "WhatsApp Business Platform — delivers and receives every message",
    location: "United States, Ireland",
  },
  {
    name: "Supabase",
    purpose: "Database, authentication and file storage",
    location: "Per project region",
  },
  {
    name: "Vercel",
    purpose: "Application hosting and edge network",
    location: "United States",
  },
  {
    name: "Anthropic",
    purpose:
      "Generates AI Assistant replies. Only used when you enable an AI Assistant, and only the conversation it is replying to is sent",
    location: "United States",
  },
] as const;
