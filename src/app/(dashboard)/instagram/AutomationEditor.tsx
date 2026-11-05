"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  ArrowRight,
  AtSign,
  Check,
  Gift,
  Image as ImageIcon,
  Link2,
  Loader2,
  MessageCircle,
  Plus,
  UserPlus,
  X,
} from "lucide-react";
import Modal from "@/components/ui/Modal";
import {
  BUTTON_TITLE_LIMIT,
  buttonProblem,
  DEFAULT_EMAIL_PROMPT,
  DEFAULT_FOLLOW_GATE,
  MAX_BUTTONS,
  type AutomationButton,
} from "@/lib/instagram";
import { recentMedia, saveCommentRule } from "../instagram-actions";
import type { MediaItem } from "@/lib/instagram-api";
import type { Starter } from "@/lib/instagram-templates";

// One automation, three questions.
//
// The old version of this screen asked ten things at once and left you
// to work out which mattered. It is three steps now — when, what, and
// anything extra — because somebody writing their first automation
// cannot tell a required field from a nicety, and a form that cannot be
// told apart is a form nobody finishes.
//
// Only step 3 is skippable, and it says so. Step 1 and step 2 together
// are a complete, working automation.

export interface AutomationRow {
  id: string;
  name: string;
  trigger_type: string;
  keywords: string[];
  media_id: string | null;
  media_thumbnail_url: string | null;
  media_caption: string | null;
  dm_message: string | null;
  public_reply: string | null;
  buttons: AutomationButton[];
  follow_gate: boolean;
  follow_gate_message: string | null;
  ask_email: boolean;
  ask_email_message: string | null;
  is_active: boolean;
  run_count: number;
  sent_count: number;
  button_click_count: number;
  follower_gain_count: number;
  email_count: number;
  created_at: string | null;
}

const FIELD =
  "w-full bg-white/5 border border-white/12 rounded-xl px-4 py-3 text-[15px] text-white placeholder-white/25 focus:outline-none focus:border-[#E4405F]/60 focus:bg-white/8 transition-colors disabled:opacity-60";

const STEPS = ["When", "What you send", "Extras"];

function Ask({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-2.5">
      <div className="text-[15px] font-semibold text-white">{children}</div>
      {hint && <div className="text-[13px] text-white/40 mt-1 leading-relaxed">{hint}</div>}
    </div>
  );
}

function Choice({
  on,
  onClick,
  icon: Icon,
  title,
  sub,
  disabled,
}: {
  on: boolean;
  onClick: () => void;
  icon: typeof MessageCircle;
  title: string;
  sub: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`text-left p-4 rounded-2xl border-2 transition-all disabled:opacity-50 ${
        on
          ? "border-[#E4405F] bg-[#E4405F]/10"
          : "border-white/10 bg-white/4 hover:border-white/25"
      }`}
    >
      <span
        className={`w-9 h-9 rounded-xl grid place-items-center mb-2.5 ${
          on ? "bg-[#E4405F] text-[#FFFFFF]" : "bg-white/8 text-white/50"
        }`}
      >
        <Icon className="w-[18px] h-[18px]" />
      </span>
      <span className="block text-[14px] font-semibold">{title}</span>
      <span className="block text-[12.5px] text-white/40 mt-0.5 leading-relaxed">{sub}</span>
    </button>
  );
}

function Toggle({
  on,
  onChange,
  icon: Icon,
  title,
  hint,
  disabled,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  icon: typeof UserPlus;
  title: string;
  hint: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      disabled={disabled}
      className={`w-full text-left flex items-center gap-3.5 p-4 rounded-2xl border-2 transition-all disabled:opacity-50 ${
        on ? "border-[#833AB4] bg-[#833AB4]/10" : "border-white/10 bg-white/4 hover:border-white/25"
      }`}
    >
      <span
        className={`w-9 h-9 rounded-xl grid place-items-center flex-shrink-0 ${
          on ? "bg-[#833AB4] text-[#FFFFFF]" : "bg-white/8 text-white/50"
        }`}
      >
        <Icon className="w-[18px] h-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold">{title}</span>
        <span className="block text-[12.5px] text-white/40 mt-0.5 leading-relaxed">{hint}</span>
      </span>
      <span
        className={`w-11 h-6 rounded-full flex-shrink-0 relative transition-colors ${
          on ? "bg-[#833AB4]" : "bg-white/15"
        }`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-[#FFFFFF] transition-all ${
            on ? "left-[22px]" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}

export default function AutomationEditor({
  rule,
  from,
  accountId,
  onClose,
}: {
  rule?: AutomationRow;
  /** A starter the person picked, pre-filling everything. */
  from?: Starter;
  accountId: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const seed = from?.values;
  const [draft, setDraft] = useState({
    triggerType: (rule?.trigger_type === "dm"
      ? "dm"
      : seed?.triggerType ?? "comment") as "comment" | "dm",
    name: rule?.name ?? seed?.name ?? "",
    keywords: rule?.keywords.join(", ") ?? seed?.keywords ?? "",
    mediaId: rule?.media_id ?? "",
    mediaThumbnailUrl: rule?.media_thumbnail_url ?? "",
    mediaCaption: rule?.media_caption ?? "",
    dmMessage: rule?.dm_message ?? seed?.dmMessage ?? "",
    publicReply: rule?.public_reply ?? seed?.publicReply ?? "",
    followGate: rule?.follow_gate ?? seed?.followGate ?? false,
    followGateMessage: rule?.follow_gate_message ?? "",
    askEmail: rule?.ask_email ?? seed?.askEmail ?? false,
    askEmailMessage: rule?.ask_email_message ?? "",
  });
  const [buttons, setButtons] = useState<AutomationButton[]>(rule?.buttons ?? []);

  const set = (patch: Partial<typeof draft>) => setDraft((old) => ({ ...old, ...patch }));

  // --- the post picker ---
  const [picking, setPicking] = useState(false);
  const [media, setMedia] = useState<MediaItem[] | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);

  useEffect(() => {
    if (!picking || media || !accountId) return;
    let cancelled = false;
    void recentMedia(accountId)
      .then((result) => {
        if (cancelled) return;
        if (result.ok) setMedia(result.media);
        else setMediaError(result.error);
      })
      .catch(() => {
        if (!cancelled) setMediaError("Instagram did not answer. Try again in a moment.");
      });
    return () => {
      cancelled = true;
    };
  }, [picking, media, accountId]);

  const filled = buttons.filter((button) => button.label || button.url);
  const buttonIssue = buttonProblem(filled);

  // Checked per step, so step 1 never complains about step 2's message.
  const stepProblem =
    step === 0
      ? draft.name.trim()
        ? null
        : "Give it a name so you can find it again."
      : step === 1
        ? !draft.dmMessage.trim() && !draft.followGate && !draft.publicReply.trim()
          ? "Write the message you want sent."
          : buttonIssue
        : buttonIssue;

  const save = async () => {
    if (stepProblem) return setError(stepProblem);
    setBusy(true);
    setError(null);

    const result = await saveCommentRule({
      id: rule?.id,
      name: draft.name,
      triggerType: draft.triggerType,
      keywords: draft.keywords,
      mediaId: draft.triggerType === "dm" ? "" : draft.mediaId,
      mediaThumbnailUrl: draft.triggerType === "dm" ? "" : draft.mediaThumbnailUrl,
      mediaCaption: draft.triggerType === "dm" ? "" : draft.mediaCaption,
      dmMessage: draft.dmMessage,
      publicReply: draft.triggerType === "dm" ? "" : draft.publicReply,
      buttons: filled,
      followGate: draft.followGate,
      followGateMessage: draft.followGateMessage,
      askEmail: draft.askEmail,
      askEmailMessage: draft.askEmailMessage,
      connectionId: null,
    }).catch(() => ({ ok: false as const, error: "That could not be saved just now." }));

    setBusy(false);
    if (!result.ok) return setError(result.error ?? "That could not be saved.");
    toast.success(result.message ?? "Saved.");
    onClose();
    router.refresh();
  };

  const last = step === STEPS.length - 1;

  return (
    <Modal
      open
      onClose={onClose}
      title={rule ? "Edit automation" : "New automation"}
      size="lg"
      dismissable={!busy}
      footer={
        <>
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep((n) => n - 1)}
              disabled={busy}
              className="btn-quiet text-sm disabled:opacity-50"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="btn-quiet text-sm disabled:opacity-50"
            >
              Cancel
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              if (stepProblem) return setError(stepProblem);
              setError(null);
              if (last) void save();
              else setStep((n) => n + 1);
            }}
            disabled={busy}
            className="btn-primary text-sm disabled:opacity-50"
          >
            {busy ? "Saving…" : last ? "Turn it on" : "Next"}
            {!busy && !last && <ArrowRight className="w-4 h-4" />}
            {!busy && last && <Check className="w-4 h-4" />}
          </button>
        </>
      }
    >
      {/* --- where we are ------------------------------------------------ */}
      <div className="flex items-center gap-2 mb-6">
        {STEPS.map((label, index) => (
          <div key={label} className="flex items-center gap-2 flex-1">
            <div className="flex-1">
              <div
                className={`h-1.5 rounded-full transition-colors ${
                  index <= step ? "bg-[#E4405F]" : "bg-white/10"
                }`}
              />
              <div
                className={`text-[11.5px] mt-1.5 font-medium ${
                  index === step ? "text-white" : "text-white/30"
                }`}
              >
                {label}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* --- step 1: when ------------------------------------------------ */}
      {step === 0 && (
        <div className="space-y-6">
          <div>
            <Ask hint="A comment can be answered privately for seven days. A message can only be answered for 24 hours.">
              What starts it?
            </Ask>
            <div className="grid grid-cols-2 gap-3">
              <Choice
                on={draft.triggerType === "comment"}
                onClick={() => set({ triggerType: "comment" })}
                disabled={busy}
                icon={MessageCircle}
                title="A comment"
                sub="On a post or reel"
              />
              <Choice
                on={draft.triggerType === "dm"}
                onClick={() => set({ triggerType: "dm" })}
                disabled={busy}
                icon={AtSign}
                title="A direct message"
                sub="In your inbox"
              />
            </div>
          </div>

          <div>
            <Ask hint="Leave empty to answer everybody. Whole words only, so “hi” does not fire on “shipping”.">
              Which words?
            </Ask>
            <input
              value={draft.keywords}
              onChange={(event) => set({ keywords: event.target.value })}
              disabled={busy}
              placeholder="price, cost, how much"
              className={FIELD}
            />
          </div>

          {draft.triggerType === "comment" && (
            <div>
              <Ask hint="Leave it on every post unless this is for one campaign.">
                Which post?
              </Ask>

              {draft.mediaId ? (
                <div className="flex items-center gap-3 p-3 rounded-2xl border border-white/12 bg-white/4">
                  {draft.mediaThumbnailUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={draft.mediaThumbnailUrl}
                      alt=""
                      className="w-14 h-14 rounded-xl object-cover flex-shrink-0"
                    />
                  )}
                  <p className="min-w-0 flex-1 text-[13px] text-white/60 line-clamp-2 leading-relaxed">
                    {draft.mediaCaption || "This post"}
                  </p>
                  <button
                    type="button"
                    onClick={() => set({ mediaId: "", mediaThumbnailUrl: "", mediaCaption: "" })}
                    disabled={busy}
                    className="btn-quiet btn-compact text-xs"
                  >
                    Every post
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setPicking((open) => !open)}
                  disabled={busy || !accountId}
                  className="w-full flex items-center justify-center gap-2 p-3.5 rounded-2xl border-2 border-dashed border-white/15 text-[14px] text-white/55 hover:border-white/30 hover:text-white transition-colors disabled:opacity-50"
                >
                  <ImageIcon className="w-4 h-4" />
                  {accountId ? "Every post — pick just one instead" : "Connect an account first"}
                </button>
              )}

              {picking && (
                <div className="mt-3 p-3 rounded-2xl border border-white/12 bg-[var(--surface-2)]">
                  {mediaError ? (
                    <p className="text-[13px] text-[#F87171] leading-relaxed">{mediaError}</p>
                  ) : !media ? (
                    <div className="flex items-center gap-2 text-[13px] text-white/40 py-5 justify-center">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading your posts…
                    </div>
                  ) : media.length === 0 ? (
                    <p className="text-[13px] text-white/40 py-2">No posts on this account yet.</p>
                  ) : (
                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-56 overflow-y-auto">
                      {media.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            set({
                              mediaId: item.id,
                              mediaThumbnailUrl: item.thumbnailUrl ?? "",
                              mediaCaption: (item.caption ?? "").slice(0, 200),
                            });
                            setPicking(false);
                          }}
                          className="aspect-square rounded-xl overflow-hidden border-2 border-white/10 hover:border-[#E4405F] transition-colors bg-white/5"
                          title={item.caption ?? "Post"}
                        >
                          {item.thumbnailUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.thumbnailUrl}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="text-[10px] text-white/30">{item.mediaType}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div>
            <Ask hint="Only you see this.">Call it something</Ask>
            <input
              value={draft.name}
              onChange={(event) => set({ name: event.target.value })}
              disabled={busy}
              placeholder="Price enquiries"
              className={FIELD}
            />
          </div>
        </div>
      )}

      {/* --- step 2: what ------------------------------------------------ */}
      {step === 1 && (
        <div className="space-y-6">
          <div>
            <Ask hint="This arrives as a private message, even if they only commented.">
              What should they get?
            </Ask>
            <textarea
              value={draft.dmMessage}
              onChange={(event) => set({ dmMessage: event.target.value })}
              disabled={busy}
              rows={5}
              placeholder="Hey! Thanks for asking 💛 Here's everything 👇"
              className={FIELD}
            />
          </div>

          <div>
            <Ask hint={`Up to ${MAX_BUTTONS}. Every tap is counted.`}>Add a button</Ask>

            <div className="space-y-2.5">
              {buttons.map((button, index) => (
                <div key={index} className="flex gap-2 items-start">
                  <div className="flex-1 min-w-0 space-y-2">
                    <input
                      value={button.label}
                      onChange={(event) =>
                        setButtons((old) =>
                          old.map((item, i) =>
                            i === index ? { ...item, label: event.target.value } : item
                          )
                        )
                      }
                      disabled={busy}
                      maxLength={BUTTON_TITLE_LIMIT}
                      placeholder="See prices"
                      className={FIELD}
                    />
                    <div className="relative">
                      <Link2 className="w-4 h-4 text-white/25 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        value={button.url}
                        onChange={(event) =>
                          setButtons((old) =>
                            old.map((item, i) =>
                              i === index ? { ...item, url: event.target.value } : item
                            )
                          )
                        }
                        disabled={busy}
                        placeholder="https://neurachat.in/pricing"
                        className={`${FIELD} pl-10`}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setButtons((old) => old.filter((_, i) => i !== index))}
                    disabled={busy}
                    className="w-10 h-11 grid place-items-center rounded-xl text-white/30 hover:text-[#F87171] hover:bg-white/5 transition-colors"
                    aria-label="Remove this button"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            {buttons.length < MAX_BUTTONS && (
              <button
                type="button"
                onClick={() => setButtons((old) => [...old, { label: "", url: "" }])}
                disabled={busy}
                className="w-full mt-2.5 flex items-center justify-center gap-2 p-3 rounded-2xl border-2 border-dashed border-white/15 text-[13.5px] text-white/50 hover:border-white/30 hover:text-white transition-colors"
              >
                <Plus className="w-4 h-4" />
                {buttons.length === 0 ? "Add a button" : "Add another"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* --- step 3: extras ---------------------------------------------- */}
      {step === 2 && (
        <div className="space-y-4">
          <p className="text-[13px] text-white/40 leading-relaxed">
            All optional — turn it on now or leave it and come back.
          </p>

          <Toggle
            on={draft.followGate}
            onChange={(next) => set({ followGate: next })}
            disabled={busy}
            icon={UserPlus}
            title="Ask them to follow first"
            hint="They get a “follow and tap here” message. The real one goes out once Instagram confirms the follow."
          />
          {draft.followGate && (
            <textarea
              value={draft.followGateMessage}
              onChange={(event) => set({ followGateMessage: event.target.value })}
              disabled={busy}
              rows={2}
              placeholder={DEFAULT_FOLLOW_GATE}
              className={FIELD}
            />
          )}

          <Toggle
            on={draft.askEmail}
            onChange={(next) => set({ askEmail: next })}
            disabled={busy}
            icon={Gift}
            title="Ask for their email"
            hint="A follow-up asks for an address. Anything that looks like one in their reply is saved to the contact."
          />
          {draft.askEmail && (
            <textarea
              value={draft.askEmailMessage}
              onChange={(event) => set({ askEmailMessage: event.target.value })}
              disabled={busy}
              rows={2}
              placeholder={DEFAULT_EMAIL_PROMPT}
              className={FIELD}
            />
          )}

          {draft.triggerType === "comment" && (
            <div className="pt-1">
              <Ask hint="Public, under their comment. A thread of identical bot replies is what makes an account look automated — usually best left empty.">
                Reply publicly too?
              </Ask>
              <input
                value={draft.publicReply}
                onChange={(event) => set({ publicReply: event.target.value })}
                disabled={busy}
                placeholder="Just sent you a DM 💬"
                className={FIELD}
              />
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="text-sm text-[#F87171] mt-4" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
