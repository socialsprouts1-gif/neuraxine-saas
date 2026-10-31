"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Check, Loader2, Plus, X } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { Badge } from "@/components/ui/primitives";
import {
  BUTTON_TITLE_LIMIT,
  buttonProblem,
  DEFAULT_EMAIL_PROMPT,
  DEFAULT_FOLLOW_GATE,
  MAX_BUTTONS,
  ruleProblem,
  type AutomationButton,
} from "@/lib/instagram";
import { recentMedia, saveCommentRule } from "../instagram-actions";
import type { MediaItem } from "@/lib/instagram-api";

// One automation, written as a sentence.
//
// The order is the order somebody thinks in — when does this fire, what
// does it watch for, what does it send — rather than the order the
// columns happen to sit in. Everything optional is below everything
// required, and the switches explain their cost rather than just their
// name: a follow gate that nobody understands is a gate that loses you
// the message.

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
  "w-full bg-white/5 border border-white/12 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50 transition-colors disabled:opacity-60";

function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <span className="block mb-1.5">
      <span className="block text-xs font-medium text-white/70">{children}</span>
      {hint && (
        <span className="block text-[12px] text-white/35 mt-0.5 leading-relaxed">{hint}</span>
      )}
    </span>
  );
}

function Switch({
  on,
  onChange,
  title,
  hint,
  disabled,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  title: string;
  hint: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      disabled={disabled}
      className={`w-full text-left flex items-start gap-3 p-3.5 rounded-xl border transition-colors disabled:opacity-50 ${
        on ? "border-accent/35 bg-accent/8" : "border-white/10 bg-white/4 hover:border-white/20"
      }`}
    >
      <span
        className={`mt-0.5 w-9 h-5 rounded-full flex-shrink-0 relative transition-colors ${
          on ? "bg-accent" : "bg-white/15"
        }`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
            on ? "left-[18px]" : "left-0.5"
          }`}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-[12px] text-white/40 mt-0.5 leading-relaxed">{hint}</span>
      </span>
    </button>
  );
}

export default function AutomationEditor({
  rule,
  accountId,
  appUrl,
  onClose,
}: {
  rule?: AutomationRow;
  /**
   * The connected account to ask for posts. Not the same thing as the
   * automation's own connection: the picker needs an account to query,
   * while the automation stays unpinned so it covers every account the
   * workspace connects later.
   */
  accountId: string | null;
  appUrl: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState({
    triggerType: (rule?.trigger_type === "dm" ? "dm" : "comment") as "comment" | "dm",
    name: rule?.name ?? "",
    keywords: rule?.keywords.join(", ") ?? "",
    mediaId: rule?.media_id ?? "",
    mediaThumbnailUrl: rule?.media_thumbnail_url ?? "",
    mediaCaption: rule?.media_caption ?? "",
    dmMessage: rule?.dm_message ?? "",
    publicReply: rule?.public_reply ?? "",
    followGate: rule?.follow_gate ?? false,
    followGateMessage: rule?.follow_gate_message ?? "",
    askEmail: rule?.ask_email ?? false,
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

  const problem = draft.followGate
    ? draft.name.trim()
      ? null
      : "Give the automation a name so you can find it again."
    : ruleProblem({
        name: draft.name,
        dmMessage: draft.dmMessage,
        publicReply: draft.publicReply,
      });
  const buttonIssue = buttonProblem(buttons.filter((b) => b.label || b.url));
  const blocked = problem ?? buttonIssue;

  const save = async () => {
    if (blocked) return setError(blocked);
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
      buttons: buttons.filter((button) => button.label || button.url),
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

  return (
    <Modal
      open
      onClose={onClose}
      title={rule ? "Edit automation" : "New automation"}
      description="Instagram lets you answer a comment privately for seven days afterwards, so the person does not have to have messaged you first. That is what makes this worth having."
      size="xl"
      dismissable={!busy}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="btn-quiet text-sm disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy || Boolean(blocked)}
            className="btn-primary text-sm disabled:opacity-50"
          >
            {busy ? "Saving…" : rule ? "Save changes" : "Create automation"}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {/* --- when --- */}
        <div>
          <Label hint="A comment can be answered privately for seven days. A direct message can only be answered for 24 hours.">
            When this fires
          </Label>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { key: "comment", title: "Somebody comments", sub: "on a post or reel" },
                { key: "dm", title: "Somebody messages", sub: "in the DMs" },
              ] as const
            ).map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => set({ triggerType: option.key })}
                disabled={busy}
                className={`text-left p-3.5 rounded-xl border transition-colors disabled:opacity-50 ${
                  draft.triggerType === option.key
                    ? "border-accent/40 bg-accent/10"
                    : "border-white/10 bg-white/4 hover:border-white/20"
                }`}
              >
                <span className="block text-sm font-medium">{option.title}</span>
                <span className="block text-[12px] text-white/40 mt-0.5">{option.sub}</span>
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <Label>Name — only you see this</Label>
          <input
            value={draft.name}
            onChange={(event) => set({ name: event.target.value })}
            disabled={busy}
            placeholder="Price enquiries"
            className={FIELD}
          />
        </label>

        <label className="block">
          <Label hint="Comma separated. Matched on whole words, so “hi” does not fire on “shipping”. Leave empty to answer everybody.">
            Words to watch for
          </Label>
          <input
            value={draft.keywords}
            onChange={(event) => set({ keywords: event.target.value })}
            disabled={busy}
            placeholder="price, cost, how much"
            className={FIELD}
          />
        </label>

        {/* --- which post --- */}
        {draft.triggerType === "comment" && (
          <div>
            <Label hint="Leave this alone and the automation watches every post.">
              Which post
            </Label>

            {draft.mediaId ? (
              <div className="flex items-center gap-3 p-3 rounded-xl border border-white/12 bg-white/4">
                {draft.mediaThumbnailUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={draft.mediaThumbnailUrl}
                    alt=""
                    className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] text-white/70 line-clamp-2 leading-relaxed">
                    {draft.mediaCaption || "This post"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => set({ mediaId: "", mediaThumbnailUrl: "", mediaCaption: "" })}
                  disabled={busy}
                  className="btn-quiet btn-compact text-xs"
                >
                  Any post
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setPicking(true)}
                disabled={busy || !accountId}
                className="btn-quiet text-sm w-full justify-center disabled:opacity-50"
              >
                {accountId ? "Choose a post" : "Connect an account to choose a post"}
              </button>
            )}

            {picking && (
              <div className="mt-3 p-3 rounded-xl border border-white/12 bg-[var(--surface-2)]">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-white/70">Recent posts</span>
                  <button
                    type="button"
                    onClick={() => setPicking(false)}
                    className="text-white/40 hover:text-white transition-colors"
                    aria-label="Close the picker"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {mediaError ? (
                  <p className="text-[12.5px] text-[#F87171] leading-relaxed">{mediaError}</p>
                ) : !media ? (
                  <div className="flex items-center gap-2 text-[12.5px] text-white/40 py-4 justify-center">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Asking Instagram…
                  </div>
                ) : media.length === 0 ? (
                  <p className="text-[12.5px] text-white/40">
                    This account has no posts yet.
                  </p>
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
                        className="aspect-square rounded-lg overflow-hidden border border-white/10 hover:border-accent/50 transition-colors bg-white/5"
                        title={item.caption ?? item.mediaType ?? "Post"}
                      >
                        {item.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.thumbnailUrl} alt="" className="w-full h-full object-cover" />
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

        {/* --- the message --- */}
        <label className="block">
          <Label hint="Sent privately, as a DM. This is the one that matters.">
            Send them this
          </Label>
          <textarea
            value={draft.dmMessage}
            onChange={(event) => set({ dmMessage: event.target.value })}
            disabled={busy}
            rows={4}
            placeholder="Hi! Here's the price list 👇"
            className={FIELD}
          />
        </label>

        {/* --- buttons --- */}
        <div>
          <Label hint={`Up to ${MAX_BUTTONS}. Every tap is counted, because the link goes through this app before Instagram's browser opens it.`}>
            Buttons on the message
          </Label>

          <div className="space-y-2">
            {buttons.map((button, index) => (
              <div key={index} className="flex gap-2">
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
                  className={`${FIELD} flex-1 min-w-0`}
                />
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
                  className={`${FIELD} flex-[2] min-w-0`}
                />
                <button
                  type="button"
                  onClick={() => setButtons((old) => old.filter((_, i) => i !== index))}
                  disabled={busy}
                  className="text-white/30 hover:text-red-400 transition-colors px-1"
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
              className="btn-quiet btn-compact text-xs mt-2"
            >
              <Plus className="w-3.5 h-3.5" />
              Add a button
            </button>
          )}
        </div>

        {/* --- the optional extras --- */}
        <div className="space-y-2.5">
          <Switch
            on={draft.followGate}
            onChange={(next) => set({ followGate: next })}
            disabled={busy}
            title="Ask them to follow first"
            hint="Sends a “follow and tap here” message instead. The real message goes out once they tap, and only if Instagram confirms the follow."
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

          <Switch
            on={draft.askEmail}
            onChange={(next) => set({ askEmail: next })}
            disabled={busy}
            title="Ask for their email afterwards"
            hint="Sends a follow-up asking for an address. Anything that looks like one in their reply is saved to the contact."
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
        </div>

        {draft.triggerType === "comment" && (
          <label className="block">
            <Label hint="Optional, and public. A thread of identical bot replies is what makes an account look automated — usually best left empty.">
              Reply under the comment
            </Label>
            <input
              value={draft.publicReply}
              onChange={(event) => set({ publicReply: event.target.value })}
              disabled={busy}
              placeholder="Just sent you a DM 💬"
              className={FIELD}
            />
          </label>
        )}

        {/* --- what is wrong, while typing --- */}
        {blocked ? (
          <div className="flex items-start gap-2.5">
            <Badge tone="amber">not ready</Badge>
            <p className="text-xs text-white/60 leading-relaxed">{blocked}</p>
          </div>
        ) : (
          <div className="flex items-start gap-2.5">
            <Check className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
            <p className="text-xs text-white/40 leading-relaxed">
              Ready. Tracked links will point at {appUrl.replace(/^https?:\/\//, "")}/l/… and
              forward to wherever you sent them.
            </p>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
