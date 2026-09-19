import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/org";
import { PageHeader, Card, Badge, StatCard } from "@/components/ui/primitives";
import { formatDate, formatMoney } from "@/types/admin";
import { resolveFeatures } from "@/lib/features";
import FeatureGrid from "../../FeatureGrid";
import ActionForm, { SelectField } from "@/components/ui/ActionForm";
import { assignPlan } from "../../actions";
import { saveOrgFeatures } from "../../actions";
import SuspendControls from "./SuspendControls";

export default async function AdminOrganizationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePlatformAdmin();
  const { id } = await params;
  // Service role: this page is reached from the list above, and would
  // otherwise 404 on every workspace the admin is not a member of.
  const supabase = createAdminClient();

  const [
    { data: org },
    { data: subscription },
    { data: members },
    { data: defaults },
    { data: plans },
  ] =
    await Promise.all([
      supabase
        .from("organizations")
        .select("id, name, created_at, feature_overrides, suspended_at, suspended_reason")
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("subscriptions")
        .select("status, plans(name, feature_keys)")
        .eq("org_id", id)
        .maybeSingle(),
      supabase.from("org_members").select("user_id, role").eq("org_id", id),
      supabase.from("platform_settings").select("value").eq("key", "feature_defaults").maybeSingle(),
      supabase
        .from("plans")
        .select("id, name, billing_interval, price_cents, currency")
        .eq("is_active", true)
        .order("sort_order"),
    ]);

  if (!org) notFound();

  const plan = subscription?.plans as { name: string; feature_keys?: string[] } | null | undefined;

  // What the customer actually has now, and what they would have from the
  // plan alone. The grid marks the difference between the two so it is
  // obvious which boxes are a deliberate exception for this workspace.
  const effective = resolveFeatures({
    platform: defaults?.value,
    plan: plan?.feature_keys,
    org: org.feature_overrides,
  });
  const fromPlan = resolveFeatures({ platform: defaults?.value, plan: plan?.feature_keys });

  return (
    <div className="p-6 md:p-8">
      <Link
        href="/admin/organizations"
        className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white transition-colors mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        All organizations
      </Link>

      <PageHeader
        title={org.name}
        subtitle={`Created ${formatDate(org.created_at)} · ${org.id}`}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Plan" value={plan?.name ?? "None"} />
        <StatCard label="Subscription" value={subscription?.status ?? "—"} />
        <StatCard label="Members" value={members?.length ?? 0} />
        <StatCard
          label="Status"
          value={org.suspended_at ? "Suspended" : "Active"}
        />
      </div>

      {/* Assigning a plan lived on the organizations list, two clicks and a
          screen away from the access grid it decides the starting point
          for. Both belong wherever somebody is deciding what a customer
          gets. */}
      <Card className="mb-6">
        <h2 className="font-semibold mb-1">Plan</h2>
        <p className="text-xs text-white/45 leading-relaxed mb-4 max-w-2xl">
          {plan
            ? `On ${plan.name}${subscription?.status ? `, ${subscription.status}` : ""}. Changing it here assigns the plan directly — no payment is taken, so use it for a customer who has paid another way, or to put someone on a tier while you sort billing out.`
            : "No plan yet. Assigning one here does not take a payment — it grants the tier outright. A customer who buys one themselves from the Billing screen is activated by the gateway instead."}
        </p>
        {plans && plans.length > 0 ? (
          <ActionForm action={assignPlan} submitLabel="Assign plan" compact>
            <input type="hidden" name="org_id" value={org.id} />
            <SelectField
              label="Plan"
              name="plan_id"
              options={plans.map((option) => ({
                value: option.id,
                label: `${option.name} · ${formatMoney(option.price_cents, option.currency)} ${
                  option.billing_interval === "yearly" ? "a year" : "a month"
                }`,
              }))}
            />
          </ActionForm>
        ) : (
          <p className="text-sm text-[#FACC15]">
            No active plans to assign. Create one under Plans first.
          </p>
        )}
      </Card>

      <Card className="mb-6">
        <h2 className="font-semibold mb-1">Suspension</h2>
        <p className="text-xs text-white/45 leading-relaxed mb-4 max-w-2xl">
          A suspended workspace shows a banner on every screen. Billing and Settings stay
          reachable on purpose — locking somebody out of the page that explains the problem is
          how a late payment turns into a lost customer.
        </p>
        <SuspendControls
          orgId={org.id}
          suspended={Boolean(org.suspended_at)}
          reason={org.suspended_reason ?? ""}
        />
      </Card>

      <Card>
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <h2 className="font-semibold">Feature access</h2>
          {plan && <Badge tone="blue">on the {plan.name} plan</Badge>}
        </div>
        <FeatureGrid
          action={saveOrgFeatures}
          hiddenFields={{ org_id: org.id }}
          enabled={effective}
          planKeys={fromPlan}
          note={
            plan
              ? `Starts from what the ${plan.name} plan includes. Anything you change here is stored as an exception for this workspace alone, and marked "override" — so if they move to another tier, only the exceptions follow them.`
              : "This workspace has no plan, so it currently gets everything. Anything you switch off here is stored as an exception for this workspace alone."
          }
          submitLabel="Save access"
        />
      </Card>
    </div>
  );
}
