import { requireOrg } from "@/lib/org";
import Sidebar from "./_components/Sidebar";
import TopBar from "./_components/TopBar";
import BillingBanner from "./_components/BillingBanner";
import SuspendedBanner from "./_components/SuspendedBanner";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // requireOrg redirects to /setup when Supabase isn't configured and to
  // /auth/login when there's no session, so both cases are handled before
  // anything here renders.
  const { orgId, orgName, user, isPlatformAdmin, features, suspended } = await requireOrg();

  return (
    <div className="flex h-screen bg-[var(--app-bg)] overflow-hidden">
      <Sidebar isPlatformAdmin={isPlatformAdmin} features={features} />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <TopBar
          orgName={orgName}
          userEmail={user.email ?? ""}
          isPlatformAdmin={isPlatformAdmin}
          features={features}
        />
        <BillingBanner orgId={orgId} />
        {suspended && <SuspendedBanner reason={suspended.reason} />}
        {/* Scrolls for ordinary pages; the inbox fills exactly this height
            and manages its own internal scrolling instead. */}
        <main className="flex-1 overflow-y-auto min-h-0">{children}</main>
      </div>
    </div>
  );
}
