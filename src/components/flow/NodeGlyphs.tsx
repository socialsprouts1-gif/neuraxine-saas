// Marks for the chatbot components.
//
// Lucide covers most of this app and should keep covering most of it, but
// it has no icon for "a WhatsApp message with reply buttons under it" —
// because that is not a general idea, it is a specific thing with a shape
// people already recognise from using WhatsApp every day. The nearest
// Lucide offerings were a mouse cursor for the button message and a plain
// bulleted list for the list message: both are abstractions of the verb,
// and at 16px in a column of a dozen identical tiles they say nothing.
//
// So the message types are drawn as what they look like on a phone: a
// bubble, and underneath it the thing that makes that type different. Read
// as a set, the palette becomes scannable — you find the list message by
// its shape rather than by reading eleven labels.
//
// Rules the whole set follows, because an icon set that drifts looks worse
// than a plain one:
//
//   * 24-unit box, ~1.8 stroke, round caps and joins. Matching Lucide, so
//     the drawn marks and the borrowed ones sit together without one
//     looking heavier.
//   * currentColor only. Every tile is tinted by the node's accent, and a
//     hard-coded fill would be the one glyph that ignores it.
//   * At most four elements. A fifth is never legible at 16px; it closes
//     up into a smudge and reads as a texture.
//   * The bubble is always the same bubble, in the same place. It is what
//     makes ten different marks read as one family.

type GlyphProps = { className?: string; strokeWidth?: number };

function Svg({
  className = "w-4 h-4",
  strokeWidth = 1.8,
  children,
}: GlyphProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** The bubble every message mark is built on. Tail bottom-left, as WhatsApp draws it. */
const BUBBLE = "M4 7.2A2.2 2.2 0 0 1 6.2 5h11.6A2.2 2.2 0 0 1 20 7.2v6.1a2.2 2.2 0 0 1-2.2 2.2H8.6L5 18.4v-3z";

/** A plain message: the bubble, with lines of writing in it. */
export function TextMessageGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <path d={BUBBLE} />
      <path d="M7.6 8.9h8.8M7.6 11.9h5.6" />
    </Svg>
  );
}

/** Reply buttons: the bubble, and the two tappable pills under it. */
export function ButtonMessageGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <path d="M4.2 5.4A1.8 1.8 0 0 1 6 3.6h12a1.8 1.8 0 0 1 1.8 1.8v4.3a1.8 1.8 0 0 1-1.8 1.8H8.3L5.3 14v-2.5z" />
      {/* Two pills, not one bar. The gap between them is what tells this
          apart from the call-to-action mark at 16px, so it is wide. */}
      <rect x="4.2" y="16.4" width="6.3" height="4" rx="2" />
      <rect x="13.5" y="16.4" width="6.3" height="4" rx="2" />
    </Svg>
  );
}

/** A list message: the bubble, and the menu it opens. */
export function ListMessageGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <path d={BUBBLE} />
      {/* Bulleted, because unbulleted rows are the plain text message
          with an extra line — a difference nobody can see at 16px. The
          dots are filled circles rather than fat stroke caps, which is
          what stopped them closing into a smudge. */}
      <circle cx="7.6" cy="8.5" r="0.95" fill="currentColor" stroke="none" />
      <circle cx="7.6" cy="11.3" r="0.95" fill="currentColor" stroke="none" />
      <circle cx="7.6" cy="14.1" r="0.95" fill="currentColor" stroke="none" />
      <path d="M10.2 8.5h6.2M10.2 11.3h6.2M10.2 14.1h4" />
    </Svg>
  );
}

/** A media message: the bubble with a picture in it. */
export function MediaMessageGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <path d={BUBBLE} />
      <path d="M7.4 13 10 10.1l2.1 2.2 1.9-2 3 2.7" />
      <circle cx="9.1" cy="8.5" r="1.05" />
    </Svg>
  );
}

/** A link button under the bubble — the call-to-action message. */
export function CtaMessageGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      {/* A bubble with a corner missing, and the arrow going out through
          it. The earlier version put a bar under the bubble and an arrow
          inside the bar — at 16px that was the button message with a
          smudge in it. Leaving the frame is the idea, so the mark leaves
          the frame. */}
      <path d="M12.6 4.6H6.4A2.2 2.2 0 0 0 4.2 6.8v6.4a2.2 2.2 0 0 0 2.2 2.2h1.1v3l3.4-3h6.7a2.2 2.2 0 0 0 2.2-2.2v-2.3" />
      <path d="M14.9 9.2 20.6 3.5" />
      <path d="M16.6 3.4h4.1v4.1" />
    </Svg>
  );
}

/** A form inside the bubble: labelled fields waiting to be filled. */
export function FormMessageGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <rect x="4.4" y="3.6" width="15.2" height="16.8" rx="2.3" />
      <path d="M8 8.4h8M8 12h8" />
      <path d="M8 15.9h3.4" />
      <path d="M13.9 16.6l1.4 1.4 2.8-3" />
    </Svg>
  );
}

/**
 * A product card: the picture, the name, the price.
 *
 * Not a price tag, which is what this was first — Update Contact Tags
 * already owns the tag shape, and two components sharing a silhouette in
 * one palette is the thing this whole set exists to stop.
 */
export function ProductGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <rect x="3.4" y="4.2" width="17.2" height="15.6" rx="2.3" />
      <path d="M3.4 14.1l3.5-3.1 3.2 2.7" />
      <circle cx="8.3" cy="8.2" r="1.15" />
      <path d="M13.9 16.3h4.5" />
    </Svg>
  );
}

/** A contact card: the vCard WhatsApp sends, with a face on it. */
export function ContactCardGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <rect x="3.2" y="5" width="17.6" height="14" rx="2.3" />
      <circle cx="9.1" cy="10.6" r="2" />
      <path d="M6.1 15.6a3.3 3.3 0 0 1 6 0" />
      <path d="M15 10.3h3M15 13.6h3" />
    </Svg>
  );
}

/** A pin dropped on the map. */
export function LocationPinGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <path d="M12 21.2s7-5.4 7-10.4a7 7 0 1 0-14 0c0 5 7 10.4 7 10.4z" />
      <circle cx="12" cy="10.6" r="2.5" />
    </Svg>
  );
}

/** Asking a question and waiting: the bubble, with the question in it. */
export function AskGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <path d={BUBBLE} />
      {/* Drawn large and simply. A correctly proportioned question mark
          is a scribble at this size; what has to survive is the hook and
          the dot under it. */}
      <path d="M9.8 8.5a2.3 2.3 0 1 1 3 2.2c-.6.2-.9.7-.9 1.3" />
      <path d="M11.9 14.4h.01" strokeWidth={2.8} />
    </Svg>
  );
}

/** Finding somebody who is not in the conversation. */
export function FindPersonGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <circle cx="10" cy="8.2" r="3.4" />
      <path d="M3.9 19.6a6.4 6.4 0 0 1 8.8-5.9" />
      <circle cx="16.6" cy="16.6" r="3.3" />
      <path d="M19.1 19.1 21.4 21.4" />
    </Svg>
  );
}

/**
 * Relaying to somebody else: a message arriving, and the one it sends on.
 *
 * The one mark in here worth the trouble of drawing. Every other send goes
 * back to the person who wrote in, and this one does not — which is the
 * entire point of the component, and a plain arrow would hide it.
 */
export function RelayGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      {/* Two bubbles and an arrow between them: it arrives here, it goes
          on to someone else. The first attempt drew a person at the far
          end, which at 16px was a stray dot beside a bubble. */}
      <path d="M2.6 5.6A1.7 1.7 0 0 1 4.3 3.9h5.4a1.7 1.7 0 0 1 1.7 1.7v3a1.7 1.7 0 0 1-1.7 1.7H5.5L3.3 12.4v-2.1z" />
      <path d="M14.3 13.3a1.7 1.7 0 0 1 1.7-1.7h5.4a1.7 1.7 0 0 1 1.7 1.7v3a1.7 1.7 0 0 1-1.7 1.7h-4.2l-2.2 2.1V18z" />
      <path d="M6.9 15.4h4.4M9.5 13.3l2.2 2.1-2.2 2.1" />
    </Svg>
  );
}

/** An approved template: the document, stamped. */
export function TemplateGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <path d="M13.4 3.4H7.1A2.1 2.1 0 0 0 5 5.5v13a2.1 2.1 0 0 0 2.1 2.1h9.8a2.1 2.1 0 0 0 2.1-2.1V9.1z" />
      <path d="M13.4 3.4v4.3a1.4 1.4 0 0 0 1.4 1.4H19" />
      <path d="M8.6 15.4l1.8 1.8 4-4.3" />
    </Svg>
  );
}
