import type { ReactNode } from "react";

// A chart that draws on the server.
// ======================================================================
// The dashboard's activity chart was fourteen stacked bars scaled to the
// busiest day, and on real data that is close to unreadable: one normal
// day puts the peak high enough that every other day collapses to the 2px
// minimum, so a fortnight of steady traffic renders as one bar and
// thirteen stubs. Somebody reporting "the chart is empty" above four stat
// tiles showing hundreds of messages is reporting exactly that.
//
// An area chart does not have the problem. The shape carries the trend
// whatever the spread, a quiet day is a dip rather than a disappearance,
// and the fill gives the panel something to be when the numbers are small.
//
// Recharts is already a dependency and is not used here on purpose: it is
// client-only, so the chart would arrive after the JavaScript, on a page
// whose entire job is to be glanceable the moment it opens. This is plain
// SVG in a server component — no hydration, no layout shift, nothing to
// download.

const W = 600;

/**
 * Catmull-Rom through every point, as cubic beziers.
 *
 * The tension is deliberately below the 1/6 that makes the spline pass
 * exactly through its points: an exact fit overshoots on the way down
 * from a spike, and an overshoot here dips the fill below its own
 * baseline and leaves a sliver of colour under the axis. Control points
 * are clamped to the plot as well, because belt and braces costs two
 * lines.
 */
function curve(points: [number, number][], height: number): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M${points[0][0]} ${points[0][1]}`;

  const clamp = (y: number) => Math.max(0, Math.min(height, y));
  let d = `M${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`;

  for (let i = 0; i < points.length - 1; i += 1) {
    const before = points[i - 1] ?? points[i];
    const from = points[i];
    const to = points[i + 1];
    const after = points[i + 2] ?? to;
    const t = 0.14;

    const c1x = from[0] + (to[0] - before[0]) * t;
    const c1y = clamp(from[1] + (to[1] - before[1]) * t);
    const c2x = to[0] - (after[0] - from[0]) * t;
    const c2y = clamp(to[1] - (after[1] - from[1]) * t);

    d += ` C${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${to[0].toFixed(2)} ${to[1].toFixed(2)}`;
  }

  return d;
}

export interface Series {
  label: string;
  /** Literal, not a theme variable: an SVG gradient stop cannot read one. */
  color: string;
  values: number[];
}

/**
 * Stacked areas over a labelled axis.
 *
 * preserveAspectRatio="none" lets the plot fill whatever width the card
 * has without a measuring pass in the browser, which is what keeps this
 * a server component. The cost is that everything in the SVG stretches
 * with it — so the strokes opt out with vectorEffect, and the axis
 * labels are HTML underneath rather than <text> that would come out
 * horizontally squashed.
 */
export default function AreaChart({
  labels,
  series,
  height = 170,
  /** Shown at the top of the axis, so the scale is stated not guessed. */
  unit,
  empty,
}: {
  labels: string[];
  series: Series[];
  height?: number;
  unit?: string;
  empty?: ReactNode;
}) {
  const length = Math.max(0, ...series.map((s) => s.values.length));
  const totals = Array.from({ length }, (_, i) =>
    series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0)
  );
  const grand = totals.reduce((sum, value) => sum + value, 0);

  if (grand === 0) {
    return (
      <div className="grid place-items-center text-sm text-white/35 px-4 text-center" style={{ height }}>
        {empty ?? "Nothing to show yet."}
      </div>
    );
  }

  // Headroom above the busiest day, so the peak is not welded to the top
  // edge of the panel.
  const peak = Math.max(1, ...totals) * 1.12;
  const step = length > 1 ? W / (length - 1) : W;
  const y = (value: number) => height - (value / peak) * height;

  // Stacked from the bottom up, each band sitting on the one below it.
  //
  // Running totals rather than a carried accumulator: the carried
  // version reassigned a local during render, which the lint rules
  // reject outright — and rightly, since a value that changes while a
  // component renders is the shape of a bug even when it happens to
  // work here.
  const ceiling = series.map((_, band) =>
    Array.from({ length }, (_, i) =>
      series.slice(0, band + 1).reduce((sum, s) => sum + (s.values[i] ?? 0), 0)
    )
  );
  const bands = series.map((s, band) => {
    const under = band === 0 ? new Array<number>(length).fill(0) : ceiling[band - 1];
    return {
      ...s,
      top: ceiling[band].map((value, i): [number, number] => [i * step, y(value)]),
      bottom: under.map((value, i): [number, number] => [i * step, y(value)]),
    };
  });

  const gridlines = [0.25, 0.5, 0.75, 1];

  return (
    <div>
      <div className="relative" style={{ height }}>
        {/* Behind the plot so the areas sit on the grid, not under it. */}
        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
          {gridlines
            .slice()
            .reverse()
            .map((line) => (
              <div key={line} className="border-t border-white/[0.07] h-0" />
            ))}
        </div>

        <svg
          viewBox={`0 0 ${W} ${height}`}
          preserveAspectRatio="none"
          className="relative w-full h-full overflow-visible"
          role="img"
          aria-label={series
            .map((s) => `${s.label}: ${s.values.reduce((a, b) => a + b, 0)}`)
            .join(", ")}
        >
          <defs>
            {bands.map((band) => (
              <linearGradient
                key={band.label}
                id={`fill-${band.label.replace(/\W/g, "")}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={band.color} stopOpacity="0.45" />
                <stop offset="100%" stopColor={band.color} stopOpacity="0.04" />
              </linearGradient>
            ))}
          </defs>

          {/* Topmost band first, so the one in front is drawn last. */}
          {bands.map((band) => {
            const top = curve(band.top, height);
            const back = band.bottom
              .slice()
              .reverse()
              .map(([x, py], i) => `${i === 0 ? "L" : "L"}${x.toFixed(2)} ${py.toFixed(2)}`)
              .join(" ");
            return (
              <g key={band.label}>
                <path d={`${top} ${back} Z`} fill={`url(#fill-${band.label.replace(/\W/g, "")})`} />
                <path
                  d={top}
                  fill="none"
                  stroke={band.color}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            );
          })}

          {/* One hit area per day, carrying the figures as a native
              tooltip. A hover readout without a line of JavaScript. */}
          {totals.map((total, i) => (
            <rect
              key={i}
              x={i * step - step / 2}
              y={0}
              width={step}
              height={height}
              fill="transparent"
            >
              {/* One string, not a text node plus a value: React treats
                  <title> children as a single text node and rejects an
                  array, which is a console error per day on the axis. */}
              <title>{`${labels[i]} — ${series
                .map((s) => `${s.values[i] ?? 0} ${s.label.toLowerCase()}`)
                .join(", ")}`}</title>
            </rect>
          ))}
        </svg>

        {unit && (
          <span className="absolute top-0 right-0 text-[11px] text-white/30 tabular-nums">
            {Math.round(peak)} {unit}
          </span>
        )}
      </div>

      {/* Every other label on a fortnight, so they never collide. */}
      <div className="flex mt-2.5">
        {labels.map((label, i) => (
          <span
            key={i}
            className="flex-1 text-center text-[11px] text-white/25 tabular-nums truncate"
          >
            {i % 2 === 0 || labels.length <= 8 ? label : " "}
          </span>
        ))}
      </div>
    </div>
  );
}
