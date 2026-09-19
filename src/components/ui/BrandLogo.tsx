import type { ReactNode } from "react";

// Simplified brand marks drawn inline. Inline SVG rather than remote images
// so the dashboard makes no third-party requests and nothing breaks behind a
// firewall or on a slow connection. These are recognisable glyphs, not exact
// trademark reproductions.

const MARKS: Record<string, ReactNode> = {
  whatsapp: (
    <path
      d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884a9.82 9.82 0 0 1 6.988 2.896 9.82 9.82 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.82 11.82 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.88 11.88 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.82 11.82 0 0 0-3.48-8.413Z"
      fill="currentColor"
    />
  ),
  webhooks: (
    <path
      d="M9 7a3 3 0 1 1 4.2 2.75L15.5 14M15 17a3 3 0 1 1-2.6-2.98M7 13a3 3 0 1 0 2.4 4.8h5.2"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  ),
  api: (
    <>
      <path d="M8.5 8 5 12l3.5 4M15.5 8l3.5 4-3.5 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.2 6.5 10.8 17.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  zapier: (
    <path
      d="M12 3v6m0 6v6M3 12h6m6 0h6M6.7 6.7l4.2 4.2m2.2 2.2 4.2 4.2m0-10.6-4.2 4.2m-2.2 2.2-4.2 4.2"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  ),
  make: (
    <>
      <circle cx="6.5" cy="12" r="2.6" fill="currentColor" />
      <circle cx="12" cy="7" r="2.6" fill="currentColor" opacity="0.75" />
      <circle cx="12" cy="17" r="2.6" fill="currentColor" opacity="0.75" />
      <circle cx="17.5" cy="12" r="2.6" fill="currentColor" opacity="0.5" />
    </>
  ),
  n8n: (
    <>
      <circle cx="5" cy="12" r="2.2" fill="currentColor" />
      <circle cx="12" cy="7.5" r="2.2" fill="currentColor" />
      <circle cx="12" cy="16.5" r="2.2" fill="currentColor" />
      <circle cx="19" cy="12" r="2.2" fill="currentColor" />
      <path d="M7 11.2 10 8.4M7 12.8l3 2.8M14 8.4l3 2.8M14 15.6l3-2.8" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </>
  ),
  "google-sheets": (
    <>
      <path d="M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9l-6-6Z" fill="currentColor" opacity="0.25" />
      <path d="M13 3v6h6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M8.5 12.5h7M8.5 15.5h7M12 12.5v5" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </>
  ),
  slack: (
    <>
      <rect x="4" y="10.4" width="7.2" height="3.2" rx="1.6" fill="currentColor" />
      <rect x="12.8" y="10.4" width="7.2" height="3.2" rx="1.6" fill="currentColor" opacity="0.6" />
      <rect x="10.4" y="4" width="3.2" height="7.2" rx="1.6" fill="currentColor" opacity="0.8" />
      <rect x="10.4" y="12.8" width="3.2" height="7.2" rx="1.6" fill="currentColor" opacity="0.45" />
    </>
  ),
  shopify: (
    <path
      d="M14.6 5.2c-.3-.2-.7-.2-1 0l-.9.5c-.3-.9-.9-1.7-1.9-1.7-.8 0-1.5.5-2 1.3-.7.3-1.3.9-1.6 1.9L5.6 19l8.3 1.6 3-13.4-2.3-2ZM11 5.4c-.5 0-.9.4-1.2 1 .5-.1 1-.2 1.5-.2 0-.3-.1-.6-.3-.8Z"
      fill="currentColor"
    />
  ),
  woocommerce: (
    <>
      <rect x="3" y="7" width="18" height="9.5" rx="2.5" fill="currentColor" opacity="0.3" />
      <path d="M9 16.5 7.5 19l3-2.5M6.5 10.5l1.2 3.6 1.4-3.6.9 3.6 1.4-3.6M14.5 10.5l1.2 3.6 1.4-3.6" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  hubspot: (
    <>
      <circle cx="16.5" cy="6.5" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="11" cy="15" r="4" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M11 11V8.5M11 8.5H6.5M15.2 8.2 12.6 12" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" />
      <circle cx="5.5" cy="8.5" r="1.6" fill="currentColor" />
    </>
  ),
  "zoho-crm": (
    <>
      <rect x="3.5" y="8" width="7" height="8" rx="1.5" fill="currentColor" opacity="0.55" />
      <rect x="13.5" y="8" width="7" height="8" rx="1.5" fill="currentColor" />
      <path d="M5 10h4l-4 4h4" stroke="#000" strokeWidth="1.2" fill="none" opacity="0.5" />
    </>
  ),
  salesforce: (
    <path
      d="M9.8 8.2a3 3 0 0 1 5.2-.9 3.6 3.6 0 0 1 5 3.3 3.3 3.3 0 0 1-3.3 3.3H8.2A3.7 3.7 0 0 1 4.5 10a3.7 3.7 0 0 1 5.3-1.8Z"
      fill="currentColor"
    />
  ),
  razorpay: (
    <>
      <path d="M7 20 12.5 4h3.2L10.2 20H7Z" fill="currentColor" opacity="0.55" />
      <path d="M10.5 12.5 18 4h-3.2l-7.5 8.5h3.2Z" fill="currentColor" />
    </>
  ),
  stripe: (
    <path
      d="M13.3 9.8c-1 0-1.6.3-1.6.9 0 .6.7.9 1.9 1.3 1.9.6 3.2 1.4 3.2 3.3 0 2.1-1.7 3.3-4.1 3.3-1.4 0-2.9-.3-4.1-.9v-3c1.1.7 2.6 1.2 3.8 1.2 1 0 1.6-.3 1.6-.9 0-.7-.7-1-1.9-1.4-1.9-.6-3.2-1.5-3.2-3.3C9 8.2 10.6 7 13 7c1.3 0 2.6.2 3.7.7v2.9c-1-.5-2.2-.8-3.4-.8Z"
      fill="currentColor"
    />
  ),
  shiprocket: (
    <>
      <path d="M15.5 4c-3.5.6-6 3-7.4 6.3l3.6 3.6C15 12.5 17.4 10 18 6.5L15.5 4Z" fill="currentColor" opacity="0.6" />
      <circle cx="14.2" cy="8.3" r="1.5" fill="currentColor" />
      <path d="M4 20l3.2-1.2M4 20l1.2-3.2M4 20l4.5-4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
    </>
  ),
  calendly: (
    <>
      <rect x="3.5" y="5.5" width="17" height="15" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3.5 10h17M8 3.5v4M16 3.5v4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" fill="none" />
      <circle cx="12" cy="15" r="2.4" fill="currentColor" />
    </>
  ),
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

  return (
    <div
      className="rounded-xl flex items-center justify-center flex-shrink-0 border"
      style={{
        width: size,
        height: size,
        // Brand colour at low alpha keeps each tile recognisable without
        // fighting the dark theme.
        background: `${brand}1A`,
        borderColor: `${brand}33`,
        color: brand,
      }}
    >
      {mark ? (
        <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" aria-hidden="true">
          {mark}
        </svg>
      ) : (
        <span className="font-bold text-sm">{slug.slice(0, 2).toUpperCase()}</span>
      )}
    </div>
  );
}
