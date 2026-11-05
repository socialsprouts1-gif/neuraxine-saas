// Something on screen while the server reads the workspace.
//
// Every dashboard screen is force-dynamic and several run a dozen queries
// before they can render a single pixel — the overview alone asks for
// messages, contacts, conversations, bots, runs, connections, assistants,
// reminders, scheduled messages and meetings. On a laptop that is a
// couple of hundred milliseconds and nobody notices. On a phone on mobile
// data it is seconds of blank page, which is indistinguishable from the
// app being broken.
//
// Next renders this the moment the navigation starts and swaps in the
// real page when the queries land, so the wait has a shape. The shape is
// deliberately the shape of the page that is coming — a banner, a row of
// tiles, a wide panel — rather than a spinner, because a layout that
// settles into the same places it was pretending to hold reads as fast
// even when the clock disagrees.

function Block({ className = "" }: { className?: string }) {
  return <div className={`rounded-2xl bg-white/5 animate-pulse ${className}`} />;
}

export default function DashboardLoading() {
  return (
    <div className="p-6 md:p-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading your workspace…</span>

      <Block className="h-[180px] md:h-[210px] mb-6 rounded-[22px]" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Block className="h-[132px]" />
        <Block className="h-[132px]" />
        <Block className="h-[132px]" />
        <Block className="h-[132px]" />
      </div>

      <div className="grid lg:grid-cols-[1.6fr_1fr] gap-6">
        <Block className="h-[280px]" />
        <Block className="h-[280px]" />
      </div>
    </div>
  );
}
