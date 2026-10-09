import type { Metadata } from "next";
import Link from "next/link";
import { LegalShell, Section, List } from "@/components/legal/LegalPage";
import { LEGAL, SUBPROCESSORS } from "@/lib/legal";

export const metadata: Metadata = {
  title: `Privacy Policy · ${LEGAL.productName}`,
  description: `How ${LEGAL.productName} collects, uses, stores and deletes personal data.`,
};

export default function PrivacyPage() {
  return (
    <LegalShell
      title="Privacy Policy"
      intro={`This policy explains what ${LEGAL.productName} does with personal data — the data of the businesses who use it, and of the people they message on WhatsApp.`}
    >
      <Section title="Who we are">
        <p>
          {LEGAL.productName} is a WhatsApp automation platform operated by{" "}
          <strong>{LEGAL.legalEntity}</strong>, {LEGAL.address}. For anything in this policy,
          contact us at <a href={`mailto:${LEGAL.privacyEmail}`}>{LEGAL.privacyEmail}</a>.
        </p>
        <p>
          Businesses using {LEGAL.productName} connect <strong>their own</strong> WhatsApp
          Business Account. We are not a Business Solution Provider and we do not resell
          WhatsApp messaging — every message is sent and received under the customer&apos;s own
          Meta credentials.
        </p>
      </Section>

      <Section title="Two kinds of people, two roles">
        <p>
          This distinction determines who is responsible for what, so it comes first.
        </p>
        <List
          items={[
            <>
              <strong>Our customers</strong> — the businesses who sign up. For their account
              data we are the <strong>data controller</strong>.
            </>,
            <>
              <strong>Their contacts</strong> — the people who message a customer&apos;s WhatsApp
              number. For that data the customer is the controller and we are a{" "}
              <strong>processor</strong>: we store and process those messages on the
              customer&apos;s instruction and do not use them for our own purposes.
            </>,
          ]}
        />
        <p>
          If you were messaged by a business using {LEGAL.productName} and want your data
          removed, contact that business first — they control it. If you cannot reach them,
          write to us and we will help.
        </p>
      </Section>

      <Section title="What we collect">
        <p>
          <strong>Account data.</strong> Your email address, your organisation&apos;s name, your
          role in it, and the timestamps of these records. If you sign in with Google we
          receive your email address and name from Google, nothing else.
        </p>
        <p>
          <strong>WhatsApp connection data.</strong> Your WhatsApp Business Account ID, phone
          number ID, Meta App ID, and an access token. The access token is encrypted with
          AES-256-GCM before it is written to the database and is never displayed back to you.
        </p>
        <p>
          <strong>Conversation data.</strong> The phone numbers, WhatsApp profile names and any
          tags of the contacts who message you, the content of those messages, our replies,
          and delivery and read receipts. Media is referenced by Meta&apos;s media ID rather
          than copied to our servers.
        </p>
        <p>
          <strong>Configuration you create.</strong> Chatbot flows, FAQ entries, AI Assistant
          instructions, automations, templates, products and integration credentials.
          Integration credentials are encrypted at rest in the same way as WhatsApp tokens.
        </p>
        <p>
          <strong>Operational logs.</strong> Webhook deliveries, bot decisions and errors,
          retained so that you can audit why an automated reply was or was not sent.
        </p>
        <p>
          We do not use tracking cookies or third-party advertising pixels. The only cookies
          set are the ones needed to keep you signed in.
        </p>
      </Section>

      <Section title="What we do with it">
        <List
          items={[
            "Deliver the service: receive your inbound WhatsApp messages, match them against the bots and rules you configured, and send the replies.",
            "Show you your inbox, contacts, campaigns and analytics.",
            "Authenticate you and keep your organisation's data separated from every other organisation's.",
            "Diagnose faults, and show you an audit trail of what the automation did.",
            "Bill you, and contact you about your account.",
          ]}
        />
        <p>
          <strong>We do not sell personal data. We do not use your customers&apos; messages to
          train AI models</strong>, and our AI provider is contractually bound not to train on
          data sent through their API.
        </p>
      </Section>

      <Section title="Who else processes it">
        <p>
          We use the following sub-processors. Each one only receives what it needs to perform
          its function.
        </p>
        <div className="overflow-x-auto rounded-xl border border-white/10 mt-4">
          <table className="w-full text-sm">
            <thead className="bg-white/5">
              <tr>
                <th className="text-left font-semibold text-white/70 px-4 py-3">Provider</th>
                <th className="text-left font-semibold text-white/70 px-4 py-3">Purpose</th>
                <th className="text-left font-semibold text-white/70 px-4 py-3">Region</th>
              </tr>
            </thead>
            <tbody>
              {SUBPROCESSORS.map((processor) => (
                <tr key={processor.name} className="border-t border-white/8">
                  <td className="px-4 py-3 text-white/85 font-medium whitespace-nowrap">
                    {processor.name}
                  </td>
                  <td className="px-4 py-3 text-white/55">{processor.purpose}</td>
                  <td className="px-4 py-3 text-white/45 whitespace-nowrap">
                    {processor.location}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4">
          Message content necessarily passes through Meta — that is what sending a WhatsApp
          message means. Meta&apos;s handling of it is governed by{" "}
          <a href="https://www.whatsapp.com/legal/business-data-transfer-addendum" target="_blank" rel="noopener noreferrer">
            the WhatsApp Business Data Transfer Addendum
          </a>{" "}
          and their own privacy policy.
        </p>
      </Section>

      <Section title="How we protect it">
        <List
          items={[
            <>
              <strong>Tenant isolation is enforced in the database</strong>, not just in
              application code. Every table has row-level security, and a query can only reach
              rows belonging to an organisation the signed-in user is a member of.
            </>,
            <>
              <strong>Credentials are encrypted at rest</strong> with AES-256-GCM. WhatsApp
              access tokens and third-party integration credentials are never returned to the
              browser.
            </>,
            <>
              <strong>Inbound webhooks are cryptographically verified.</strong> Every delivery
              is checked against an HMAC-SHA256 signature using a constant-time comparison
              before its contents are trusted.
            </>,
            <>
              <strong>API keys are stored as hashes.</strong> The key itself is shown once at
              creation and cannot be recovered afterwards.
            </>,
            "All traffic is served over HTTPS.",
          ]}
        />
        <p>
          No system is perfectly secure. If you believe you have found a vulnerability, please
          email <a href={`mailto:${LEGAL.privacyEmail}`}>{LEGAL.privacyEmail}</a> rather than
          disclosing it publicly, and we will respond.
        </p>
      </Section>

      <Section title="How long we keep it">
        <p>
          Conversation and configuration data is kept for as long as your account is active,
          because an inbox you cannot scroll back through is not an inbox. Operational logs are
          kept for a shorter period, sufficient to investigate faults.
        </p>
        <p>
          When you delete your organisation, its data is deleted with it —
          contacts, conversations, messages, bots and credentials all cascade from the
          organisation record. Backups age out on their own schedule, within 30 days.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          Depending on where you live, you may have the right to access, correct, export or
          delete your personal data, to object to or restrict processing, and to complain to a
          supervisory authority. These rights apply under the GDPR, and comparable rights exist
          under India&apos;s Digital Personal Data Protection Act and several other regimes.
        </p>
        <p>
          Exercise any of them by emailing{" "}
          <a href={`mailto:${LEGAL.privacyEmail}`}>{LEGAL.privacyEmail}</a>. We will respond
          within 30 days. For deletion specifically, see{" "}
          <Link href="/data-deletion">our data deletion instructions</Link>.
        </p>
      </Section>

      <Section title="Children">
        <p>
          {LEGAL.productName} is a business tool and is not directed at children. We do not
          knowingly collect data from anyone under 16. If you believe we have, tell us and we
          will delete it.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          If we change this policy materially we will email account owners before the change
          takes effect. The date at the top always reflects the current version.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          <strong>{LEGAL.legalEntity}</strong>
          <br />
          {LEGAL.address}
          <br />
          <a href={`mailto:${LEGAL.privacyEmail}`}>{LEGAL.privacyEmail}</a>
        </p>
      </Section>
    </LegalShell>
  );
}
