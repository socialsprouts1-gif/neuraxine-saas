"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2, Mail, UserPlus, X } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import {
  changeTeammateRole,
  inviteTeammate,
  removeTeammate,
  revokeInvite,
} from "../team-actions";
import { INVITABLE_ROLES } from "@/lib/invites";
import type { OrgRole } from "@/types/database";

export interface TeamMember {
  userId: string;
  email: string | null;
  role: OrgRole;
  isSelf: boolean;
}

export interface PendingInvite {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
}

/**
 * Who is in the workspace, and how somebody else gets in.
 *
 * The invitation link is shown rather than emailed. There is no mail
 * sender wired up, and a feature that silently fails to deliver is worse
 * than one that hands you a link to paste into WhatsApp — which is where
 * most of these customers talk to their team anyway.
 */
export default function TeamPanel({
  members,
  invites,
  canManage,
  isOwner,
  seatsLeft,
  seatLimit,
}: {
  members: TeamMember[];
  invites: PendingInvite[];
  canManage: boolean;
  isOwner: boolean;
  /** Null when the plan has no seat limit. */
  seatsLeft: number | null;
  seatLimit: number | null;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("member");
  const [link, setLink] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const run = (work: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    startTransition(async () => {
      const result = await work();
      setNote({ ok: result.ok, text: result.error ?? result.message ?? "Done." });
      if (result.ok) router.refresh();
    });

  const full = seatsLeft !== null && seatsLeft <= 0;

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="font-semibold">Team</h2>
          {seatLimit !== null && (
            <Badge tone={full ? "amber" : "grey"}>
              {members.length + invites.length} of {seatLimit} seats
            </Badge>
          )}
        </div>
        <p className="text-sm text-white/50 mt-1">
          Everyone here shares the inbox. Conversations can be assigned to them, and their notes
          are attributed by name.
        </p>
      </div>

      <div className="space-y-2">
        {members.map((member) => (
          <div
            key={member.userId}
            className="flex flex-wrap items-center gap-3 bg-white/3 border border-white/8 rounded-xl px-4 py-3"
          >
            <span className="text-sm truncate min-w-0 flex-1">
              {member.email ?? (
                <span className="font-mono text-xs text-white/50">{member.userId}</span>
              )}
              {member.isSelf && <span className="text-white/30 text-xs ml-2">you</span>}
            </span>

            {isOwner && !member.isSelf ? (
              <select
                value={member.role}
                disabled={pending}
                aria-label={`Role for ${member.email ?? member.userId}`}
                onChange={(event) => {
                  const data = new FormData();
                  data.set("user_id", member.userId);
                  data.set("role", event.target.value);
                  run(() => changeTeammateRole(data));
                }}
                className="bg-white/5 border border-white/12 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-accent/50 disabled:opacity-50"
              >
                {(["owner", "admin", "member"] as const).map((value) => (
                  <option key={value} value={value} className="bg-[var(--surface-3)]">
                    {value}
                  </option>
                ))}
              </select>
            ) : (
              <Badge tone={member.role === "owner" ? "green" : member.role === "admin" ? "blue" : "grey"}>
                {member.role}
              </Badge>
            )}

            {canManage && !member.isSelf && (
              <button
                type="button"
                disabled={pending}
                aria-label={`Remove ${member.email ?? member.userId}`}
                onClick={() => {
                  const data = new FormData();
                  data.set("user_id", member.userId);
                  run(() => removeTeammate(data));
                }}
                className="p-1.5 rounded-lg text-white/30 hover:text-[#F87171] hover:bg-white/8 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      {invites.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-2">
            Invited, not joined yet
          </div>
          <div className="space-y-2">
            {invites.map((invite) => (
              <div
                key={invite.id}
                className="flex flex-wrap items-center gap-3 bg-white/2 border border-dashed border-white/12 rounded-xl px-4 py-3"
              >
                <Mail className="w-3.5 h-3.5 text-white/30 flex-shrink-0" />
                <span className="text-sm truncate min-w-0 flex-1">{invite.email}</span>
                <span className="text-[11px] text-white/35">
                  expires{" "}
                  {new Date(invite.expiresAt).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
                <Badge tone="grey">{invite.role}</Badge>
                {canManage && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      const data = new FormData();
                      data.set("id", invite.id);
                      run(() => revokeInvite(data));
                    }}
                    className="text-[11px] text-white/45 hover:text-[#F87171] transition-colors"
                  >
                    Cancel
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {canManage && (
        <div className="border-t border-white/8 pt-5">
          {full ? (
            <p className="text-sm text-white/50 leading-relaxed">
              Every seat on this plan is taken. Cancel an outstanding invitation, remove somebody,
              or move to a larger plan to add another person.
            </p>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="anita@example.com"
                  className="flex-1 min-w-0 bg-white/5 border border-white/12 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50"
                />
                <select
                  value={role}
                  onChange={(event) => setRole(event.target.value)}
                  aria-label="Role"
                  className="bg-white/5 border border-white/12 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-accent/50 sm:w-32"
                >
                  {INVITABLE_ROLES.map((value) => (
                    <option key={value} value={value} className="bg-[var(--surface-3)]">
                      {value}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={pending || !email.trim()}
                  onClick={() =>
                    startTransition(async () => {
                      const data = new FormData();
                      data.set("email", email);
                      data.set("role", role);
                      const result = await inviteTeammate(data);
                      setNote({
                        ok: result.ok,
                        text: result.error ?? result.message ?? "Done.",
                      });
                      if (result.ok) {
                        setLink(result.link ?? null);
                        setCopied(false);
                        setEmail("");
                        router.refresh();
                      }
                    })
                  }
                  className="btn-primary text-sm justify-center disabled:opacity-50"
                >
                  {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  Invite
                </button>
              </div>

              <p className="text-[11px] text-white/35 mt-2 leading-relaxed">
                An admin can manage the workspace and its team. A member can work the inbox but
                cannot change billing or invite anybody.
                {seatsLeft !== null && ` ${seatsLeft} seat${seatsLeft === 1 ? "" : "s"} left.`}
              </p>
            </>
          )}

          {link && (
            <div className="mt-4 rounded-xl border border-accent/25 bg-accent/6 p-3.5">
              <p className="text-xs text-white/60 leading-relaxed mb-2">
                Send them this link. It works for seven days, once, and only for the address it was
                sent to.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <code className="flex-1 min-w-0 text-[11px] text-accent-ink bg-black/30 rounded-lg px-3 py-2 break-all">
                  {link}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(link).then(() => setCopied(true));
                  }}
                  className="btn-secondary text-xs justify-center flex-shrink-0"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {note && (
        <p
          className={`text-sm ${note.ok ? "text-accent-ink" : "text-[#F87171]"} leading-relaxed`}
          role="status"
        >
          {note.text}
        </p>
      )}
    </div>
  );
}
