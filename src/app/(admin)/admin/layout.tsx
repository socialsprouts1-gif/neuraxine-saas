import { requirePlatformAdmin } from "@/lib/org";
import AdminSidebar from "./_components/AdminSidebar";
import SignOutButton from "@/app/(dashboard)/_components/SignOutButton";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Redirects non-staff to /inbox. Note this guards rendering only — the
  // real enforcement is the is_platform_admin() check inside every RLS
  // policy, so a hand-crafted request still can't read another tenant.
  const user = await requirePlatformAdmin();

  return (
    <div className="flex h-screen bg-[var(--app-bg)] overflow-hidden">
      <AdminSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between h-16 px-6 border-b border-white/8 bg-[var(--surface-1)]/80 backdrop-blur-sm flex-shrink-0">
          <span className="text-xs font-semibold text-[#A855F7] uppercase tracking-widest">
            Platform administration
          </span>
          <div className="flex items-center gap-3">
            <span className="text-sm text-white/60 hidden sm:block">{user.email}</span>
            <SignOutButton />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
