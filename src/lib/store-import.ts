import "server-only";

import { basicAuth, jsonHeaders, providerFetch } from "@/lib/provider-http";
import { STORE_LABEL, STORE_PROVIDERS, type StoreProvider } from "@/lib/provider-meta";

export type { StoreProvider };
export { STORE_LABEL, STORE_PROVIDERS };

// Reading a shop's products into the local catalogue.
//
// The Commerce screen shares products in a WhatsApp conversation, and typing
// a shop's inventory into it twice is how the two lists drift apart. So the
// shop is the source and this pulls from it: name, SKU, price, stock, image.
//
// One direction only, deliberately. Writing back means owning inventory
// arithmetic across two systems that both think they are authoritative, and
// getting that wrong oversells stock somebody has to apologise for.

export interface StoreConnection {
  provider: StoreProvider;
  credentials: Record<string, string>;
  config: Record<string, string>;
}

/** A product, in the shape the local catalogue stores. */
export interface ImportedProduct {
  name: string;
  sku: string | null;
  /** Smallest currency unit. */
  priceCents: number;
  currency: string;
  /** Null when the shop does not track stock for this item. */
  stock: number | null;
  imageUrl: string | null;
  description: string | null;
  /** The shop's own id, so a re-import updates rather than duplicates. */
  externalId: string;
  isActive: boolean;
}

export type ImportResult =
  | { ok: true; products: ImportedProduct[]; truncated: boolean }
  | { ok: false; error: string };

/** How many products one import will pull. */
export const IMPORT_LIMIT = 250;

/** Major units as a string ("1299.00") into paise. Never via a float. */
function toCents(value: unknown): number {
  if (typeof value === "number") return Math.round(value * 100);
  if (typeof value !== "string") return 0;

  const trimmed = value.trim();
  if (!trimmed) return 0;

  const match = /^(-?)(\d*)(?:[.,](\d{0,2}))?/.exec(trimmed.replace(/[^\d.,-]/g, ""));
  if (!match) return 0;

  const sign = match[1] === "-" ? -1 : 1;
  const whole = Number(match[2] || "0");
  const fraction = Number((match[3] ?? "").padEnd(2, "0") || "0");
  return sign * (whole * 100 + fraction);
}

// -------------------------------------------------------------- Shopify

const SHOPIFY_API = "2025-01";

/** Tolerates a domain pasted with or without the scheme or a trailing slash. */
function shopifyHost(config: Record<string, string>): string {
  return (config.shop_domain ?? "")
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
}

function shopifyHeaders(connection: StoreConnection): Record<string, string> {
  return {
    ...jsonHeaders(),
    "X-Shopify-Access-Token": connection.credentials.access_token ?? "",
  };
}

interface ShopifyProduct {
  id: number;
  title: string;
  body_html: string | null;
  status: string;
  variants?: Array<{
    id: number;
    sku: string | null;
    price: string;
    inventory_quantity: number | null;
    inventory_management: string | null;
  }>;
  image?: { src?: string } | null;
  images?: Array<{ src?: string }>;
}

async function shopifyProducts(connection: StoreConnection): Promise<ImportResult> {
  const host = shopifyHost(connection.config);
  if (!host) return { ok: false, error: "No Shopify shop domain stored." };

  const result = await providerFetch(
    `https://${host}/admin/api/${SHOPIFY_API}/products.json?limit=${IMPORT_LIMIT}`,
    { headers: shopifyHeaders(connection) }
  );

  if (!result.ok) {
    return {
      ok: false,
      error:
        result.status === 401 || result.status === 403
          ? "Shopify rejected the token. A custom app needs read_products, and the app has to be installed on the store — created is not enough."
          : result.status === 404
            ? `No store answered at ${host}. The domain is the myshopify.com one, not your custom domain.`
            : (result.error ?? "Shopify refused the request."),
    };
  }

  const products = (result.body as { products?: ShopifyProduct[] } | null)?.products ?? [];
  const shopCurrency = connection.config.currency ?? "INR";

  // One row per variant, because a variant is what has a price, a SKU and a
  // stock count — a "product" with three sizes is three things to sell.
  const imported: ImportedProduct[] = [];
  for (const product of products) {
    const image = product.image?.src ?? product.images?.[0]?.src ?? null;
    const variants = product.variants ?? [];

    if (variants.length === 0) continue;

    for (const variant of variants) {
      imported.push({
        name:
          variants.length > 1 && variant.sku
            ? `${product.title} (${variant.sku})`
            : product.title,
        sku: variant.sku || null,
        priceCents: toCents(variant.price),
        currency: shopCurrency,
        // Shopify only reports a meaningful count when it is managing the
        // inventory; otherwise the number is a stale zero.
        stock: variant.inventory_management ? variant.inventory_quantity ?? 0 : null,
        imageUrl: image,
        description: stripHtml(product.body_html),
        externalId: `shopify:${variant.id}`,
        isActive: product.status === "active",
      });
    }
  }

  return {
    ok: true,
    products: imported,
    truncated: products.length >= IMPORT_LIMIT,
  };
}

async function shopifyTest(connection: StoreConnection): Promise<string | null> {
  const host = shopifyHost(connection.config);
  if (!host) return "No Shopify shop domain stored.";

  const result = await providerFetch(`https://${host}/admin/api/${SHOPIFY_API}/shop.json`, {
    headers: shopifyHeaders(connection),
  });

  if (result.ok) return null;
  return result.status === 401 || result.status === 403
    ? "Shopify rejected the token. Check the custom app is installed on the store and has read_products."
    : (result.error ?? "Shopify refused the request.");
}

// ---------------------------------------------------------- WooCommerce

function wooBase(config: Record<string, string>): string {
  return (config.store_url ?? "").trim().replace(/\/+$/, "");
}

function wooAuth(connection: StoreConnection): string {
  return basicAuth(
    connection.config.consumer_key ?? connection.credentials.consumer_key ?? "",
    connection.credentials.consumer_secret ?? ""
  );
}

interface WooProduct {
  id: number;
  name: string;
  sku: string | null;
  price: string;
  short_description: string | null;
  description: string | null;
  status: string;
  manage_stock: boolean;
  stock_quantity: number | null;
  images?: Array<{ src?: string }>;
}

async function wooProducts(connection: StoreConnection): Promise<ImportResult> {
  const base = wooBase(connection.config);
  if (!base) return { ok: false, error: "No WooCommerce store URL stored." };

  const result = await providerFetch(
    `${base}/wp-json/wc/v3/products?per_page=100&status=publish`,
    { headers: jsonHeaders(wooAuth(connection)) }
  );

  if (!result.ok) {
    return {
      ok: false,
      error:
        result.status === 401
          ? "WooCommerce rejected the key pair. Basic auth over HTTP is refused by WooCommerce — the store URL has to be https."
          : result.status === 404
            ? `No WooCommerce REST API at ${base}. Check the URL, and that permalinks are not set to Plain.`
            : (result.error ?? "WooCommerce refused the request."),
    };
  }

  const products = (Array.isArray(result.body) ? result.body : []) as WooProduct[];
  const currency = connection.config.currency ?? "INR";

  return {
    ok: true,
    products: products.map((product) => ({
      name: product.name,
      sku: product.sku || null,
      priceCents: toCents(product.price),
      currency,
      stock: product.manage_stock ? product.stock_quantity ?? 0 : null,
      imageUrl: product.images?.[0]?.src ?? null,
      description: stripHtml(product.short_description || product.description),
      externalId: `woocommerce:${product.id}`,
      isActive: product.status === "publish",
    })),
    truncated: products.length >= 100,
  };
}

async function wooTest(connection: StoreConnection): Promise<string | null> {
  const base = wooBase(connection.config);
  if (!base) return "No WooCommerce store URL stored.";

  const result = await providerFetch(`${base}/wp-json/wc/v3/system_status`, {
    headers: jsonHeaders(wooAuth(connection)),
  });

  // system_status needs a higher permission than reading products, so a 403
  // still means the credentials themselves were accepted.
  if (result.ok || result.status === 403) return null;
  return result.status === 401
    ? "WooCommerce rejected the key pair. The key needs Read access, and the store URL must be https."
    : (result.error ?? "WooCommerce refused the request.");
}

// ---------------------------------------------------------------- shared

/**
 * Product descriptions arrive as HTML from both shops.
 *
 * Stripped rather than rendered: this text ends up in a WhatsApp message,
 * where a tag is shown literally.
 */
function stripHtml(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, 500) : null;
}

const FETCH: Record<StoreProvider, (c: StoreConnection) => Promise<ImportResult>> = {
  shopify: shopifyProducts,
  woocommerce: wooProducts,
};

const TEST: Record<StoreProvider, (c: StoreConnection) => Promise<string | null>> = {
  shopify: shopifyTest,
  woocommerce: wooTest,
};

export function fetchStoreProducts(connection: StoreConnection): Promise<ImportResult> {
  return FETCH[connection.provider](connection);
}

export function testStoreProvider(connection: StoreConnection): Promise<string | null> {
  return TEST[connection.provider](connection);
}

/** Exported for the tests: the money conversion is the easy thing to break. */
export const __testing = { toCents, stripHtml };
