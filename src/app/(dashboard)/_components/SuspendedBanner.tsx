import { AlertOctagon } from "lucide-react";

/**
 * Shown across the workspace while platform staff have it suspended.
 *
 * Billing and Settings stay reachable on purpose: locking someone out of
 * the page that explains the problem is how a late payment turns into a
 * lost customer.
 */
export default function SuspendedBanner({ reason }: { reason: string | null }) {
  return (
    <div className="flex items-start gap-2.5 px-5 py-3 bg-[#F87171]/10 border-b border-[#F87171]/25">
      <AlertOctagon className="w-4 h-4 text-[#F87171] flex-shrink-0 mt-0.5" />
      <div className="text-sm">
        <span className="font-medium text-[#F87171]">This workspace is suspended.</span>{" "}
        <span className="text-white/60">
          {reason?.trim() ||
            "Sending and automation are paused. Get in touch and we will sort it out."}
        </span>
      </div>
    </div>
  );
}
