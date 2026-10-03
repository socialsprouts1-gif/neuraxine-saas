import type { Metadata } from "next";
import Link from "next/link";
import { LegalShell, Section, List } from "@/components/legal/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: `Data Deletion · ${LEGAL.productName}`,
  description: `How to delete your data from ${LEGAL.productName}.`,
};

// Meta asks for a User Data Deletion URL on apps that handle user data,
// and it must be a real page with real instructions rather than a section
// buried in the privacy policy.

export default function DataDeletionPage() {
  return (
    <LegalShell
      title="Deleting your data"
      intro="Three situations, three different answers. Find the one that describes you."
    >
      <Section title="You were messaged by a business using Neura Chat">
        <p>
          Your conversation belongs to that business, not to us — we store it on their behalf,
          the same way an email host stores their inbox. <strong>Ask them to delete it.</strong>{" "}
          They can remove your contact record and its entire conversation history from their
          dashboard, immediately and without contacting us.
        </p>
        <p>
          If the business is unresponsive, email{" "}
          <a href={`mailto:${LEGAL.privacyEmail}`}>{LEGAL.privacyEmail}</a> from the phone
          number&apos;s associated address or tell us the number and the business, and we will
          pass the request on and follow up.
        </p>
      </Section>

      <Section title="You have a Neura Chat account">
        <p>You can delete data yourself at any level of granularity:</p>
        <List
          items={[
            <>
              <strong>A single contact and their history</strong> — Contacts → delete. The
              conversation and all its messages go with them.
            </>,
            <>
              <strong>Your WhatsApp connection</strong> — Settings → Disconnect. This removes
              the stored access token immediately.
            </>,
            <>
              <strong>Everything</strong> — email{" "}
              <a href={`mailto:${LEGAL.privacyEmail}`}>{LEGAL.privacyEmail}</a> from your
              account address with the subject <code>Delete my account</code>. We verify the
              request, delete the organisation and everything belonging to it, and confirm by
              email. Within 30 days end to end, usually within a few days.
            </>,
          ]}
        />
        <p>
          Deletion cascades from the organisation record: contacts, conversations, messages,
          bots, FAQ entries, automations, integrations, API keys and encrypted credentials are
          all removed. Backups age out within 30 days.
        </p>
        <p>
          We keep invoices and payment records where tax law requires it. Those contain billing
          details, not conversation content.
        </p>
      </Section>

      <Section title="You signed in with Facebook or Google">
        <p>
          Removing {LEGAL.productName} from your Facebook or Google account settings revokes
          our access, but it does not by itself delete data we already hold. To delete that,
          send the account deletion request described above.
        </p>
      </Section>

      <Section title="What we will ask you for">
        <p>
          Only enough to be sure we are deleting the right person&apos;s data: that the request
          comes from the account&apos;s registered email address, or for a contact-level
          request, the phone number and the business concerned. We will not ask for your
          password, and we will never ask for a WhatsApp verification code.
        </p>
        <p>
          Questions about any of this: <Link href="/privacy">read the privacy policy</Link> or
          write to <a href={`mailto:${LEGAL.privacyEmail}`}>{LEGAL.privacyEmail}</a>.
        </p>
      </Section>
    </LegalShell>
  );
}
