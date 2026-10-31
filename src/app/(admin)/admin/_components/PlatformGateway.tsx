import { createAdminClient } from "@/lib/supabase/admin";
import { savePlatformGateway } from "../actions";
import ActionForm, { SelectField } from "@/components/ui/ActionForm";
import { Card, Badge } from "@/components/ui/primitives";
import { PAYMENT_LABEL, PAYMENT_PROVIDERS } from "@/lib/provider-meta";

/**
 * Which gateway takes the platform's own money.
 *
 * It was a raw JSON box among the others, and the value is the one thing
 * standing between the product and being paid: without it every self-serve
 * checkout refuses, and the refusal names a setting nobody has seen. A
 * mistyped key or a stray comma in that box failed the same way and looked
 * identical.
 *
 * So it gets a form. The choice is narrowed to workspaces that actually
 * have a payment gateway connected, because naming one that does not is
 * the same outage with a different cause — and a workspace with no
 * credentials cannot be the answer however carefully the JSON is typed.
 */
export default async function PlatformGateway() {
  const admin = createAdminClient();

  const [{ data: setting }, { data: integrations }] = await Promise.all([
    admin.from("platform_settings").select("value").eq("key", "platform_payment_org").maybeSingle(),
    admin
      .from("org_integrations")
      .select("org_id, provider, status")
      .in("provider", PAYMENT_PROVIDERS)
      .eq("status", "connected"),
  ]);

  const rows = integrations ?? [];
  const orgIds = [...new Set(rows.map((row) => row.org_id))];

  const { data: orgs } = orgIds.length
    ? await admin.from("organizations").select("id, name").in("id", orgIds)
    : { data: [] };

  const nameById = new Map((orgs ?? []).map((org) => [org.id, org.name]));

  // One option per workspace-and-gateway pair: a workspace with both
  // Razorpay and Stripe connected is two genuinely different answers, and
  // asking for the workspace first and the gateway second would let
  // someone pick a combination that does not exist.
  const options = rows
    .map((row) => ({
      value: `${row.org_id}:${row.provider}`,
      label: `${nameById.get(row.org_id) ?? row.org_id} · ${PAYMENT_LABEL[row.provider as keyof typeof PAYMENT_LABEL] ?? row.provider}`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const current = setting?.value as { org_id?: string; provider?: string } | null;
  const currentValue =
    current?.org_id && current?.provider ? `${current.org_id}:${current.provider}` : "";
  const currentLabel = options.find((option) => option.value === currentValue)?.label;

  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-center gap-2.5 mb-1">
        <h2 className="font-semibold">Who takes subscription payments</h2>
        {currentValue ? (
          <Badge tone={currentLabel ? "green" : "amber"}>
            {currentLabel ? "configured" : "points at something missing"}
          </Badge>
        ) : (
          <Badge tone="amber">not set</Badge>
        )}
      </div>
      <p className="text-sm text-white/50 mb-5 leading-relaxed">
        The gateway a customer&rsquo;s card or UPI payment goes to when they buy a plan. It has to
        be your own workspace&rsquo;s gateway — a tenant paying you through their own Razorpay
        account would be paying themselves. Until this is set, self-serve checkout refuses every
        attempt.
      </p>

      {options.length === 0 ? (
        <p className="text-sm text-[#FACC15] leading-relaxed">
          No workspace has a payment gateway connected yet. Open the workspace you run your own
          business from, go to Integrations, and connect Razorpay, Cashfree or Stripe there. It
          will appear here once it does.
        </p>
      ) : (
        <ActionForm action={savePlatformGateway} submitLabel="Save">
          <div className="space-y-4">
            <SelectField
              label="Workspace and gateway"
              name="target"
              defaultValue={currentValue || options[0].value}
              options={options}
            />
            {currentValue && !currentLabel && (
              <p className="text-xs text-[#FACC15] leading-relaxed">
                What is saved right now points at a workspace or gateway that is no longer
                connected, so checkout is failing. Pick one below and save.
              </p>
            )}
          </div>
        </ActionForm>
      )}
    </Card>
  );
}
