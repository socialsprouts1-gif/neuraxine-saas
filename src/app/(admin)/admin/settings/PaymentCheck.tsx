import { createAdminClient } from "@/lib/supabase/admin";
import { Card, Badge } from "@/components/ui/primitives";
import { PAYMENT_PROVIDERS } from "@/lib/provider-meta";
import { loadIntegration } from "@/lib/integration-store";
import { paymentChecklist, RAZORPAY_EVENTS } from "@/lib/payment-readiness";
import { emailBrand } from "@/lib/email";

/**
 * Whether this deployment can take money for itself, and what is missing.
 *
 * Every one of these failures reaches a customer as the same thing: the
 * checkout refuses and names a setting they have never heard of. The
 * pieces were all built — a gateway, a link builder, a signed webhook,
 * subscription activation — and nothing said whether they were wired
 * together, so "is Razorpay connected?" was only answerable by trying to
 * buy something.
 */
export default async function PaymentCheck() {
  const admin = createAdminClient();

  const [{ data: setting }, { data: connected }, { data: plans }] = await Promise.all([
    admin.from("platform_settings").select("value").eq("key", "platform_payment_org").maybeSingle(),
    admin
      .from("org_integrations")
      .select("org_id, provider")
      .in("provider", PAYMENT_PROVIDERS)
      .eq("status", "connected"),
    admin.from("plans").select("id, price_cents").eq("is_active", true),
  ]);

  const named = setting?.value as { org_id?: string; provider?: string } | null;
  const gatewayOrgId = named?.org_id ?? null;
  const gatewayProvider = named?.provider ?? null;

  const { data: org } = gatewayOrgId
    ? await admin.from("organizations").select("name").eq("id", gatewayOrgId).maybeSingle()
    : { data: null };

  // Read through the store so the credentials are decrypted the same way
  // the checkout reads them — a secret that cannot be decrypted is as
  // absent as one that was never saved.
  const integration =
    gatewayOrgId && gatewayProvider
      ? await loadIntegration(admin, gatewayOrgId, gatewayProvider)
      : null;

  const steps = paymentChecklist({
    connectedGateways: new Set((connected ?? []).map((row) => row.org_id)).size,
    gatewayOrgId,
    gatewayProvider,
    gatewayOrgName: org?.name ?? null,
    gatewayConnected: Boolean(integration),
    hasWebhookSecret: Boolean(
      (integration?.credentials as Record<string, unknown> | undefined)?.webhook_secret
    ),
    sellablePlans: (plans ?? []).filter((plan) => (plan.price_cents ?? 0) > 0).length,
  });

  const ready = steps.every((step) => step.done);
  const webhookUrl = `${emailBrand().appUrl}/api/webhooks/payments/${gatewayProvider ?? "razorpay"}`;

  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-center gap-2.5 mb-1">
        <h2 className="font-semibold">Taking subscription payments</h2>
        <Badge tone={ready ? "green" : "amber"}>
          {ready ? "ready" : `${steps.filter((step) => !step.done).length} left`}
        </Badge>
      </div>
      <p className="text-sm text-white/50 mb-5 leading-relaxed">
        Nothing here grants a plan. An order is written pending, the customer goes to the gateway,
        and the subscription is activated only after a signature has been checked — so the only
        thing that can put a workspace on a plan is money actually arriving.
      </p>

      <ol className="space-y-3 mb-5">
        {steps.map((step, index) => (
          <li key={step.title} className="flex gap-3">
            <span
              className={`grid place-items-center w-5 h-5 rounded-full text-[10px] font-semibold shrink-0 mt-0.5 ${
                step.done
                  ? "bg-accent/15 text-accent-ink border border-accent/30"
                  : "bg-white/6 text-white/40 border border-white/12"
              }`}
            >
              {step.done ? "✓" : index + 1}
            </span>
            <span className="min-w-0">
              <span className={`text-sm ${step.done ? "text-white/55" : "text-white/85"}`}>
                {step.title}
              </span>
              <span className="block text-[11.5px] text-white/40 leading-relaxed mt-0.5">
                {step.detail}
              </span>
            </span>
          </li>
        ))}
      </ol>

      <div className="rounded-xl border border-white/10 bg-white/3 p-3.5">
        <div className="text-[11px] font-medium text-white/60 mb-1.5">
          Webhook URL — paste this into Razorpay → Settings → Webhooks
        </div>
        <code className="block text-[11.5px] text-accent-ink break-all mb-2.5">{webhookUrl}</code>
        <div className="text-[11px] text-white/40 leading-relaxed">
          Tick these events and nothing else:{" "}
          <span className="text-white/60">{RAZORPAY_EVENTS.join(", ")}</span>. Set a secret there,
          and paste the same secret into the Razorpay integration as{" "}
          <span className="text-white/60">Webhook secret</span> — Razorpay signs every delivery
          with it, and a delivery that cannot be verified is refused.
        </div>
      </div>
    </Card>
  );
}
