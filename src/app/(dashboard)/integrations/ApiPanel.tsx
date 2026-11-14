// The REST API card's panel: the base URL to point a tool at, and where the
// key that authenticates against it comes from.
export default function ApiPanel({ apiBase }: { apiBase: string }) {
  return (
    <div>
      <p className="text-sm text-white/55 mb-4 leading-relaxed">
        Point any tool that speaks HTTP at this base and authenticate with a key from{" "}
        <span className="text-white/75">API Endpoints</span>.
      </p>
      <code className="block text-sm text-accent-ink bg-[var(--surface-1)] border border-white/10 rounded-xl p-3.5 break-all">
        {apiBase}
      </code>
    </div>
  );
}
