import { createClient } from "@/lib/supabase/server";
import { requireFeature } from "@/lib/org";
import { listActiveConnections, optionLabel } from "@/lib/connections";
import { saveFaqEntry, addFaqStarters } from "../portal-actions";
import ActionForm, { Field, SelectField, TextareaField } from "@/components/ui/ActionForm";
import { PageHeader, Card, StatCard, EmptyState } from "@/components/ui/primitives";
import FaqCard from "./FaqCard";
import type { FaqEntry } from "@/types/portal";

export default async function FaqBotPage() {
  const { orgId } = await requireFeature("faq_bot");
  const supabase = await createClient();

  const [{ data: entries, error }, connections] = await Promise.all([
    supabase
      .from("faq_entries")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false }),
    listActiveConnections(supabase, orgId),
  ]);

  const numbers = connections.map((connection) => ({
    id: connection.id,
    label: optionLabel(connection),
  }));

  const all = (entries ?? []) as Array<FaqEntry & { connection_id?: string | null }>;
  const categories = new Set(all.map((e) => e.category).filter(Boolean));
  const totalHits = all.reduce((s, e) => s + e.hit_count, 0);

  return (
    <div className="p-6 md:p-8">
      <PageHeader
        title="FAQ Bot"
        subtitle="Answer the questions you get asked over and over, without typing them again."
      />

      {/* How it fires, said once. Keywords are the entire mechanism and
          the field people leave empty, and a bot that never answers reads
          as broken rather than unconfigured. */}
      <Card className="mb-6 border-white/10">
        <h2 className="font-semibold mb-1">How the FAQ bot works</h2>
        <p className="text-sm text-white/55 leading-relaxed">
          When a customer writes to you, their message is checked against the{" "}
          <span className="text-white/80">keywords</span> on every active question here. The
          best match is sent back automatically, in that chat, within seconds — no template
          needed, because they wrote first. If nothing matches, the message goes to your inbox
          as normal and nobody is sent a wrong answer.
        </p>
        <p className="text-sm text-white/45 leading-relaxed mt-2.5">
          So the keywords matter more than the question does: write the words customers
          actually type — <span className="text-white/65">&ldquo;kitna time&rdquo;</span>,{" "}
          <span className="text-white/65">&ldquo;how long&rdquo;</span>,{" "}
          <span className="text-white/65">&ldquo;delivery&rdquo;</span> — not the polite
          version.
        </p>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Questions" value={all.length} />
        <StatCard label="Categories" value={categories.size} />
        <StatCard label="Answering" value={all.filter((e) => e.is_active).length} />
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
            all.map((entry) => (
              <FaqCard key={entry.id} entry={entry} numbers={numbers} />
            ))
          ) : (
            <Card>
              <h3 className="font-semibold mb-1">Nothing here yet, so the bot answers nothing</h3>
              <p className="text-sm text-white/50 leading-relaxed mb-4">
                Add the six questions almost every business is asked. They come with the
                keywords already filled in, so the bot works immediately — then edit the
                answers to match your business.
              </p>
              <ActionForm action={addFaqStarters} submitLabel="Add 6 starter questions" compact>
                <input type="hidden" name="_" value="" />
              </ActionForm>
              <p className="text-[11px] text-white/35 mt-3 leading-relaxed">
                Or write your own on the right. Nothing is sent to a customer until a question
                is active and its keywords match what they typed.
              </p>
            </Card>
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
              {numbers.length > 1 && (
                <SelectField
                  label="Answer on"
                  name="connection_id"
                  options={[
                    { value: "", label: "Every number" },
                    ...numbers.map((number) => ({ value: number.id, label: number.label })),
                  ]}
                />
              )}
            </div>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
