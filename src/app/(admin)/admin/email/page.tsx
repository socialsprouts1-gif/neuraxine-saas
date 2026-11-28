import { requirePlatformAdmin } from "@/lib/org";
import { PageHeader } from "@/components/ui/primitives";
import EmailCheck from "../_components/EmailCheck";

// Whether this deployment can send email, and as whom.
//
// Distinct from the Email log, which is what it has already sent. This
// one is the plumbing behind it.

export const dynamic = "force-dynamic";

export default async function AdminEmailSetupPage() {
  await requirePlatformAdmin();

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      <PageHeader
        title="Email setup"
        subtitle="How this deployment sends mail, and as whom. What it has already sent is under Email log."
      />
      <EmailCheck />
    </div>
  );
}
