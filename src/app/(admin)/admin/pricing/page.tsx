import { requirePlatformAdmin } from "@/lib/org";
import { PageHeader } from "@/components/ui/primitives";
import WalletRates from "../_components/WalletRates";

// What a message costs the workspace that sends it.

export const dynamic = "force-dynamic";

export default async function AdminPricingPage() {
  await requirePlatformAdmin();

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      <PageHeader
        title="Message pricing"
        subtitle="What each template send takes off a workspace's wallet, and whether the wallet is on at all."
      />
      <WalletRates />
    </div>
  );
}
