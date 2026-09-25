import { sendTestEmail } from "../actions";
import ActionForm, { Field } from "@/components/ui/ActionForm";
import Link from "next/link";
import { Card, Badge } from "@/components/ui/primitives";
import { emailTransportName, isEmailConfigured, emailIdentity } from "@/lib/email";
import { checkFrom } from "@/lib/deliverability";

/**
 * Proof that email works, without registering an account to find out.
 *
 * Every other way of testing this is slow and destructive: the welcome is
 * deduped per workspace, so the same signup cannot be reused, and each
 * attempt leaves a real account behind. Worse, a failure looked identical
 * whether the cause was a missing variable, a wrong password or an
 * un-migrated database — all three produce silence in a mailbox.
 */
export default function EmailCheck() {
  const configured = isEmailConfigured();
  const transport = emailTransportName();
  const identity = emailIdentity();
  const posture = identity
    ? checkFrom(identity.from, identity.transport, identity.smtpHost)
    : null;

  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-center gap-2.5 mb-1">
        <h2 className="font-semibold">Email</h2>
        {configured ? (
          <Badge tone="green">sending over {transport}</Badge>
        ) : (
          <Badge tone="amber">not configured</Badge>
        )}
      </div>

      {configured ? (
        <>
          <p className="text-sm text-white/50 mb-4 leading-relaxed">
            Sends one real message now. If it arrives, welcome mail, trial reminders and payment
            receipts all use the same transport.
          </p>

          {/* Judged from the address actually configured rather than from
              the transport alone. The failure this catches is a message
              accepted by the provider and refused on arrival, which is
              invisible from the sending end and reads as mail simply not
              working. */}
          {posture && posture.level !== "ok" && (
            <div
              className={`text-[11px] mb-4 leading-relaxed ${
                posture.level === "broken" ? "text-[#F87171]" : "text-[#FACC15]"
              }`}
            >
              <span className="font-medium">{posture.summary}</span>{" "}
              <span className="text-white/45">{posture.fix}</span>
            </div>
          )}

          {posture?.level === "ok" && (
            <p className="text-[11px] text-white/35 mb-4 leading-relaxed">
              Sending as <span className="text-white/60">{identity?.from}</span> over {transport}.{" "}
              {posture.fix}
            </p>
          )}

          <ActionForm action={sendTestEmail} submitLabel="Send a test">
            <Field
              label="Send to"
              name="to"
              type="email"
              required
              placeholder="you@example.com"
              hint="Use an address you can open right now — ideally not the one the Resend or SMTP account was opened with."
            />
          </ActionForm>
          <p className="text-[11px] text-white/35 mt-3 leading-relaxed">
            Whatever happens, it is recorded in{" "}
            <Link href="/admin/emails" className="underline hover:text-white/60">
              the email log
            </Link>{" "}
            along with what the provider said — including for mail nobody was watching, like a
            welcome that never arrived.
          </p>
        </>
      ) : (
        <p className="text-sm text-[#FACC15] leading-relaxed">
          Set <code className="text-white/70">EMAIL_FROM</code>, plus either{" "}
          <code className="text-white/70">RESEND_API_KEY</code> or all four{" "}
          <code className="text-white/70">SMTP_*</code> variables, then redeploy. Vercel does not
          apply new environment variables to a build that already exists, so saving them is not
          enough on its own.
        </p>
      )}
    </Card>
  );
}
