"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  Download,
  Eye,
  Package,
  RefreshCw,
  ShoppingCart,
  Store,
} from "lucide-react";
import ActionForm, { Field, SelectField, TextareaField } from "@/components/ui/ActionForm";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { formatMoney } from "@/types/admin";
import { PAYMENT_LABEL, SUPPORTS_UPI, type PaymentProvider } from "@/lib/provider-meta";
import type { PaymentSettings, Product } from "@/types/portal";
import { deleteProduct, saveProduct } from "../portal-actions";
import { importProducts } from "../integration-actions";
import {
  importCatalog,
  linkCatalog,
  savePaymentSettings,
  saveStorefront,
} from "../commerce-actions";
import OrderList, { type OrderRow } from "./OrderList";
import type { CatalogueState } from "./page";

const TABS = ["Orders", "Products", "Catalogue", "Payments"] as const;
type Tab = (typeof TABS)[number];

export default function CommerceBrowser({
  canManage,
  products,
  orders,
  ordersMigrated,
  ordersError,
  productsError,
  inventoryValue,
  settings,
  connections,
  catalogue,
  connectedGateways,
  connectedShops,
  shopNames,
}: {
  canManage: boolean;
  products: Product[];
  orders: OrderRow[];
  ordersMigrated: boolean;
  ordersError: string | null;
  productsError: string | null;
  inventoryValue: number;
  settings: PaymentSettings;
  connections: Array<{ id: string; label: string }>;
  catalogue: CatalogueState;
  connectedGateways: PaymentProvider[];
  connectedShops: string[];
  shopNames: Record<string, string>;
}) {
  const [tab, setTab] = useState<Tab>("Orders");

  if (!ordersMigrated) {
    return (
      <div className="glass-card p-6 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-[#FACC15] flex-shrink-0 mt-0.5" />
        <div className="text-sm text-white/65 leading-relaxed">
          <div className="font-semibold text-white mb-1">The commerce tables are missing</div>
          <p className="mb-2">
            Run <code className="text-accent-ink">supabase/updates/2026-09.sql</code> in the
            Supabase SQL editor, then reload. Platform staff can see exactly what is missing under
            Admin → Database.
          </p>
          {ordersError && <p className="text-xs text-white/40 break-words">{ordersError}</p>}
        </div>
      </div>
    );
  }

  // The step that is not set up, in the order it bites. Each of these looks
  // fine from this screen and fails in front of a customer.
  const notice = !catalogue.catalogId
    ? {
        text: "No Meta catalogue is linked, so no product card can be sent — a product message can only reference an item Meta holds. Link one under Catalogue.",
        tab: "Catalogue" as Tab,
      }
    : catalogue.isCatalogVisible === false
      ? {
          text: "The catalogue is linked but the storefront is hidden on this number, so customers cannot browse it. Turn it on under Catalogue.",
          tab: "Catalogue" as Tab,
        }
      : settings.method === "link" && !settings.link_provider
        ? {
            text: "No payment gateway is chosen, so nobody can be asked to pay. Pick one under Payments.",
            tab: "Payments" as Tab,
          }
        : settings.method === "whatsapp" && !settings.wa_payment_configuration
          ? {
              text: "WhatsApp payments are selected but no payment configuration is named, so a payment request would be refused by Meta. Fix it under Payments.",
              tab: "Payments" as Tab,
            }
          : null;

  return (
    <>
      {notice && (
        <button
          type="button"
          onClick={() => setTab(notice.tab)}
          className="glass-card p-4 mb-5 flex items-start gap-2.5 w-full text-left hover:border-white/20 transition-colors"
        >
          <AlertTriangle className="w-4 h-4 text-[#FACC15] flex-shrink-0 mt-0.5" />
          <p className="text-xs text-white/65 leading-relaxed">{notice.text}</p>
        </button>
      )}

      <div className="flex gap-1 p-1 rounded-xl bg-white/4 border border-white/8 mb-6 overflow-x-auto">
        {TABS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setTab(option)}
            className={`flex-1 whitespace-nowrap py-2.5 px-4 rounded-lg text-sm font-medium transition-colors ${
              tab === option ? "bg-accent text-[#050508]" : "text-white/55 hover:text-white/85"
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      {tab === "Orders" && <OrderList orders={orders} />}

      {tab === "Products" && (
        <ProductsTab
          products={products}
          productsError={productsError}
          inventoryValue={inventoryValue}
          canManage={canManage}
          connectedShops={connectedShops}
          shopNames={shopNames}
          catalogueLinked={!!catalogue.catalogId}
        />
      )}

      {tab === "Catalogue" && (
        <CatalogueTab
          catalogue={catalogue}
          connections={connections}
          canManage={canManage}
          sendable={products.filter((product) => product.retailer_id).length}
        />
      )}

      {tab === "Payments" && (
        <PaymentsTab
          settings={settings}
          canManage={canManage}
          connectedGateways={connectedGateways}
        />
      )}
    </>
  );
}

// -------------------------------------------------------------- products

function ProductsTab({
  products,
  productsError,
  inventoryValue,
  canManage,
  connectedShops,
  shopNames,
  catalogueLinked,
}: {
  products: Product[];
  productsError: string | null;
  inventoryValue: number;
  canManage: boolean;
  connectedShops: string[];
  shopNames: Record<string, string>;
  catalogueLinked: boolean;
}) {
  return (
    <div className="grid lg:grid-cols-[1fr_340px] gap-6 items-start">
      <div className="order-2 lg:order-1 space-y-4">
        {connectedShops.length > 0 && canManage && (
          <div className="glass-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <Store className="w-4 h-4 text-accent-ink" />
              <h4 className="font-semibold text-sm">Import from your shop</h4>
            </div>
            <p className="text-xs text-white/45 mb-3 leading-relaxed">
              Pulls name, price, stock and photo. Keyed on the shop&rsquo;s own id, so running it
              again updates rather than duplicating.
            </p>
            <div className="flex flex-wrap gap-2">
              {connectedShops.map((slug) => (
                <ActionForm
                  key={slug}
                  action={importProducts}
                  submitLabel={`Import from ${shopNames[slug] ?? slug}`}
                  compact
                >
                  <input type="hidden" name="provider" value={slug} />
                </ActionForm>
              ))}
            </div>
          </div>
        )}

        {productsError ? (
          <EmptyState
            title="Couldn't load products"
            description={`${productsError}. If this mentions a missing relation, the commerce migration has not been applied yet.`}
          />
        ) : products.length === 0 ? (
          <EmptyState
            title="No products yet"
            description="Add one on the right, import them from a connected shop, or pull them in from your Meta catalogue under the Catalogue tab."
          />
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {products.map((product) => (
              <div key={product.id} className="glass-card overflow-hidden flex flex-col">
                {product.image_url ? (
                  // Not next/image: these URLs come from Shopify, Woo and
                  // Meta, and allowlisting every possible CDN host is not
                  // worth a build-time failure on an unknown domain.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={product.image_url}
                    alt={product.name}
                    className="w-full aspect-square object-cover bg-white/5"
                  />
                ) : (
                  <div className="w-full aspect-square bg-white/5 flex items-center justify-center text-xs text-white/25">
                    No image
                  </div>
                )}

                <div className="p-4 flex-1 flex flex-col">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="font-medium text-sm truncate">{product.name}</span>
                    {product.stock !== null && (
                      <Badge tone={product.stock > 0 ? "green" : "red"}>
                        {product.stock > 0 ? `${product.stock} left` : "out"}
                      </Badge>
                    )}
                  </div>

                  {product.sku && (
                    <div className="text-[11px] text-white/35 mb-1">{product.sku}</div>
                  )}

                  <div className="text-lg font-bold mb-2">
                    {formatMoney(product.price_cents, product.currency)}
                  </div>

                  {/* The single most useful thing to know about a product
                      here: whether it can actually be sent as a card. */}
                  <div className="mb-3">
                    {product.retailer_id ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-accent-ink">
                        <Check className="w-3 h-3" />
                        sendable
                      </span>
                    ) : (
                      <span
                        className="text-[11px] text-white/35"
                        title={
                          catalogueLinked
                            ? "Not in your Meta catalogue, so it cannot be sent as a product card. Add it in Commerce Manager and import again."
                            : "Link a Meta catalogue to make products sendable."
                        }
                      >
                        not in the Meta catalogue
                      </span>
                    )}
                  </div>

                  {canManage && (
                    <div className="mt-auto">
                      <ActionForm action={deleteProduct} submitLabel="Delete" compact>
                        <input type="hidden" name="id" value={product.id} />
                      </ActionForm>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="order-1 lg:order-2 space-y-4">
        {canManage && (
          <ActionForm
            action={saveProduct}
            submitLabel="Add product"
            className="glass-card p-5"
            resetOnSuccess
          >
            <h4 className="font-semibold mb-1">Add product</h4>
            <p className="text-xs text-white/45 mb-4">Prices are entered in rupees.</p>
            <div className="space-y-4">
              <Field label="Product name" name="name" required placeholder="Cotton kurta" />
              <Field label="SKU" name="sku" placeholder="KRT-001" hint="Optional, must be unique" />
              <Field label="Price (₹)" name="price" type="number" required placeholder="1299" />
              <Field label="Stock" name="stock" type="number" placeholder="25" hint="Blank if untracked" />
              <Field label="Image URL" name="image_url" type="url" placeholder="https://…/kurta.jpg" />
            </div>
          </ActionForm>
        )}

        <div className="glass-card p-5">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-white/40 mb-2">
            Inventory value
          </div>
          <div className="text-2xl font-bold tabular-nums">{formatMoney(inventoryValue)}</div>
          <p className="text-xs text-white/40 mt-2 leading-relaxed">
            Price × stock, for products where stock is tracked.
          </p>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------- catalogue

function CatalogueTab({
  catalogue,
  connections,
  canManage,
  sendable,
}: {
  catalogue: CatalogueState;
  connections: Array<{ id: string; label: string }>;
  canManage: boolean;
  sendable: number;
}) {
  if (connections.length === 0) {
    return (
      <EmptyState
        title="No WhatsApp number connected"
        description="Connect a number under Integrations first — a catalogue belongs to the WhatsApp Business Account behind it."
        action={
          <Link href="/integrations" className="btn-primary text-sm">
            Go to Integrations
          </Link>
        }
      />
    );
  }

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-4 items-start">
      <div className="glass-card p-6">
        <h3 className="font-semibold mb-1">Meta commerce catalogue</h3>
        <p className="text-xs text-white/45 mb-5 leading-relaxed">
          Products live in Meta&rsquo;s Commerce Manager, not here — creating catalogue items needs
          a permission this app has not been granted, and every tool in this market reads rather
          than writes them. What linking does is let this app send real product cards, and mirror
          the catalogue locally so you can search it and pick from it.
        </p>

        {catalogue.catalogId ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-accent/25 bg-accent/8 p-4">
              <div className="flex items-center gap-2 mb-1">
                <Check className="w-4 h-4 text-accent-ink" />
                <span className="font-medium text-sm">{catalogue.catalogName}</span>
              </div>
              <code className="text-[11px] text-white/45">{catalogue.catalogId}</code>
              <div className="flex flex-wrap gap-2 mt-3">
                <Badge tone={catalogue.isCatalogVisible ? "green" : "amber"}>
                  storefront {catalogue.isCatalogVisible ? "on" : "off"}
                </Badge>
                <Badge tone={catalogue.isCartEnabled ? "green" : "grey"}>
                  cart {catalogue.isCartEnabled ? "on" : "off"}
                </Badge>
                <Badge tone={sendable > 0 ? "green" : "amber"}>{sendable} sendable products</Badge>
              </div>
            </div>

            {canManage && (
              <>
                <ActionForm action={importCatalog} submitLabel="Import catalogue products" compact>
                  <input type="hidden" name="connection_id" value={catalogue.connectionId ?? ""} />
                  <p className="text-xs text-white/45 leading-relaxed flex items-start gap-2">
                    <Download className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    Copies the catalogue into your product list, with the content ID that makes
                    each one sendable. Run it again after adding products in Commerce Manager.
                  </p>
                </ActionForm>

                <ActionForm action={linkCatalog} submitLabel="Re-check the link" compact>
                  <input type="hidden" name="connection_id" value={catalogue.connectionId ?? ""} />
                  <p className="text-xs text-white/45 leading-relaxed flex items-start gap-2">
                    <RefreshCw className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    Asks Meta again, in case the catalogue or the storefront changed there.
                  </p>
                </ActionForm>
              </>
            )}
          </div>
        ) : canManage ? (
          <ActionForm action={linkCatalog} submitLabel="Find and link my catalogue">
            <div className="space-y-4">
              {connections.length > 1 && (
                <SelectField
                  label="Number"
                  name="connection_id"
                  defaultValue={catalogue.connectionId ?? connections[0].id}
                  options={connections.map((connection) => ({
                    value: connection.id,
                    label: connection.label,
                  }))}
                />
              )}
              {connections.length === 1 && (
                <input type="hidden" name="connection_id" value={connections[0].id} />
              )}
              <p className="text-xs text-white/45 leading-relaxed">
                Looks up the catalogues attached to this number&rsquo;s WhatsApp Business Account.
                If it finds none, create one in Meta Commerce Manager and connect it under WhatsApp
                Manager → Catalogue first.
              </p>
            </div>
          </ActionForm>
        ) : (
          <p className="text-sm text-white/50">Only owners and admins can link a catalogue.</p>
        )}
      </div>

      {canManage && catalogue.catalogId && (
        <ActionForm action={saveStorefront} submitLabel="Save storefront" className="glass-card p-5">
          <input type="hidden" name="connection_id" value={catalogue.connectionId ?? ""} />
          <div className="flex items-center gap-2 mb-4">
            <Eye className="w-4 h-4 text-accent-ink" />
            <h4 className="font-semibold text-sm">What customers see</h4>
          </div>

          <div className="space-y-4">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                name="is_catalog_visible"
                defaultChecked={catalogue.isCatalogVisible !== false}
                className="accent-[var(--accent)] w-4 h-4 mt-0.5"
              />
              <span className="text-sm text-white/75">
                Show the storefront
                <span className="block text-[11px] text-white/40">
                  Puts the shop icon in the chat and on your business profile.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                name="is_cart_enabled"
                defaultChecked={catalogue.isCartEnabled !== false}
                className="accent-[var(--accent)] w-4 h-4 mt-0.5"
              />
              <span className="text-sm text-white/75">
                Let customers build a cart
                <span className="block text-[11px] text-white/40">
                  Off, they can browse but not send an order. This is what turns a catalogue into a
                  shop.
                </span>
              </span>
            </label>

            <p className="text-[11px] text-white/35 leading-relaxed">
              Changes can take a few minutes to show up in WhatsApp.
            </p>
          </div>
        </ActionForm>
      )}
    </div>
  );
}

// -------------------------------------------------------------- payments

function PaymentsTab({
  settings,
  canManage,
  connectedGateways,
}: {
  settings: PaymentSettings;
  canManage: boolean;
  connectedGateways: PaymentProvider[];
}) {
  const [method, setMethod] = useState<"link" | "whatsapp">(settings.method);

  if (!canManage) {
    return (
      <div className="glass-card p-6">
        <p className="text-sm text-white/50">Only owners and admins can change payments.</p>
      </div>
    );
  }

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-4 items-start">
      <ActionForm
        action={savePaymentSettings}
        submitLabel="Save payment settings"
        className="glass-card p-6"
      >
        <h3 className="font-semibold mb-1">How customers pay</h3>
        <p className="text-xs text-white/45 mb-5 leading-relaxed">
          A payment link works today with nothing but an API key. Paying inside WhatsApp is nicer —
          the customer never leaves the chat and pays by UPI — but it needs a payment configuration
          approved in WhatsApp Manager, which cannot be arranged from here.
        </p>

        <div className="space-y-5">
          <div className="grid sm:grid-cols-2 gap-3">
            <MethodCard
              chosen={method === "link"}
              onChoose={() => setMethod("link")}
              title="Payment link"
              detail="A link in the conversation, through Razorpay, Cashfree or Stripe. Works now."
            />
            <MethodCard
              chosen={method === "whatsapp"}
              onChoose={() => setMethod("whatsapp")}
              title="Pay in WhatsApp"
              detail="Meta's order card, paid by UPI without leaving the chat. Needs a payment configuration."
            />
          </div>
          <input type="hidden" name="method" value={method} />

          {method === "link" ? (
            connectedGateways.length === 0 ? (
              <div className="rounded-xl border border-amber-400/25 bg-amber-400/8 p-4 text-xs text-white/65 leading-relaxed">
                No payment gateway is connected. Connect Razorpay or Cashfree under{" "}
                <Link href="/integrations" className="text-accent-ink hover:underline">
                  Integrations
                </Link>{" "}
                — both do UPI, which is what an Indian customer expects. Stripe works for cards
                abroad.
              </div>
            ) : (
              <SelectField
                label="Gateway"
                name="link_provider"
                defaultValue={settings.link_provider ?? connectedGateways[0]}
                options={connectedGateways.map((slug) => ({
                  value: slug,
                  label: `${PAYMENT_LABEL[slug]}${SUPPORTS_UPI[slug] ? " · UPI" : " · cards only"}`,
                }))}
              />
            )
          ) : (
            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <Field
                  label="Payment configuration name"
                  name="wa_payment_configuration"
                  defaultValue={settings.wa_payment_configuration ?? ""}
                  hint="Exactly as it appears in WhatsApp Manager → Payments. Meta rejects a name it does not have."
                />
                <SelectField
                  label="Gateway behind it"
                  name="wa_payment_gateway"
                  defaultValue={settings.wa_payment_gateway ?? "razorpay"}
                  options={[
                    { value: "razorpay", label: "Razorpay" },
                    { value: "payu", label: "PayU" },
                  ]}
                />
              </div>
              <p className="text-[11px] text-white/35 leading-relaxed">
                Meta&rsquo;s India payments programme is invitation-based. If WhatsApp Manager has
                no Payments section, this option will be refused however it is filled in — use a
                payment link until it appears.
              </p>
            </div>
          )}

          <div className="pt-5 border-t border-white/8">
            <h4 className="font-semibold text-sm mb-3">What gets charged</h4>
            <div className="grid sm:grid-cols-2 gap-4">
              <SelectField
                label="What you sell"
                name="goods_type"
                defaultValue={settings.goods_type}
                options={[
                  { value: "physical", label: "Physical goods" },
                  { value: "digital", label: "Digital goods" },
                ]}
              />
              <Field
                label="Tax %"
                name="tax_percent"
                type="number"
                defaultValue={String(settings.tax_percent ?? 0)}
                hint="Applied to the goods, not to shipping."
              />
              <Field
                label="Shipping (₹)"
                name="shipping"
                type="number"
                defaultValue={String((settings.shipping_cents ?? 0) / 100)}
              />
              <Field
                label="Free shipping above (₹)"
                name="free_shipping_above"
                type="number"
                defaultValue={String((settings.free_shipping_above_cents ?? 0) / 100)}
                hint="0 for never."
              />
              <Field
                label="Payment expires after"
                name="payment_expiry_minutes"
                type="number"
                defaultValue={String(settings.payment_expiry_minutes ?? 1440)}
                hint="Minutes. 1440 is a day."
              />
            </div>
          </div>

          <div className="pt-5 border-t border-white/8">
            <h4 className="font-semibold text-sm mb-3">What you say</h4>
            <div className="space-y-4">
              <TextareaField
                label="When an order arrives"
                name="order_received_message"
                rows={2}
                defaultValue={settings.order_received_message ?? ""}
                hint="Placeholders: {{items}} {{total}} {{reference}} {{name}}"
              />
              <TextareaField
                label="Asking for payment"
                name="payment_request_message"
                rows={2}
                defaultValue={settings.payment_request_message ?? ""}
                hint="{{link}} is the payment link. It is dropped automatically when paying in WhatsApp, since there is no link."
              />
              <TextareaField
                label="When payment lands"
                name="payment_received_message"
                rows={2}
                defaultValue={settings.payment_received_message ?? ""}
                hint="{{reference}} {{total}}"
              />
            </div>
          </div>
        </div>
      </ActionForm>

      <div className="glass-card p-5">
        <div className="flex items-center gap-2 mb-3">
          <ShoppingCart className="w-4 h-4 text-accent-ink" />
          <h4 className="font-semibold text-sm">How an order runs</h4>
        </div>
        <ol className="space-y-3 text-xs text-white/55 leading-relaxed">
          {[
            "The customer opens your storefront in the chat and adds items to a cart.",
            "They send the cart. It arrives as an order, with the prices they were shown.",
            "You press Ask to pay — or a chatbot flow does it — and they get a link or the WhatsApp order card.",
            "The gateway tells us it cleared, the order is marked paid, and the customer gets a confirmation.",
            "You mark it shipped and add the AWB, and they are told that too.",
          ].map((step, index) => (
            <li key={index} className="flex gap-2.5">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-white/8 text-[10px] font-bold flex items-center justify-center text-white/60">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>

        <div className="mt-4 pt-4 border-t border-white/8">
          <div className="flex items-center gap-2 mb-2">
            <Package className="w-3.5 h-3.5 text-white/40" />
            <span className="text-[11px] font-semibold uppercase tracking-widest text-white/40">
              Webhook to set
            </span>
          </div>
          <p className="text-xs text-white/45 leading-relaxed">
            Point your gateway&rsquo;s webhook at{" "}
            <code className="text-accent-ink break-all">/api/webhooks/payments/&lt;gateway&gt;</code>{" "}
            and paste its signing secret on the integration. Without it a payment clears at the
            gateway and no order is ever marked paid.
          </p>
        </div>
      </div>
    </div>
  );
}

function MethodCard({
  chosen,
  onChoose,
  title,
  detail,
}: {
  chosen: boolean;
  onChoose: () => void;
  title: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      onClick={onChoose}
      aria-pressed={chosen}
      className={`text-left rounded-xl border p-4 transition-colors ${
        chosen
          ? "border-accent/40 bg-accent/8"
          : "border-white/10 bg-white/4 hover:border-white/20"
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        {chosen && <Check className="w-3.5 h-3.5 text-accent-ink" />}
        <span className="font-medium text-sm">{title}</span>
      </div>
      <p className="text-[11px] text-white/45 leading-relaxed">{detail}</p>
    </button>
  );
}
