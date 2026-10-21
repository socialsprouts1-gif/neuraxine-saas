export default function Loading() {
  return (
    <div className="p-6 md:p-8">
      <div className="h-8 w-40 rounded-lg bg-white/5 animate-pulse mb-6" />
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="glass-card h-32 animate-pulse" />
        ))}
      </div>
    </div>
  );
}
