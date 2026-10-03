// The marks of the platforms this product plugs into.
//
// Drawn as inline SVG rather than fetched. Three reasons, in order of how
// much trouble each one saved: a logo strip that loads five files from a
// CDN is five chances for the strip to render half-empty on a slow phone;
// these have to recolour with the theme, which an <img> will not do; and
// they are crisp at any size, which matters because the same glyph sits at
// 20px in a grid and 28px in the trust strip.
//
// They are simplified marks, not the trademark artwork — enough to be
// recognised beside its own wordmark, which is the whole job here. If an
// exact mark is ever wanted, each of these takes a real path in its place
// without anything else changing.

type GlyphProps = { className?: string };

/** WhatsApp's bubble-and-handset, the one mark that must be exact. */
export function WhatsAppGlyph({ className = "w-5 h-5" }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347M12.05 21.785h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.002-5.45 4.437-9.884 9.889-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.886 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413" />
    </svg>
  );
}

/** Shopify's shopping bag. */
export function ShopifyGlyph({ className = "w-5 h-5" }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4.4 7.6h15.2l1.1 12.3a1.6 1.6 0 0 1-1.6 1.75H4.9a1.6 1.6 0 0 1-1.6-1.75z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M8.4 10V6.6a3.6 3.6 0 0 1 7.2 0V10"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** The WordPress W in its ring. */
export function WordPressGlyph({ className = "w-5 h-5" }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M5.6 8.3 8.9 17l2.1-5.8M11 11.2l-1.1-3M12.1 17l3.3-8.7M15.4 8.3l2.2 6 1.5-4.6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Meta's interlocking loop, drawn as one continuous stroke. */
export function MetaGlyph({ className = "w-5 h-5" }: GlyphProps) {
  return (
    <svg viewBox="0 0 28 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M3 15.1c0-3.6 1.6-7.4 4.2-7.4 1.5 0 2.6 1 4 3.1 1 1.5 2 3.3 3 5 1.4 2.4 2.4 3.6 3.8 3.6 1.6 0 2.4-1.4 2.4-3.6 0-3.6-1.6-7.5-4.2-7.5-1.5 0-2.9 1.1-4.6 3.6-1 1.5-2 3.3-3 5-1.3 2.2-2.3 2.9-3.5 2.9C3.7 19.8 3 18 3 15.1Z"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Google's G. */
export function GoogleGlyph({ className = "w-5 h-5" }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M21 12.2h-8.8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M21 12.2A9 9 0 1 1 18.4 5.9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Stripe's S. */
export function StripeGlyph({ className = "w-5 h-5" }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="2.4" y="2.4" width="19.2" height="19.2" rx="4.6" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M15.6 8.6a6.1 6.1 0 0 0-2.9-.8c-1.4 0-2.2.6-2.2 1.5 0 2.4 5.5 1.5 5.5 5.2 0 2-1.7 3.1-3.9 3.1a7.3 7.3 0 0 1-3.1-.7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Razorpay's rising band. */
export function RazorpayGlyph({ className = "w-5 h-5" }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M19.6 3 16 16.6h-3.8l2.2-8.2-7.2 4.4L4.6 22H.9L5.2 5.6h3.7"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A plain rounded tile with a letter, for a platform with no glyph here. */
export function InitialGlyph({ letter, className = "w-5 h-5" }: GlyphProps & { letter: string }) {
  return (
    <span
      className={`${className} inline-flex items-center justify-center font-bold leading-none`}
      style={{ fontSize: "0.7em" }}
      aria-hidden="true"
    >
      {letter}
    </span>
  );
}
