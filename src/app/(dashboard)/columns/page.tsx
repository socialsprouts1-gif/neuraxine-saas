import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";
import { saveContactColumn, deleteContactColumn } from "../manage-actions";
import ActionForm, { Field, SelectField } from "@/components/ui/ActionForm";
import { PageHeader, Card, StatCard, Badge, Table, Td, EmptyState } from "@/components/ui/primitives";
import { COLUMN_TYPES } from "@/types/portal";

export default async function ColumnsPage() {
  const { orgId } = await requireOrg();
  const supabase = await createClient();

  const { data: columns, error } = await supabase
    .from("contact_columns")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at");

  const all = columns ?? [];

  return (
    <div className="p-6 md:p-8">
      <PageHeader
        title="Columns"
        subtitle="Custom fields on a contact. Anything you collect here can be used in a message as a variable."
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <StatCard label="Custom columns" value={all.length} />
        <StatCard label="Choice fields" value={all.filter((c) => c.field_type === "select").length} />
        <StatCard label="Built in" value={3} hint="Name, number, tags" />
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
        <div className="order-2 lg:order-1">
          {error ? (
            <EmptyState
              title="Couldn't load columns"
              description={`${error.message}. If this mentions a missing relation, run supabase/setup.sql again.`}
            />
          ) : all.length > 0 ? (
            <Table head={["Label", "Variable", "Type", "Options", ""]}>
              {all.map((column) => (
                <tr key={column.id} className="hover:bg-white/3 transition-colors">
                  <Td className="font-medium">{column.label}</Td>
                  <Td>
                    <code className="text-[11px] text-accent2-ink">{`{{${column.key}}}`}</code>
                  </Td>
                  <Td>
                    <Badge tone="purple">
                      {COLUMN_TYPES.find((t) => t.value === column.field_type)?.label ?? column.field_type}
                    </Badge>
                  </Td>
                  <Td className="text-white/45 text-xs">
                    {column.options.length ? column.options.join(", ") : "—"}
                  </Td>
                  <Td>
                    <ActionForm action={deleteContactColumn} submitLabel="Delete" compact>
                      <input type="hidden" name="id" value={column.id} />
                    </ActionForm>
                  </Td>
                </tr>
              ))}
            </Table>
          ) : (
            <EmptyState
              title="No custom columns yet"
              description="Add fields like City, Order value or Plan — then use them in chatbot messages and campaigns."
            />
          )}
        </div>

        <Card className="order-1 lg:order-2">
          <h2 className="font-semibold mb-1">New column</h2>
          <p className="text-sm text-white/50 mb-5">
            The variable name is derived from the label, so it never contains spaces.
          </p>
          <ActionForm action={saveContactColumn} submitLabel="Add column" resetOnSuccess>
            <div className="space-y-4">
              <Field label="Label" name="label" required placeholder="City" />
              <SelectField
                label="Type"
                name="field_type"
                defaultValue="text"
                options={COLUMN_TYPES.map((t) => ({ value: t.value, label: t.label }))}
              />
              <Field
                label="Options"
                name="options"
                placeholder="Small, Medium, Large"
                hint="Comma separated. Only used by a Choice column."
              />
            </div>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
