import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireFeature } from "@/lib/org";
import { loadPaymentSettings } from "@/lib/commerce";
import { HeroHeader, StatCard, Badge, EmptyState } from "@/components/ui/primitives";
import { formatAmount } from "@/lib/orders";
import { PAYMENT_LABEL, type PaymentProvider } from "@/lib/provider-meta";
import { AlertTriangle, ArrowRight, Check, CreditCard, Link2, Smartphone } from "lucide-react";
import ChargeForm from "./ChargeForm";

// Getting paid, on its own screen.
//
// Separate from Commerce on purpose: most of the businesses using this do not
// have a product catalogue at all. They agree a price in the conversation —
// a repair, a consultation, a custom order — and need to charge for it. That
// is one form, and it should not be behind four tabs about products.
//
// The other half is being honest about which of the two payment paths a
// workspace actually has. "WhatsApp Pay" is used loosely to mean both, and
// they are not the same thing: one needs an API key, the other needs Meta's
// invitation.

export default async function WaPayPage() {
  const { orgId, role } = await requireFeature("wa_pay");
  const supabase = await createClient();
  const canManage = role === "owner" || role === "admin";

  const [settings, ordersResult, integrationsResult, contactsResult] = await Promise.all([
    loadPaymentSettings(supabase, orgId),
    supabase
      .from("store_orders")
      .select("id, reference, status, currency, total_cents, paid_at, payment_provider, created_at, contacts(name, wa_id)")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("org_integrations")
      .select("provider, status, last_error")
      .eq("org_id", orgId)
      .eq("status", "connected"),
    supabase
      .from("contacts")
      .select("id, name, wa_id")
      .eq("org_id", orgId)
      .order("name")
      .limit(500),
  ]);

  const migrated = !ordersResult.error;
  const orders = ordersResult.data ?? [];
  const paid = orders.filter((order) => order.paid_at);
  const awaiting = orders.filter(
    (order) => !order.paid_at && order.status === "awaiting_payment"
  );

  const connected = new Set((integrationsResult.data ?? []).map((row) => row.provider));
  const gateways = (["razorpay", "cashfree", "stripe"] as PaymentProvider[]).filter((slug) =>
    connected.has(slug)
  );

  const collected = paid.reduce((total, order) => total + order.total_cents, 0);

  return (
    <div className="p-6 md:p-8">
      <HeroHeader
        title="WhatsApp Pay"
        subtitle="Charge a customer in the conversation. Agree a price, send a request, get told when it clears."
      />

      {!migrated ? (
        <div className="glass-card p-6 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-[#FACC15] flex-shrink-0 mt-0.5" />
          <div className="text-sm text-white/65 leading-relaxed">
            <div className="font-semibold text-white mb-1">The payment tables are missing</div>
            <p>
              Run <code className="text-accent-ink">supabase/updates/2026-09.sql</code> in the
              Supabase SQL editor, then reload.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard label="Collected" value={formatAmount(collected)} hint={`${paid.length} payments`} />
            <StatCard label="Awaiting payment" value={awaiting.length} />
            <StatCard
              label="Method"
              value={settings.method === "whatsapp" ? "In chat" : "Payment link"}
            />
            <StatCard label="Gateways" value={gateways.length} />
          </div>

          {/* Which of the two paths this workspace is on, said plainly. The
              term "WhatsApp Pay" covers both and they need different things,
              so guessing is how somebody spends a week waiting for Meta. */}
          <div className="grid lg:grid-cols-2 gap-4 mb-6">
            <PathCard
              icon={Link2}
              title="Payment link"
              active={settings.method === "link"}
              available={gateways.length > 0}
              summary="A link in the conversation. Razorpay and Cashfree collect UPI; Stripe takes cards."
              requirement={
                gateways.length > 0
                  ? `Ready — ${gateways.map((slug) => PAYMENT_LABEL[slug]).join(", ")} connected.`
                  : "Needs a gateway connected under Integrations. Nothing else."
              }
            />
            <PathCard
              icon={Smartphone}
              title="Pay inside WhatsApp"
              active={settings.method === "whatsapp"}
              available={!!settings.wa_payment_configuration}
              summary="Meta's order card. The customer pays by UPI without leaving the chat."
              requirement={
                settings.wa_payment_configuration
                  ? `Configured as “${settings.wa_payment_configuration}” via ${settings.wa_payment_gateway ?? "a gateway"}.`
                  : "Needs a payment configuration approved in WhatsApp Manager → Payments. Meta's India programme is invitation-based and cannot be arranged from here."
              }
            />
          </div>

          <div className="grid lg:grid-cols-[380px_1fr] gap-6 items-start">
            <div className="space-y-4">
              {canManage && gateways.length === 0 && settings.method === "link" ? (
                <div className="glass-card p-6">
                  <div className="flex items-center gap-2 mb-2">
                    <CreditCard className="w-4 h-4 text-[#FACC15]" />
                    <h3 className="font-semibold">Connect a gateway first</h3>
                  </div>
                  <p className="text-sm text-white/55 mb-4 leading-relaxed">
                    Paste a Razorpay or Cashfree key pair and this works immediately — both collect
                    UPI, which is what an Indian customer expects to see.
                  </p>
                  <Link href="/integrations" className="btn-primary text-sm inline-flex items-center gap-2">
                    Go to Integrations
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              ) : (
                <ChargeForm
                  contacts={(contactsResult.data ?? []).map((contact) => ({
                    id: contact.id,
                    label: contact.name || contact.wa_id,
                  }))}
                  method={settings.method}
                  gatewayLabel={
                    settings.link_provider
                      ? PAYMENT_LABEL[settings.link_provider as PaymentProvider] ??
                        settings.link_provider
                      : null
                  }
                  taxPercent={Number(settings.tax_percent) || 0}
                />
              )}

              <div className="glass-card p-5">
                <div className="text-[11px] font-semibold uppercase tracking-widest text-white/40 mb-3">
                  Before the first charge
                </div>
                <ul className="space-y-2.5 text-xs text-white/55 leading-relaxed">
                  <li className="flex gap-2">
                    <Check className="w-3.5 h-3.5 text-accent-ink flex-shrink-0 mt-0.5" />
                    Set the gateway&rsquo;s webhook to{" "}
                    <code className="text-accent-ink break-all">
                      /api/webhooks/payments/&lt;gateway&gt;
                    </code>
                  </li>
                  <li className="flex gap-2">
                    <Check className="w-3.5 h-3.5 text-accent-ink flex-shrink-0 mt-0.5" />
                    Paste its signing secret on the integration, or a cleared payment never marks
                    the order paid.
                  </li>
                  <li className="flex gap-2">
                    <Check className="w-3.5 h-3.5 text-accent-ink flex-shrink-0 mt-0.5" />
                    Tax, shipping and the wording live under{" "}
                    <Link href="/commerce" className="text-accent-ink hover:underline">
                      Commerce → Payments
                    </Link>
                    .
                  </li>
                </ul>
              </div>
            </div>

            <div>
              <h2 className="text-lg font-bold mb-3">Recent</h2>
              {orders.length === 0 ? (
                <EmptyState
                  title="Nothing charged yet"
                  description="A charge you raise here, and any order a customer sends from your catalogue, both show up in this list."
                />
              ) : (
                <div className="space-y-2">
                  {orders.map((order) => {
                    const contact = order.contacts as {
                      name: string | null;
                      wa_id: string;
                    } | null;
                    return (
                      <div
                        key={order.id}
                        className="glass-card p-4 flex items-center justify-between gap-4"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-0.5">
                            <code className="text-xs text-accent-ink">{order.reference}</code>
                            <Badge tone={order.paid_at ? "green" : "amber"}>
                              {order.paid_at ? "paid" : order.status.replace("_", " ")}
                            </Badge>
                            {order.payment_provider && (
                              <Badge tone="grey">
                                {order.payment_provider === "whatsapp"
                                  ? "in chat"
                                  : order.payment_provider}
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-white/45 truncate">
                            {contact ? contact.name || contact.wa_id : "No contact"} ·{" "}
                            {new Date(order.created_at).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                            })}
                          </div>
                        </div>
                        <div className="text-base font-bold tabular-nums flex-shrink-0">
                          {formatAmount(order.total_cents, order.currency)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * One of the two ways to get paid.
 *
 * Both are labelled "WhatsApp Pay" in the market and they need completely
 * different things, so each says what it needs rather than leaving somebody
 * to find out by waiting on Meta.
 */
function PathCard({
  icon: Icon,
  title,
  active,
  available,
  summary,
  requirement,
}: {
  icon: typeof Link2;
  title: string;
  active: boolean;
  available: boolean;
  summary: string;
  requirement: string;
}) {
  return (
    <div
      className={`glass-card p-5 ${active ? "border-accent/40 bg-accent/5" : ""}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${available ? "text-accent-ink" : "text-white/30"}`} />
        <span className="font-semibold text-sm">{title}</span>
        {active && <Badge tone="green">in use</Badge>}
        {!available && <Badge tone="amber">not set up</Badge>}
      </div>
      <p className="text-xs text-white/55 mb-2 leading-relaxed">{summary}</p>
      <p className={`text-[11px] leading-relaxed ${available ? "text-white/40" : "text-[#FACC15]"}`}>
        {requirement}
      </p>
    </div>
  );
}
