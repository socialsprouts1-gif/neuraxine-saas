"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireFeature } from "@/lib/org";
import {
  buttonProblem,
  linkId,
  ruleProblem,
  trackedUrl,
  type AutomationButton,
} from "@/lib/instagram";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptToken } from "@/lib/crypto";
import { listMedia, type MediaItem } from "@/lib/instagram-api";
import type { ActionResult } from "@/app/(dashboard)/actions";

// Everything that changes a comment rule goes through requireFeature,
// which resolves the workspace from the session rather than trusting an
// org id from the browser — these rules decide who gets messaged, so a
// workspace being able to write another's would be the whole game.

export interface RuleInput {
  id?: string;
  name: string;
  triggerType: "comment" | "dm";
  keywords: string;
  mediaId: string;
  mediaThumbnailUrl?: string | null;
  mediaCaption?: string | null;
  dmMessage: string;
  publicReply: string;
  buttons: AutomationButton[];
  followGate: boolean;
  followGateMessage: string;
  askEmail: boolean;
  askEmailMessage: string;
  connectionId: string | null;
}

/**
 * Keywords as typed, split into a list.
 *
 * Comma or newline, because people type both and insisting on one is a
 * form that silently makes a single keyword out of "price, cost, rate".
 */
function keywordList(raw: string): string[] {
  return [...new Set(raw.split(/[,\n]/).map((word) => word.trim()).filter(Boolean))];
}

export async function saveCommentRule(input: RuleInput): Promise<ActionResult> {
  const { orgId } = await requireFeature("instagram");

  const draft = {
    name: input.name.trim(),
    dmMessage: input.dmMessage.trim() || null,
    publicReply: input.publicReply.trim() || null,
  };

  const buttons = input.buttons
    .map((button) => ({ label: button.label.trim(), url: button.url.trim() }))
    .filter((button) => button.label || button.url);

  // A gate sends its own message, so it is allowed to have none of its
  // own — otherwise a gated automation has to repeat itself.
  const problem = input.followGate
    ? input.name.trim()
      ? null
      : "Give the automation a name so you can find it again."
    : ruleProblem(draft);
  if (problem) return { ok: false, error: problem };

  const buttonIssue = buttonProblem(buttons);
  if (buttonIssue) return { ok: false, error: buttonIssue };

  const supabase = await createClient();
  // updated_at is insert-only by default and settable on update, so the
  // two payloads differ by that one field rather than being spread.
  // Each button's link is swapped for one that passes through this app
  // first. Instagram reports nothing when a web link is tapped, so a
  // counted click can only exist if the click comes here on its way.
  const tracked = await trackLinks(orgId, input.id ?? null, buttons);

  const fields = {
    name: draft.name,
    trigger_type: input.triggerType,
    keywords: keywordList(input.keywords),
    media_id: input.mediaId.trim() || null,
    media_thumbnail_url: input.mediaThumbnailUrl?.trim() || null,
    media_caption: input.mediaCaption?.trim() || null,
    dm_message: draft.dmMessage,
    public_reply: draft.publicReply,
    buttons: tracked,
    follow_gate: input.followGate,
    follow_gate_message: input.followGateMessage.trim() || null,
    ask_email: input.askEmail,
    ask_email_message: input.askEmailMessage.trim() || null,
    connection_id: input.connectionId,
  };

  const { error } = input.id
    ? await supabase
        .from("instagram_comment_rules")
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq("id", input.id)
        .eq("org_id", orgId)
    : await supabase.from("instagram_comment_rules").insert({ ...fields, org_id: orgId });

  if (error) {
    if (error.code === "42P01") {
      return {
        ok: false,
        error:
          "The Instagram tables do not exist yet. Run supabase/updates/run-me-latest.sql in the SQL editor.",
      };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/instagram");
  return { ok: true, message: input.id ? "Saved." : `"${draft.name}" is live.` };
}

export async function setCommentRuleActive(
  id: string,
  active: boolean
): Promise<ActionResult> {
  const { orgId } = await requireFeature("instagram");

  const supabase = await createClient();
  const { error } = await supabase
    .from("instagram_comment_rules")
    .update({ is_active: active, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", orgId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/instagram");
  return { ok: true, message: active ? "Switched on." : "Switched off." };
}

export async function deleteCommentRule(id: string): Promise<ActionResult> {
  const { orgId } = await requireFeature("instagram");

  const supabase = await createClient();
  const { error } = await supabase
    .from("instagram_comment_rules")
    .delete()
    .eq("id", id)
    .eq("org_id", orgId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/instagram");
  return { ok: true, message: "Deleted. Comments it would have answered are left alone." };
}


/**
 * Swaps each button's link for a tracked one.
 *
 * The original is kept on the link row and the automation carries the
 * short form, so the message a stranger receives never exposes an
 * internal id and the count has somewhere to land.
 *
 * Re-saving an automation mints fresh ids rather than reusing the old
 * ones. That loses nothing — the per-link totals roll up into the
 * automation's own counter, which is the number anyone reads — and it
 * avoids a link that outlives the URL it used to point at.
 */
async function trackLinks(
  orgId: string,
  ruleId: string | null,
  buttons: AutomationButton[]
): Promise<AutomationButton[]> {
  if (buttons.length === 0) return [];

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://neurachat.in";
  const admin = createAdminClient();
  const out: AutomationButton[] = [];

  for (const button of buttons) {
    // Already tracked, from a previous save. Rewriting it would point
    // the new link at the old link.
    if (button.url.startsWith(`${appUrl.replace(/\/+$/, "")}/l/`)) {
      out.push(button);
      continue;
    }

    const id = linkId();
    const { error } = await admin.from("instagram_links").insert({
      id,
      org_id: orgId,
      rule_id: ruleId,
      label: button.label,
      target_url: button.url,
    });

    // A link that could not be stored would redirect nowhere, so the
    // real URL goes out untracked instead. A missing count beats a
    // broken button.
    out.push(error ? button : { label: button.label, url: trackedUrl(appUrl, id) });
  }

  return out;
}

/**
 * The account's recent posts, for choosing one by sight.
 */
export async function recentMedia(
  connectionId: string
): Promise<{ ok: true; media: MediaItem[] } | { ok: false; error: string }> {
  const { orgId } = await requireFeature("instagram");

  const admin = createAdminClient();
  const { data: connection } = await admin
    .from("instagram_connections")
    .select("ig_user_id, access_token_encrypted")
    .eq("id", connectionId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!connection) return { ok: false, error: "That account is not connected." };

  return listMedia({
    igUserId: connection.ig_user_id,
    token: decryptToken(connection.access_token_encrypted),
  });
}
