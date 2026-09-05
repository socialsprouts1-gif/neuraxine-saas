import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";
import { saveFaqEntry, deleteFaqEntry } from "../portal-actions";
import ActionForm, { Field, TextareaField } from "@/components/ui/ActionForm";
import { PageHeader, Card, StatCard, Badge, EmptyState } from "@/components/ui/primitives";

export default async function FaqBotPage() {
  const { orgId } = await requireOrg();
  const supabase = await createClient();

  const { data: entries, error } = await supabase
    .from("faq_entries")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  const all = entries ?? [];
  const categories = new Set(all.map((e) => e.category).filter(Boolean));
  const totalHits = all.reduce((s, e) => s + e.hit_count, 0);

  return (
    <div className="p-6 md:p-8">
      <PageHeader
        title="FAQ Bot"
        subtitle="Answer the questions you get asked over and over, without typing them again."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Questions" value={all.length} />
        <StatCard label="Categories" value={categories.size} />
        <StatCard label="Active" value={all.filter((e) => e.is_active).length} />
        <StatCard label="Times answered" value={totalHits} />
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
        <div className="order-2 lg:order-1 space-y-3">
          {error ? (
            <EmptyState
              title="Couldn't load FAQs"
              description={`${error.message}. If this mentions a missing relation, the portal migration hasn't been applied yet.`}
            />
          ) : all.length > 0 ? (
            all.map((e) => (
              <Card key={e.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <h3 className="font-semibold text-sm">{e.question}</h3>
                      {e.category && <Badge tone="blue">{e.category}</Badge>}
                      {e.hit_count > 0 && <Badge tone="green">{e.hit_count} answered</Badge>}
                    </div>
                    <p className="text-sm text-white/55 whitespace-pre-wrap">{e.answer}</p>
                    {e.keywords.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-3">
                        {e.keywords.map((k) => (
                          <span
                            key={k}
                            className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 border border-white/10 text-white/45"
                          >
                            {k}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <ActionForm action={deleteFaqEntry} submitLabel="Delete" compact>
                    <input type="hidden" name="id" value={e.id} />
                  </ActionForm>
                </div>
              </Card>
            ))
          ) : (
            <EmptyState
              title="No FAQs yet"
              description="Add the questions customers ask most — delivery times, refunds, opening hours."
            />
          )}
        </div>

        <Card className="order-1 lg:order-2">
          <h2 className="font-semibold mb-1">Add a question</h2>
          <p className="text-sm text-white/50 mb-5">
            Keywords decide when this answer is used, so include the words customers actually type.
          </p>

          <ActionForm action={saveFaqEntry} submitLabel="Add FAQ" resetOnSuccess>
            <div className="space-y-4">
              <Field
                label="Question"
                name="question"
                required
                placeholder="How long does delivery take?"
              />
              <TextareaField
                label="Answer"
                name="answer"
                rows={4}
                required
                placeholder="Orders ship within 24 hours and usually arrive in 3–5 working days."
              />
              <Field
                label="Keywords"
                name="keywords"
                placeholder="delivery, shipping, how long"
                hint="Comma separated"
              />
              <Field label="Category" name="category" placeholder="Shipping" />
            </div>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
