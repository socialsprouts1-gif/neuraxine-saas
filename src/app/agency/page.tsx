import { createAdminClient } from "@/lib/supabase/admin";
import { brandsIOwn } from "@/lib/brand-access";
import { saveBrandLook } from "@/app/(admin)/admin/brand-actions";
import ActionForm, { Field } from "@/components/ui/ActionForm";
import { PageHeader, Card, Badge, Table, Td, EmptyState } from "@/components/ui/primitives";
import LocalTime from "@/components/ui/LocalTime";

// What an agency sees: their front door, and who came through it.
//
// Deliberately not their clients' data. A workspace's contacts, messages
// and inbox belong to the business that owns it, and an agency reselling
// the product is not that business. What they get is what they need to
// run a reselling business: who signed up, when, on what plan, and whether
// anything is wrong with the account.

export const dynamic = "force-dynamic";

const ROOT_DOMAIN = process.env.PLATFORM_ROOT_DOMAIN ?? "";

export default async function AgencyPage() {
  // The layout has already redirected anybody who owns nothing.
  const brands = await brandsIOwn();
  const brand = brands[0];

  const admin = createAdminClient();
  const { data: clients } = await admin
    .from("organizations")
    .select("id, name, created_at, suspended_at, subscriptions(status, plans(name))")
    .eq("brand_id", brand.id)
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = clients ?? [];
  const live = rows.filter((row) => !row.suspended_at).length;
  const address = brand.domain ?? `${brand.slug}.${ROOT_DOMAIN || "your-domain.com"}`;

  return (
    <div className="p-6 md:p-8 space-y-6">
      <PageHeader
        title={`${brand.name}${brand.nameAccent}`}
        subtitle="Your brand, and the businesses that signed up through it."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs text-white/45">Your address</p>
          <p className="text-sm font-mono text-white/80 break-all">{address}</p>
          <p className="text-[11px] text-white/35 mt-1.5 leading-relaxed">
            Send customers here. They see your name on everything, and never ours.
          </p>
          {/* The link that works whatever DNS is doing. Worth having in
              front of an agency checking their own logo: "my address does
              not open yet" and "my logo is wrong" are different problems
              and this separates them. */}
          <a
            href={`/b/${brand.slug}`}
            className="inline-block text-[11px] text-accent-ink hover:underline mt-2"
          >
            Preview it here →
          </a>
        </Card>
        <Card>
          <p className="text-xs text-white/45">Clients</p>
          <p className="text-2xl font-semibold tabular-nums">{rows.length}</p>
        </Card>
        <Card>
          <p className="text-xs text-white/45">Active</p>
          <p className="text-2xl font-semibold tabular-nums">{live}</p>
        </Card>
      </div>

      <div className="grid lg:grid-cols-[1fr_380px] gap-6 items-start">
        <div className="order-2 lg:order-1">
          <h2 className="font-semibold mb-3">Your clients</h2>
          {rows.length === 0 ? (
            <EmptyState
              title="Nobody yet"
              description={`Anyone who signs up at ${address} appears here, with your name on the product from the first screen.`}
            />
          ) : (
            <Table head={["Business", "Joined", "Plan", "State"]}>
              {rows.map((row) => {
                const subscription = Array.isArray(row.subscriptions)
                  ? row.subscriptions[0]
                  : row.subscriptions;
                const plan = (subscription as { plans?: { name?: string } | null } | null)?.plans;
                const status = (subscription as { status?: string } | null)?.status;
                return (
                  <tr key={row.id} className="hover:bg-white/3 transition-colors">
                    <Td className="font-medium">{row.name}</Td>
                    <Td className="text-white/45 text-xs whitespace-nowrap">
                      <LocalTime iso={row.created_at} />
                    </Td>
                    <Td className="text-white/60 text-xs">{plan?.name ?? "—"}</Td>
                    <Td>
                      {row.suspended_at ? (
                        <Badge tone="red">suspended</Badge>
                      ) : status === "trialing" ? (
                        <Badge tone="amber">trial</Badge>
                      ) : status === "active" ? (
                        <Badge tone="green">active</Badge>
                      ) : (
                        <Badge tone="grey">{status ?? "no plan"}</Badge>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </Table>
          )}
        </div>

        <Card className="order-1 lg:order-2">
          <h2 className="font-semibold mb-1">How your brand looks</h2>
          <p className="text-sm text-white/50 mb-5">
            Changes go live at {address} straight away.
          </p>
          <ActionForm action={saveBrandLook} submitLabel="Save">
            <input type="hidden" name="id" value={brand.id} />
            <div className="space-y-4">
              <Field label="Name" name="name" defaultValue={brand.name} required />
              <Field
                label="Second half of the name"
                name="name_accent"
                defaultValue={brand.nameAccent}
                hint="Rendered in your colour, as in Acme·Chat. Leave blank for one word."
              />
              <Field
                label="Logo URL"
                name="logo_url"
                defaultValue={brand.logoUrl}
                placeholder="https://…/logo.svg"
                hint="Blank shows your name as text, never ours."
              />
              <Field
                label="Browser icon URL"
                name="favicon_url"
                defaultValue={brand.faviconUrl}
                placeholder="https://…/icon.png"
              />
              <Field
                label="Your colour"
                name="accent_hex"
                defaultValue={brand.accentHex}
                placeholder="#2F6BFF"
                hint="One hex code. Light and dark shades are worked out from it so text stays readable."
              />
              <Field
                label="Browser tab title"
                name="site_title"
                defaultValue={brand.siteTitle}
                placeholder="Acme Chat"
              />
              <Field
                label="One-line description"
                name="site_description"
                defaultValue={brand.siteDescription}
                hint="Shown when somebody shares your link."
              />
              <Field
                label="Support email"
                name="support_email"
                type="email"
                defaultValue={brand.supportEmail}
                hint="Yours, not ours. Blank means no support address is shown at all."
              />
              <Field
                label="Support WhatsApp"
                name="support_whatsapp"
                defaultValue={brand.supportWhatsapp}
                placeholder="+91 90000 00000"
              />
            </div>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
