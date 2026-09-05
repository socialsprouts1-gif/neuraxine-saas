import ThemeToggle from "@/components/ThemeToggle";
import SignOutButton from "./SignOutButton";

export default function TopBar({ orgName, userEmail }: { orgName: string; userEmail: string }) {
  return (
    <header className="flex items-center justify-between h-16 px-6 border-b border-white/8 bg-[var(--surface-1)]/80 backdrop-blur-sm sticky top-0 z-20 flex-shrink-0">
      <h1 className="text-xs font-semibold text-white/40 uppercase tracking-widest">{orgName}</h1>
      <div className="flex items-center gap-3">
        <span className="text-sm text-white/60 hidden sm:block">{userEmail}</span>
        <ThemeToggle />
        <SignOutButton />
      </div>
    </header>
  );
}
