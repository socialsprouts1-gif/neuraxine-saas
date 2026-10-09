import { requirePlatformAdmin } from "@/lib/org";
import { PageHeader } from "@/components/ui/primitives";
import PaymentCheck from "../_components/PaymentCheck";
import PlatformGateway from "../_components/PlatformGateway";

// Taking money for the product itself.
//
// Its own screen because it is the one thing standing between this
// business and being paid, and it used to be two cards half way down a
// page of nine. A setting nobody can find is a setting nobody sets.

export const dynamic = "force-dynamic";

export default async function AdminPaymentsPage() {
  await requirePlatformAdmin();

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      <PageHeader
        title="Payments"
        subtitle="The gateway your customers' money goes to, and whether it is wired up end to end."
      />
      <PaymentCheck />
      <PlatformGateway />
    </div>
  );
}
