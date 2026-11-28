import { requirePlatformAdmin } from "@/lib/org";
import { PageHeader } from "@/components/ui/primitives";
import WhatsAppEvents from "../_components/WhatsAppEvents";

// The messages this platform sends its own customers, on WhatsApp.

export const dynamic = "force-dynamic";

export default async function AdminWhatsAppPage() {
  await requirePlatformAdmin();

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      <PageHeader
        title="WhatsApp messages"
        subtitle="Sign-up codes, welcomes, trial warnings and payment receipts — sent from one of your own numbers."
      />
      <WhatsAppEvents />
    </div>
  );
}
