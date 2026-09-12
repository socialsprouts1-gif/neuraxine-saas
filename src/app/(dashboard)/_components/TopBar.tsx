import ThemeToggle from "@/components/ThemeToggle";
import SignOutButton from "./SignOutButton";
import MobileNav from "./MobileNav";

/**
 * The bar above every page.
 *
 * On a phone it carries the only way into the navigation, so the menu
 * button leads and the workspace name takes whatever room is left — it is
 * the least useful thing here and the first that should truncate.
 */
export default function TopBar({
  orgName,
  userEmail,
  isPlatformAdmin = false,
  features = {},
}: {
  orgName: string;
  userEmail: string;
  isPlatformAdmin?: boolean;
  features?: Record<string, boolean>;
}) {
  return (
    <header className="flex items-center gap-2 h-16 px-4 md:px-6 border-b border-white/8 bg-[var(--surface-1)]/80 backdrop-blur-sm sticky top-0 z-20 flex-shrink-0">
      <MobileNav isPlatformAdmin={isPlatformAdmin} features={features} />

      <h1 className="text-xs font-semibold text-white/40 uppercase tracking-widest truncate min-w-0">
        {orgName}
      </h1>

      <div className="flex items-center gap-1.5 md:gap-3 ml-auto flex-shrink-0">
        {/* Hidden below md: an email address is 30 characters of no use on a
            phone, and it was the thing pushing the buttons off the edge. */}
        <span className="text-sm text-white/60 hidden md:block truncate max-w-[16rem]">
          {userEmail}
        </span>
        <ThemeToggle />
        <SignOutButton />
      </div>
    </header>
  );
}
