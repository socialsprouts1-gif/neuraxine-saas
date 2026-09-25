import type { ReactNode } from "react";

// Brand marks drawn inline.
//
// Inline SVG rather than remote images so the dashboard makes no
// third-party requests and nothing breaks behind a firewall or on a slow
// connection. These are recognisable marks in each brand's own colours,
// not exact trademark reproductions.
//
// The thing that mattered: everything here used to be drawn in
// currentColor, so every tile was the same flat monochrome glyph on the
// same tinted square. Slack is four colours, Sheets is a green sheet with
// a white grid, WhatsApp is white on green — rendering all of them as one
// colour is what made a catalogue of well-known products look generated
// rather than real. Colour is most of what makes a logo recognisable at
// 24px, so the marks below carry their own.

interface Mark {
  art: ReactNode;
  /**
   * A brand whose logo is a glyph on a solid colour, given that colour
   * as the tile — WhatsApp is white on green everywhere else, so it is
   * white on green here.
   *
   * Slack uses this for the opposite reason: its brand colour is a dark
   * aubergine that vanishes against a dark dashboard, and its four-colour
   * mark is drawn to sit on white.
   */
  solid?: string;
}

const MARKS: Record<string, Mark> = {
  // --- the model providers -------------------------------------------------
  //
  // An AI assistant's row said "gpt-5-mini · OpenAI" in grey text, which
  // reads as a setting rather than as what is actually answering your
  // customers. A mark makes the row say it at a glance.

  // Anthropic's burst: strokes radiating from a centre, in their clay.
  // Drawn as an even ten-point burst rather than traced from the real
  // file — the first attempt read as the letters "/A", which is not
  // their mark at all and is exactly the mistake the Slack arms made.
  anthropic: {
    solid: "#D97757",
    art: (
      <path
        d="M12.00 9.40L12.00 1.80M13.53 9.90L18.00 3.75M14.47 11.20L21.70 8.85M14.47 12.80L21.70 15.15M13.53 14.10L18.00 20.25M12.00 14.60L12.00 22.20M10.47 14.10L6.00 20.25M9.53 12.80L2.30 15.15M9.53 11.20L2.30 8.85M10.47 9.90L6.00 3.75"
        stroke="#FFFFFF"
        strokeWidth={2.3}
        strokeLinecap="round"
        fill="none"
      />
    ),
  },

  // OpenAI's knot, simplified to the interlocking hexafoil silhouette.
  openai: {
    solid: "#FFFFFF",
    art: (
      <path
        fill="#000000"
        d="M22.28 9.82a5.99 5.99 0 0 0-.52-4.91 6.05 6.05 0 0 0-6.51-2.9A6 6 0 0 0 4.98 4.18a5.99 5.99 0 0 0-4 2.9 6.05 6.05 0 0 0 .74 7.1 5.98 5.98 0 0 0 .51 4.91 6.05 6.05 0 0 0 6.52 2.9A5.98 5.98 0 0 0 13.26 24a6.06 6.06 0 0 0 5.77-4.21 5.99 5.99 0 0 0 4-2.9 6.06 6.06 0 0 0-.75-7.07Zm-9.02 12.6a4.48 4.48 0 0 1-2.88-1.04l.14-.08 4.78-2.76a.79.79 0 0 0 .39-.68v-6.74l2.02 1.17a.07.07 0 0 1 .04.05v5.58a4.5 4.5 0 0 1-4.5 4.5ZM3.6 18.3a4.47 4.47 0 0 1-.54-3.01l.14.09 4.78 2.76a.77.77 0 0 0 .78 0l5.84-3.37v2.33a.08.08 0 0 1-.03.06L9.73 19.96a4.5 4.5 0 0 1-6.14-1.65ZM2.34 7.9a4.48 4.48 0 0 1 2.34-1.97V11.6a.77.77 0 0 0 .38.67l5.82 3.36-2.02 1.17a.08.08 0 0 1-.07 0L3.96 14a4.5 4.5 0 0 1-1.62-6.1Zm16.6 3.86-5.83-3.4L15.13 7.2a.08.08 0 0 1 .07 0l4.83 2.79a4.49 4.49 0 0 1-.68 8.1v-5.67a.79.79 0 0 0-.4-.67Zm2.01-3.03-.14-.09-4.77-2.78a.78.78 0 0 0-.79 0L9.42 9.24V6.9a.07.07 0 0 1 .03-.06l4.83-2.79a4.5 4.5 0 0 1 6.68 4.66ZM8.32 12.87 6.3 11.7a.08.08 0 0 1-.04-.06V6.07a4.5 4.5 0 0 1 7.38-3.45l-.14.08L8.71 5.46a.79.79 0 0 0-.39.68v6.73Zm1.1-2.36L12 9.01l2.6 1.5v3l-2.6 1.5-2.6-1.5v-3Z"
      />
    ),
  },

  // Google's four-colour spark, as used for their AI products.
  google: {
    solid: "#FFFFFF",
    art: (
      <>
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z" fill="#4285F4" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.99.66-2.25 1.05-3.72 1.05-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" fill="#34A853" />
        <path d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" fill="#FBBC05" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1a11 11 0 0 0-9.82 6.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52Z" fill="#EA4335" />
      </>
    ),
  },

  // --- the automation and workspace tools ---------------------------------

  whatsapp: {
    solid: "#25D366",
    art: (
      <path
        d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884a9.82 9.82 0 0 1 6.988 2.896 9.82 9.82 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.82 11.82 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.88 11.88 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.82 11.82 0 0 0-3.48-8.413Z"
        fill="#FFFFFF"
      />
    ),
  },

  // Four arms in a pinwheel, each its own colour. Nothing else looks like
  // it, which is exactly why drawing it in one colour threw the
  // recognition away.
  slack: {
    solid: "#FFFFFF",
    art: (
      <>
        <rect x="8.8" y="1.6" width="3.8" height="10" rx="1.9" fill="#36C5F0" />
        <rect x="12.4" y="8.8" width="10" height="3.8" rx="1.9" fill="#2EB67D" />
        <rect x="11.4" y="12.4" width="3.8" height="10" rx="1.9" fill="#ECB22E" />
        <rect x="1.6" y="11.4" width="10" height="3.8" rx="1.9" fill="#E01E5A" />
      </>
    ),
  },

  // A green sheet with the folded corner and the grid that names it.
  "google-sheets": {
    art: (
      <>
        <path
          d="M13.5 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7.5L13.5 2Z"
          fill="#0F9D58"
        />
        <path d="M13.5 2 19 7.5h-5.5V2Z" fill="#0B8043" />
        <rect x="8" y="11" width="8" height="7" rx="0.6" fill="#FFFFFF" />
        <path
          d="M8 13.3h8M8 15.6h8M11.3 11v7"
          stroke="#0F9D58"
          strokeWidth="0.9"
          fill="none"
        />
      </>
    ),
  },

  // Zapier's six-armed burst.
  zapier: {
    art: (
      <>
        <g fill="#FF4F00">
          <rect x="10.6" y="2.6" width="2.8" height="18.8" rx="1.4" />
          <rect
            x="10.6"
            y="2.6"
            width="2.8"
            height="18.8"
            rx="1.4"
            transform="rotate(60 12 12)"
          />
          <rect
            x="10.6"
            y="2.6"
            width="2.8"
            height="18.8"
            rx="1.4"
            transform="rotate(120 12 12)"
          />
        </g>
        <circle cx="12" cy="12" r="3.4" fill="#FF4F00" />
      </>
    ),
  },

  // n8n's connected nodes, in its own pink rather than a grey outline.
  n8n: {
    art: (
      <>
        <path
          d="M6.4 12h4.2M13.6 12c1.6 0 1.8-3.4 3.4-3.4M13.6 12c1.6 0 1.8 3.4 3.4 3.4"
          stroke="#EA4B71"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <circle cx="4.2" cy="12" r="2.6" fill="#EA4B71" />
        <circle cx="12" cy="12" r="2" fill="#EA4B71" opacity="0.7" />
        <circle cx="19.4" cy="8.2" r="2.3" fill="#EA4B71" />
        <circle cx="19.4" cy="15.8" r="2.3" fill="#EA4B71" />
      </>
    ),
  },

  make: {
    art: (
      <>
        <circle cx="6.2" cy="12" r="2.8" fill="#6D00CC" />
        <circle cx="12" cy="6.8" r="2.8" fill="#8A2BE2" />
        <circle cx="12" cy="17.2" r="2.8" fill="#8A2BE2" />
        <circle cx="17.8" cy="12" r="2.8" fill="#A855F7" />
      </>
    ),
  },

  // --- everything else ----------------------------------------------------

  webhooks: {
    art: (
      <path
        d="M9 7a3 3 0 1 1 4.2 2.75L15.5 14M15 17a3 3 0 1 1-2.6-2.98M7 13a3 3 0 1 0 2.4 4.8h5.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    ),
  },
  api: {
    art: (
      <>
        <path d="M8.5 8 5 12l3.5 4M15.5 8l3.5 4-3.5 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13.2 6.5 10.8 17.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </>
    ),
  },
  shopify: {
    art: (
      <>
        <path
          d="M5.6 7.6h12.8l1 12.4a1.6 1.6 0 0 1-1.6 1.7H6.2a1.6 1.6 0 0 1-1.6-1.7L5.6 7.6Z"
          fill="#95BF47"
        />
        <path
          d="M8.8 9.6V6.4a3.2 3.2 0 0 1 6.4 0v3.2"
          stroke="#5E8E3E"
          strokeWidth="1.7"
          strokeLinecap="round"
          fill="none"
        />
      </>
    ),
  },
  woocommerce: {
    art: (
      <>
        <rect x="3" y="7" width="18" height="9.5" rx="2.5" fill="#7F54B3" opacity="0.35" />
        <path d="M9 16.5 7.5 19l3-2.5M6.5 10.5l1.2 3.6 1.4-3.6.9 3.6 1.4-3.6M14.5 10.5l1.2 3.6 1.4-3.6" stroke="#7F54B3" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
  hubspot: {
    art: (
      <>
        <circle cx="16.5" cy="6.5" r="2.2" fill="none" stroke="#FF7A59" strokeWidth="1.7" />
        <circle cx="11" cy="15" r="4" fill="none" stroke="#FF7A59" strokeWidth="1.7" />
        <path d="M11 11V8.5M11 8.5H6.5M15.2 8.2 12.6 12" stroke="#FF7A59" strokeWidth="1.7" fill="none" strokeLinecap="round" />
        <circle cx="5.5" cy="8.5" r="1.6" fill="#FF7A59" />
      </>
    ),
  },
  "zoho-crm": {
    art: (
      <>
        <rect x="3.5" y="8" width="7" height="8" rx="1.5" fill="#E42527" opacity="0.6" />
        <rect x="13.5" y="8" width="7" height="8" rx="1.5" fill="#E42527" />
      </>
    ),
  },
  salesforce: {
    art: (
      <path
        d="M9.8 8.2a3 3 0 0 1 5.2-.9 3.6 3.6 0 0 1 5 3.3 3.3 3.3 0 0 1-3.3 3.3H8.2A3.7 3.7 0 0 1 4.5 10a3.7 3.7 0 0 1 5.3-1.8Z"
        fill="#00A1E0"
      />
    ),
  },
  razorpay: {
    art: (
      <>
        <path d="M7 20 12.5 4h3.2L10.2 20H7Z" fill="#0C2451" opacity="0.6" />
        <path d="M10.5 12.5 18 4h-3.2l-7.5 8.5h3.2Z" fill="#3395FF" />
      </>
    ),
  },
  stripe: {
    art: (
      <path
        d="M13.3 9.8c-1 0-1.6.3-1.6.9 0 .6.7.9 1.9 1.3 1.9.6 3.2 1.4 3.2 3.3 0 2.1-1.7 3.3-4.1 3.3-1.4 0-2.9-.3-4.1-.9v-3c1.1.7 2.6 1.2 3.8 1.2 1 0 1.6-.3 1.6-.9 0-.7-.7-1-1.9-1.4-1.9-.6-3.2-1.5-3.2-3.3C9 8.2 10.6 7 13 7c1.3 0 2.6.2 3.7.7v2.9c-1-.5-2.2-.8-3.4-.8Z"
        fill="#635BFF"
      />
    ),
  },
  shiprocket: {
    art: (
      <>
        <path d="M15.5 4c-3.5.6-6 3-7.4 6.3l3.6 3.6C15 12.5 17.4 10 18 6.5L15.5 4Z" fill="#E94B3C" opacity="0.7" />
        <circle cx="14.2" cy="8.3" r="1.5" fill="#FFFFFF" />
        <path d="M4 20l3.2-1.2M4 20l1.2-3.2M4 20l4.5-4.5" stroke="#E94B3C" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      </>
    ),
  },
  calendly: {
    art: (
      <>
        <rect x="3.5" y="5.5" width="17" height="15" rx="2.5" fill="none" stroke="#006BFF" strokeWidth="1.7" />
        <path d="M3.5 10h17M8 3.5v4M16 3.5v4" stroke="#006BFF" strokeWidth="1.7" strokeLinecap="round" fill="none" />
        <circle cx="12" cy="15" r="2.4" fill="#006BFF" />
      </>
    ),
  },
};

export default function BrandLogo({
  slug,
  brand,
  size = 40,
}: {
  slug: string;
  brand: string;
  size?: number;
}) {
  const mark = MARKS[slug];
  const solid = mark?.solid;

  return (
    <div
      className="rounded-xl flex items-center justify-center flex-shrink-0 border overflow-hidden"
      style={
        solid
          ? {
              width: size,
              height: size,
              background: solid,
              borderColor: "rgba(255,255,255,0.14)",
              // A logo that is normally white-on-colour needs the colour,
              // not a 10% wash of it.
              boxShadow: `0 2px 10px ${solid}40`,
            }
          : {
              width: size,
              height: size,
              background: `linear-gradient(140deg, ${brand}24, ${brand}0D)`,
              borderColor: `${brand}40`,
              color: brand,
            }
      }
    >
      {mark ? (
        <svg
          width={size * (solid ? 0.56 : 0.62)}
          height={size * (solid ? 0.56 : 0.62)}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          {mark.art}
        </svg>
      ) : (
        <span className="font-bold text-sm">{slug.slice(0, 2).toUpperCase()}</span>
      )}
    </div>
  );
}
