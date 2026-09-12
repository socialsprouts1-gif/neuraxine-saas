import { createClient } from "@/lib/supabase/server";
import { requirePlatformAdmin } from "@/lib/org";
import { savePlan, saveTrialLength, togglePlan } from "../actions";
import PlanFeatureCard from "./PlanFeatureCard";
import { resolveFeatures } from "@/lib/features";
import ActionForm, { Field, SelectField } from "@/components/ui/ActionForm";
import { PageHeader, Card, Badge, Table, Td, EmptyState } from "@/components/ui/primitives";
import { formatMoney } from "@/types/admin";

export default async function AdminPlansPage() {
  await requirePlatformAdmin();
  const supabase = await createClient();

  const [{ data: plans, error }, { data: subs }, { data: billing }] = await Promise.all([
    supabase.from("plans").select("*").order("sort_order").order("price_cents"),
    supabase.from("subscriptions").select("plan_id"),
    supabase.from("platform_settings").select("value").eq("key", "billing").maybeSingle(),
  ]);

  const trialDays =
    Number((billing?.value as { trial_days?: number } | null)?.trial_days) || 14;

  const subscriberCount = new Map<string, number>();
  for (const s of subs ?? []) {
    if (s.plan_id) subscriberCount.set(s.plan_id, (subscriberCount.get(s.plan_id) ?? 0) + 1);
  }

  return (
    <div className="p-6 md:p-8">
      <PageHeader title="Plans" subtitle="The subscription catalogue offered to tenants." />

      {/* The trial belongs beside the price list: how long someone gets for
          free is part of the offer, not a setting buried in a JSON box. */}
      <Card className="mb-6">
        <h2 className="font-semibold mb-1">Free trial</h2>
        <p className="text-sm text-white/50 mb-4 max-w-xl leading-relaxed">
          Every new workspace starts on a trial of this length. When it ends they are asked to
          pick a plan; nothing is deleted. Changing this affects new signups only — a trial
          already running keeps the length it started with.
        </p>
        <ActionForm action={saveTrialLength} submitLabel="Save">
          <div className="max-w-[10rem]">
            <Field label="Days" name="trial_days" type="number" defaultValue={String(trialDays)} required />
          </div>
        </ActionForm>
      </Card>

      <div className="grid lg:grid-cols-[1fr_340px] gap-6 items-start">
        <div className="order-2 lg:order-1">
          {error ? (
            <EmptyState title="Couldn't load plans" description={error.message} />
          ) : plans && plans.length > 0 ? (
            <Table head={["Plan", "Price", "Limits", "Subscribers", "State", ""]}>
              {plans.map((p) => (
                <tr key={p.id} className="hover:bg-white/3 transition-colors">
                  <Td>
                    <div className="font-medium">{p.name}</div>
                    <div className="font-mono text-[10px] text-white/30">{p.slug}</div>
                  </Td>
                  <Td className="tabular-nums whitespace-nowrap">
                    {formatMoney(p.price_cents, p.currency)}
                    <span className="text-white/35 text-xs"> /{p.billing_interval === "yearly" ? "yr" : "mo"}</span>
                  </Td>
                  <Td className="text-xs text-white/50 whitespace-nowrap">
                    {p.message_limit?.toLocaleString() ?? "∞"} msg ·{" "}
                    {p.contact_limit?.toLocaleString() ?? "∞"} contacts · {p.seat_limit ?? "∞"} seats
                  </Td>
                  <Td className="tabular-nums">{subscriberCount.get(p.id) ?? 0}</Td>
                  <Td>
                    <Badge tone={p.is_active ? "green" : "grey"}>
                      {p.is_active ? "active" : "hidden"}
                    </Badge>
                  </Td>
                  <Td>
                    <ActionForm action={togglePlan} submitLabel={p.is_active ? "Hide" : "Show"} compact>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="is_active" value={String(p.is_active)} />
                    </ActionForm>
                  </Td>
                </tr>
              ))}
            </Table>
          ) : (
            <EmptyState
              title="No plans yet"
              description="The migration seeds Starter, Growth and Scale. If this is empty, the admin migration hasn't been applied."
            />
          )}
        </div>

        <Card className="order-1 lg:order-2">
          <h2 className="font-semibold mb-1">Add or update a plan</h2>
          <p className="text-sm text-white/50 mb-5">
            Matching an existing name updates that plan instead of creating a duplicate.
          </p>
          <ActionForm action={savePlan} submitLabel="Save plan" resetOnSuccess>
            <div className="space-y-4">
              <Field label="Plan name" name="name" required placeholder="Growth" />
              <Field label="Price (₹)" name="price" type="number" required placeholder="2999" />
              <SelectField
                label="Billing interval"
                name="billing_interval"
                defaultValue="monthly"
                options={[
                  { value: "monthly", label: "Monthly" },
                  { value: "yearly", label: "Yearly" },
                ]}
              />
              <Field label="Message limit" name="message_limit" type="number" placeholder="10000" hint="Blank for unlimited" />
              <Field label="Contact limit" name="contact_limit" type="number" placeholder="5000" />
              <Field label="Seat limit" name="seat_limit" type="number" placeholder="10" />
            </div>
          </ActionForm>
        </Card>
      </div>

      {plans && plans.length > 0 && (
        <div className="mt-8">
          <h2 className="font-semibold mb-1">What each plan includes</h2>
          <p className="text-sm text-white/45 mb-4 max-w-2xl leading-relaxed">
            Switching a feature off here hides it from the sidebar and refuses the page for
            everybody on that tier. A workspace can still be given an exception on its own
            Access screen, which is where a customer who negotiated one belongs.
          </p>
          <div className="space-y-3">
            {plans.map((plan) => (
              <PlanFeatureCard
                key={plan.id}
                plan={{
                  id: plan.id,
                  name: plan.name,
                  feature_keys: plan.feature_keys ?? [],
                }}
                enabled={resolveFeatures({ plan: plan.feature_keys })}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
