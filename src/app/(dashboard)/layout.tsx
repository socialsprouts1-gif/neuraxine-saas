import { requireOrg } from "@/lib/org";
import Sidebar from "./_components/Sidebar";
import TopBar from "./_components/TopBar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // requireOrg redirects to /setup when Supabase isn't configured and to
  // /auth/login when there's no session, so both cases are handled before
  // anything here renders.
  const { orgName, user, isPlatformAdmin } = await requireOrg();

  return (
    <div className="flex h-screen bg-[var(--app-bg)] overflow-hidden">
      <Sidebar isPlatformAdmin={isPlatformAdmin} />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <TopBar orgName={orgName} userEmail={user.email ?? ""} />
        {/* Scrolls for ordinary pages; the inbox fills exactly this height
            and manages its own internal scrolling instead. */}
        <main className="flex-1 overflow-y-auto min-h-0">{children}</main>
      </div>
    </div>
  );
}
