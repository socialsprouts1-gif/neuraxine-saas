// Marks for the feature cards.
//
// These were lucide outlines on a 10%-alpha square of their own colour:
// twelve pale pastel tiles, all the same weight, each a thin grey line
// drawing. Recognisable as "an icon", forgettable as a product.
//
// This is the treatment the WhatsApp tile in the hero uses, because that
// is the one that reads as a real thing on the page: a saturated gradient
// with light falling across the top, an inner highlight along the top
// edge, a soft coloured shadow underneath, and a solid white glyph with
// enough weight to hold at 48px.
//
// The glyphs are drawn rather than imported. An icon set gives twelve
// variations of the same pen; these are each shaped around the thing they
// name — the campaign mark fans out, the workflow mark branches, the
// voice mark is a waveform — which is what stops a grid of twelve reading
// as a grid of one.

export type FeatureMarkName =
  | "chatbot"
  | "workflow"
  | "campaigns"
  | "crm"
  | "assistant"
  | "analytics"
  | "commerce"
  | "content"
  | "integrations"
  | "whitelabel"
  | "voice"
  | "booking";

interface MarkSpec {
  /** Light end, mid, dark end — the light falls from the top left. */
  from: string;
  via: string;
  to: string;
  art: React.ReactNode;
}

// Stroked, not filled: a 2.2px white stroke on a saturated tile keeps its
// shape at 48px where a filled silhouette turns into a blob.
const S = {
  fill: "none",
  stroke: "#FFFFFF",
  strokeWidth: 2.1,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const MARKS: Record<FeatureMarkName, MarkSpec> = {
  // A reply arriving in a bubble, with the spark that wrote it.
  chatbot: {
    from: "#A78BFA",
    via: "#7C3AED",
    to: "#5B21B6",
    art: (
      <>
        <path d="M4.5 10.5a5 5 0 0 1 5-5h9a5 5 0 0 1 5 5v4a5 5 0 0 1-5 5h-6.2L7 23v-3.8a5 5 0 0 1-2.5-4.3z" {...S} />
        <path d="M11 12.4h4.4M11 15.6h2.6" {...S} />
        <path d="m19.4 3 .9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9z" {...S} strokeWidth={1.7} />
      </>
    ),
  },

  // One input branching into two paths — the shape of a flow, not a chart.
  workflow: {
    from: "#818CF8",
    via: "#4F46E5",
    to: "#3730A3",
    art: (
      <>
        <rect x="3" y="9.5" width="6.5" height="6.5" rx="2.2" {...S} />
        <rect x="17" y="3.5" width="6" height="6" rx="2.1" {...S} />
        <rect x="17" y="16" width="6" height="6" rx="2.1" {...S} />
        <path d="M9.5 12.8h3.2a1.8 1.8 0 0 0 1.8-1.8V8.3a1.8 1.8 0 0 1 1.8-1.8H17" {...S} />
        <path d="M9.5 12.8h3.2a1.8 1.8 0 0 1 1.8 1.8v2.7a1.8 1.8 0 0 0 1.8 1.8H17" {...S} />
      </>
    ),
  },

  // A message leaving, and the two behind it. The fan is the "bulk".
  campaigns: {
    from: "#F0ABFC",
    via: "#C026D3",
    to: "#86198F",
    art: (
      <>
        <path d="M21.6 3.4 3.8 10.2a.7.7 0 0 0-.05 1.28l4.6 2.2 2.2 4.6a.7.7 0 0 0 1.28-.05z" {...S} />
        <path d="m8.35 13.68 5.1-5.1" {...S} />
        <path d="M2.6 17.4 5 15M5.4 21.2l2.2-2.2M9.6 22.6l1.3-1.3" {...S} strokeWidth={1.7} />
      </>
    ),
  },

  // A person on a card, and the pipeline they move down.
  crm: {
    from: "#5EEAD4",
    via: "#0D9488",
    to: "#115E59",
    art: (
      <>
        <rect x="2.6" y="3.6" width="18.8" height="16.8" rx="3.4" {...S} />
        <circle cx="9" cy="10.2" r="2.5" {...S} />
        <path d="M4.9 16.6a4.4 4.4 0 0 1 8.2 0" {...S} />
        <path d="M16 8.6h3.3M16 12.4h3.3M16 16.2h3.3" {...S} strokeWidth={1.8} />
      </>
    ),
  },

  // Somebody on the other end, with the spark that is doing the work.
  // A brain, drawn as two mirrored halves, came out as an orange blob at
  // 28px — which is the size it is actually seen at.
  assistant: {
    from: "#FDBA74",
    via: "#EA580C",
    to: "#9A3412",
    art: (
      <>
        <circle cx="10.4" cy="8.6" r="3.9" {...S} />
        <path d="M3.4 20.6a7 7 0 0 1 14 0" {...S} />
        <path d="m19.2 2.4.85 2.15 2.15.85-2.15.85-.85 2.15-.85-2.15L16.2 5.4l2.15-.85z" {...S} strokeWidth={1.7} />
      </>
    ),
  },

  // Bars, with the line that says which way they are going.
  analytics: {
    from: "#7DD3FC",
    via: "#2563EB",
    to: "#1E3A8A",
    art: (
      <>
        <path d="M3.6 20.6h16.8" {...S} />
        <path d="M6.6 20.6v-5.2M12 20.6V9.6M17.4 20.6v-8" {...S} strokeWidth={2.6} />
        <path d="m5.6 9.4 4.6-4.6 3 3 5-5" {...S} strokeWidth={1.8} />
        <path d="M14.4 2.8h3.8v3.8" {...S} strokeWidth={1.8} />
      </>
    ),
  },

  // A bag with a price on it, which is the whole of selling in a chat.
  commerce: {
    from: "#86EFAC",
    via: "#16A34A",
    to: "#14532D",
    art: (
      <>
        <path d="M4.4 8.2h15.2l1.1 11.4a2.2 2.2 0 0 1-2.2 2.4H5.5a2.2 2.2 0 0 1-2.2-2.4z" {...S} />
        <path d="M8.6 10.6V6.9a3.4 3.4 0 0 1 6.8 0v3.7" {...S} />
        <path d="M12 13.6v4.6M10.3 14.8h2.6a1.4 1.4 0 0 1 0 2.8h-1.8a1.4 1.4 0 0 0 0 2.8h2.6" {...S} strokeWidth={1.6} />
      </>
    ),
  },

  // A wand, and the words appearing off the end of it.
  content: {
    from: "#F9A8D4",
    via: "#DB2777",
    to: "#9D174D",
    art: (
      <>
        <path d="m3.6 20.4 9.6-9.6" {...S} />
        <path d="m11.4 12.6 2.4-2.4" {...S} strokeWidth={1.6} />
        <path d="m17.2 3 .95 2.45L20.6 6.4l-2.45.95L17.2 9.8l-.95-2.45L13.8 6.4l2.45-.95z" {...S} strokeWidth={1.7} />
        <path d="m21 12.4.62 1.6 1.6.62-1.6.62-.62 1.6-.62-1.6-1.6-.62 1.6-.62z" {...S} strokeWidth={1.5} />
        <path d="m8.4 3.6.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5z" {...S} strokeWidth={1.5} />
      </>
    ),
  },

  // Two links holding, which is what an integration either does or doesn't.
  integrations: {
    from: "#C4B5FD",
    via: "#6D28D9",
    to: "#4C1D95",
    art: (
      <>
        <path d="M10.2 13.8a4 4 0 0 0 6 .44l2.6-2.6a4 4 0 0 0-5.66-5.66l-1.5 1.49" {...S} />
        <path d="M13.8 10.2a4 4 0 0 0-6-.44l-2.6 2.6a4 4 0 0 0 5.66 5.66l1.49-1.49" {...S} />
      </>
    ),
  },

  // Layers with a tag on them: your name on somebody else's stack.
  whitelabel: {
    from: "#FDE68A",
    via: "#D97706",
    to: "#92400E",
    art: (
      <>
        <path d="m12 2.8 8.8 4.6L12 12 3.2 7.4z" {...S} />
        <path d="m3.2 12.4 8.8 4.6 8.8-4.6" {...S} />
        <path d="m3.2 17.1 8.8 4.6 8.8-4.6" {...S} strokeWidth={1.7} />
      </>
    ),
  },

  // A voice: the waveform, not a microphone. Everything is a microphone.
  voice: {
    from: "#67E8F9",
    via: "#0891B2",
    to: "#164E63",
    art: (
      <>
        <path d="M3.4 11v2M7 8.2v7.6M10.6 4.6v14.8M14.2 7.2v9.6M17.8 9.4v5.2M21.4 11.2v1.6" {...S} strokeWidth={2.3} />
      </>
    ),
  },

  // A date with a tick on it — booked, not merely offered.
  booking: {
    from: "#A5B4FC",
    via: "#4338CA",
    to: "#312E81",
    art: (
      <>
        <rect x="3" y="5.2" width="18" height="16" rx="3.2" {...S} />
        <path d="M3 10.2h18M8 2.8v4.4M16 2.8v4.4" {...S} />
        <path d="m8.8 15.6 2.3 2.3 4.3-4.6" {...S} strokeWidth={2.2} />
      </>
    ),
  },
};

export default function FeatureMark({
  name,
  size = 52,
  className = "",
}: {
  name: FeatureMarkName;
  size?: number;
  className?: string;
}) {
  const mark = MARKS[name];
  if (!mark) return null;

  return (
    <span
      className={`relative inline-flex items-center justify-center shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        // A superellipse-ish corner, so the tile keeps its proportions
        // whether it is 44px on a card or 64px in a header.
        borderRadius: size * 0.29,
        background: `linear-gradient(145deg, ${mark.from} 0%, ${mark.via} 52%, ${mark.to} 100%)`,
        boxShadow: `0 6px 16px -4px ${mark.via}66, 0 1px 2px rgba(23,18,38,0.12), inset 0 1.5px 2px rgba(255,255,255,0.45), inset 0 -1.5px 3px rgba(0,0,0,0.12)`,
      }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" width={size * 0.55} height={size * 0.55}>
        {mark.art}
      </svg>
    </span>
  );
}
