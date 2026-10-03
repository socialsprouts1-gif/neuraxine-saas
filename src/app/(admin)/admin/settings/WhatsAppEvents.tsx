import { createAdminClient } from "@/lib/supabase/admin";
import { saveWhatsAppEvents } from "../actions";
import ActionForm, { SelectField } from "@/components/ui/ActionForm";
import { Card } from "@/components/ui/primitives";
import { EVENTS, readEvents } from "@/lib/whatsapp-events";
import { resolveTemplateShape } from "@/lib/template-unpack";
import { variableCount } from "@/lib/template-variables";
import { displayWaNumber } from "@/lib/whatsapp-link";

/**
 * The WhatsApp messages the platform sends its own customers.
 *
 * Templates are chosen from a list, not typed. A name typed by hand is a
 * 404 from Meta that names nothing — and the list has to carry the
 * language too, because the same template name exists once per language
 * and sending the wrong one fails exactly the same way.
 *
 * The list is what Meta has actually approved on the chosen number, so a
 * template that is still in review cannot be picked and then silently
 * fail for every customer.
 */
export default async function WhatsAppEvents() {
  const admin = createAdminClient();

  const [{ data: setting }, { data: connections }] = await Promise.all([
    admin.from("platform_settings").select("value").eq("key", "platform_whatsapp").maybeSingle(),
    admin
      .from("waba_connections")
      .select("id, org_id, waba_id, display_phone_number, label, status")
      .eq("status", "active")
      .limit(50),
  ]);

  const settings = readEvents(setting?.value);

  const orgIds = [...new Set((connections ?? []).map((row) => row.org_id))];
  const { data: orgs } = orgIds.length
    ? await admin.from("organizations").select("id, name").in("id", orgIds)
    : { data: [] };
  const orgName = new Map((orgs ?? []).map((row) => [row.id, row.name]));

  const senders = (connections ?? []).map((row) => ({
    value: `${row.org_id}|${row.id}`,
    wabaId: row.waba_id,
    label: `${orgName.get(row.org_id) ?? "Workspace"} — ${
      row.display_phone_number ? displayWaNumber(row.display_phone_number) : "number pending"
    }${row.label ? ` (${row.label})` : ""}`,
  }));

  const current = settings.orgId ? `${settings.orgId}|${settings.connectionId}` : "";

  // Approved templates on the chosen number. Scoped to its WhatsApp
  // account, because a template belongs to the account rather than to the
  // workspace, and offering one from a different account is a 404.
  const chosen = senders.find((sender) => sender.value === current) ?? senders[0];
  const { data: templates } = chosen?.wabaId
    ? await admin
        .from("message_templates")
        .select("name, language, category, body_text, components_json")
        .eq("waba_id", chosen.wabaId)
        .eq("status", "approved")
        .order("name")
    : { data: [] };

  // The category is in the label because it is the difference between a
  // code that arrives and a template Meta refuses: a one-time code belongs
  // in an AUTHENTICATION template, and nothing on screen would otherwise
  // say which of these is one.
  const templateOptions = (templates ?? []).map((row) => ({
    value: `${row.name}|${row.language}`,
    label: `${row.name} · ${row.language} · ${row.category}`,
    category: String(row.category ?? ""),
    // A code template has to declare exactly one variable, and the obvious
    // thing to write — "Hi {{1}}, your code is {{2}}" — declares two.
    // Caught here rather than as a Meta refusal nobody sees.
    variables: variableCount(resolveTemplateShape(row).bodyText),
  }));

  /** The chosen template, for the one event that cares what is in it. */
  const chosenOption = (templateName: string, language: string) =>
    templateOptions.find((option) => option.value === `${templateName}|${language}`);

  return (
    <Card className="mb-6">
      <h2 className="font-semibold mb-1">WhatsApp messages to your customers</h2>
      <p className="text-sm text-white/50 mb-5 leading-relaxed">
        Sent from one of your own WhatsApp numbers to the number somebody gave when they signed
        up. Each one has to be an <span className="text-white/75">approved template</span> — these
        reach people who have never messaged you, so the 24-hour window is shut and Meta refuses
        free-form text.
      </p>

      {senders.length === 0 ? (
        <p className="text-sm text-[#FACC15]/80 leading-relaxed">
          No active WhatsApp number is connected on any workspace yet. Connect one under
          Integrations first — there is nothing to send from.
        </p>
      ) : (
        <ActionForm action={saveWhatsAppEvents} submitLabel="Save">
          <SelectField
            label="Send everything from"
            name="sender"
            defaultValue={current}
            options={senders.map(({ value, label }) => ({ value, label }))}
          />

          {templateOptions.length === 0 && (
            <p className="text-sm text-[#FACC15]/80 leading-relaxed">
              That number has no approved templates yet. Create one in WhatsApp Manager, press
              Sync on the Templates screen, then come back — there is nothing to choose from
              until Meta has approved it.
            </p>
          )}

          {EVENTS.map((event) => {
            const message = settings.messages[event.key];
            const chosenTemplate = message.templateName
              ? `${message.templateName}|${message.language}`
              : "";

            return (
              <div
                key={event.key}
                className="rounded-2xl border border-white/10 bg-white/3 p-4 space-y-3"
              >
                <div>
                  <h3 className="text-sm font-semibold">{event.label}</h3>
                  <p className="text-xs text-white/45 mt-0.5 leading-relaxed">{event.when}</p>
                </div>

                <SelectField
                  label="Send this one?"
                  name={`${event.key}_enabled`}
                  defaultValue={message.enabled ? "on" : "off"}
                  options={[
                    { value: "off", label: "No" },
                    { value: "on", label: "Yes" },
                  ]}
                />

                <SelectField
                  label="Template"
                  name={`${event.key}_template`}
                  defaultValue={chosenTemplate}
                  options={[
                    { value: "", label: templateOptions.length ? "— choose a template —" : "— none approved yet —" },
                    // A template configured earlier that is no longer in
                    // the approved list still shows, so saving another
                    // event does not silently blank it.
                    ...(chosenTemplate && !templateOptions.some((o) => o.value === chosenTemplate)
                      ? [{ value: chosenTemplate, label: `${message.templateName} · ${message.language} (not approved)` }]
                      : []),
                    ...templateOptions,
                  ]}
                />

                {event.carriesCode ? (
                  <p className="text-xs text-white/45 leading-relaxed">
                    <span className="block mb-1.5 text-white/60">
                      Until this is set, sign-up codes go to the customer&rsquo;s email instead,
                      so nobody is stopped from creating an account. Email proves their inbox,
                      not their phone — which is the whole reason to set this.
                    </span>
                    This one&rsquo;s variable is the code itself, so there is nothing to choose.
                    Use an <span className="text-white/75">AUTHENTICATION</span> template — Meta
                    reserves those for one-time codes, and they are the only ones that get the
                    copy-code button. If yours has that button, the code is put into it
                    automatically.
                    {(() => {
                      const picked = message.templateName
                        ? chosenOption(message.templateName, message.language)
                        : undefined;
                      if (!picked) return null;

                      return (
                        <>
                          {picked.variables !== 1 && (
                            <span className="block mt-1.5 text-[#F87171]/85">
                              This template has {picked.variables === 0 ? "no variables" : `${picked.variables} variables`}. A
                              code template takes exactly one — the code, written as{" "}
                              {"{{1}}"} — so this one cannot send and codes will go by email
                              instead.
                            </span>
                          )}
                          {picked.category && picked.category !== "AUTHENTICATION" && (
                            <span className="block mt-1.5 text-[#FACC15]/80">
                              This is a {picked.category} template. Meta reserves AUTHENTICATION
                              for codes and only opens it to accounts that have scaled, so a
                              UTILITY one is the usual way round it — it sends, but keep the
                              wording about the sign-up they just started rather than about a
                              passcode.
                            </span>
                          )}
                        </>
                      );
                    })()}
                  </p>
                ) : (
                  <SelectField
                    label="Does it greet them by name?"
                    name={`${event.key}_uses_name`}
                    defaultValue={message.usesName ? "on" : "off"}
                    options={[
                      { value: "off", label: "No — it has no variables" },
                      { value: "on", label: "Yes — it takes their name as {{1}}" },
                    ]}
                  />
                )}
              </div>
            );
          })}
        </ActionForm>
      )}
    </Card>
  );
}
