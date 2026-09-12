"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, ShieldOff, ShieldCheck, Trash2, UserMinus } from "lucide-react";
import {
  createUserAccount,
  deleteUserAccount,
  removeMembership,
  setMemberRole,
  setUserSuspended,
} from "../actions";
import { ORG_ROLES, type OrgRole } from "@/types/database";

/** Creating an account by hand, for someone who cannot sign up themselves. */
export function NewUserButton({ orgs }: { orgs: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-primary text-sm">
        <Plus className="w-4 h-4" />
        New user
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm overflow-y-auto p-4 md:p-8"
      role="dialog"
      aria-modal="true"
      aria-label="Create a user"
      onClick={(event) => {
        if (event.target === event.currentTarget && !pending) setOpen(false);
      }}
    >
      <form
        className="glass-card w-full max-w-lg mx-auto p-6"
        action={(data) =>
          startTransition(async () => {
            const result = await createUserAccount(data);
            setNote({ ok: result.ok, text: result.message ?? result.error ?? "" });
            if (result.ok) router.refresh();
          })
        }
      >
        <h3 className="text-lg font-semibold mb-1">Create a user</h3>
        <p className="text-xs text-white/45 mb-5 leading-relaxed">
          The account is confirmed straight away — no verification email is sent, so you have to
          pass the password on yourself.
        </p>

        <div className="space-y-4">
          <Field label="Email" name="email" type="email" required placeholder="person@company.com" />
          <Field
            label="Password"
            name="password"
            type="password"
            required
            placeholder="At least 8 characters"
            hint="They can change it after signing in."
          />

          <label className="block">
            <span className="block text-xs font-medium text-white/70 mb-1.5">
              Add to organization
            </span>
            <select name="org_id" defaultValue="" className={INPUT}>
              <option value="" className="bg-[var(--surface-3)]">
                Just their own new workspace
              </option>
              {orgs.map((org) => (
                <option key={org.id} value={org.id} className="bg-[var(--surface-3)]">
                  {org.name}
                </option>
              ))}
            </select>
            <span className="block text-[11px] text-white/35 mt-1">
              Everyone gets a workspace of their own on signup. Pick one here to put them in an
              existing team as well.
            </span>
          </label>

          <label className="block">
            <span className="block text-xs font-medium text-white/70 mb-1.5">Role in that organization</span>
            <select name="role" defaultValue="member" className={INPUT}>
              {["member", "admin", "owner"].map((role) => (
                <option key={role} value={role} className="bg-[var(--surface-3)]">
                  {role}
                </option>
              ))}
            </select>
          </label>
        </div>

        {note && (
          <p className={`text-xs mt-4 ${note.ok ? "text-accent-ink" : "text-[#F87171]"}`}>
            {note.text}
          </p>
        )}

        <div className="flex items-center gap-3 mt-6">
          <button type="submit" disabled={pending} className="btn-primary text-sm">
            {pending && <Loader2 className="w-4 h-4 animate-spin" />}
            Create account
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-sm text-white/45 hover:text-white"
          >
            Close
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * Suspend, remove from an organization, or delete outright.
 *
 * Three different severities, so three different affordances. Suspension is
 * one click because it is reversible; the two that destroy something ask
 * first. None of them appear on your own row — locking yourself out of the
 * platform has no in-product way back.
 */
export function UserRowActions({
  userId,
  orgId,
  email,
  suspended,
  isSelf,
  role,
}: {
  userId: string;
  orgId: string;
  email: string;
  suspended: boolean;
  isSelf: boolean;
  /** Their role in this organization, for the dropdown. */
  role: OrgRole;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<"remove" | "delete" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();


  const run = (action: (data: FormData) => Promise<{ ok: boolean; error?: string; message?: string }>, data: FormData) =>
    startTransition(async () => {
      const result = await action(data);
      setNote(result.ok ? null : (result.error ?? "That didn't work."));
      setConfirming(null);
      router.refresh();
    });

  if (confirming) {
    const isDelete = confirming === "delete";
    return (
      <div className="flex flex-col items-end gap-1.5">
        <p className="text-[11px] text-white/55 max-w-[15rem] text-right leading-snug">
          {isDelete
            ? `Delete ${email}? Their account and every membership go with it. This cannot be undone.`
            : `Remove ${email} from this organization? Their account stays.`}
        </p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              const data = new FormData();
              data.set("user_id", userId);
              if (!isDelete) data.set("org_id", orgId);
              run(isDelete ? deleteUserAccount : removeMembership, data);
            }}
            className="text-[11px] px-2 py-1 rounded-lg bg-[#F87171]/12 text-[#F87171] border border-[#F87171]/25"
          >
            {pending ? "Working…" : isDelete ? "Delete account" : "Remove"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(null)}
            className="text-[11px] px-2 py-1 text-white/45 hover:text-white"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        {/* Role is editable even on your own row: changing what somebody
            can do inside one workspace is not the same as being able to
            lock yourself out of the platform, which the actions below are.
            The server refuses to demote a workspace's last owner. */}
        <select
          value={role}
          disabled={pending}
          aria-label={`Role for ${email}`}
          onChange={(event) => {
            const data = new FormData();
            data.set("user_id", userId);
            data.set("org_id", orgId);
            data.set("role", event.target.value);
            run(setMemberRole, data);
          }}
          className="bg-white/5 border border-white/12 rounded-lg px-2 py-1 text-[11px] text-white focus:outline-none focus:border-[#A855F7]/50 disabled:opacity-50"
        >
          {ORG_ROLES.map((value) => (
            <option key={value} value={value} className="bg-[var(--surface-3)]">
              {value}
            </option>
          ))}
        </select>

        {isSelf ? (
          <span className="text-[11px] text-white/25 pl-1">That&apos;s you</span>
        ) : (
        <>
        <button
          type="button"
          disabled={pending}
          title={suspended ? "Let them sign in again" : "Block sign-in"}
          aria-label={suspended ? `Restore ${email}` : `Suspend ${email}`}
          onClick={() => {
            const data = new FormData();
            data.set("user_id", userId);
            data.set("suspend", suspended ? "false" : "true");
            run(setUserSuspended, data);
          }}
          className={`p-1.5 rounded-lg transition-colors hover:bg-white/8 ${
            suspended ? "text-[#FACC15]" : "text-white/30 hover:text-[#FACC15]"
          }`}
        >
          {pending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : suspended ? (
            <ShieldCheck className="w-3.5 h-3.5" />
          ) : (
            <ShieldOff className="w-3.5 h-3.5" />
          )}
        </button>

        <button
          type="button"
          title="Remove from this organization"
          aria-label={`Remove ${email} from this organization`}
          onClick={() => setConfirming("remove")}
          className="p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/8 transition-colors"
        >
          <UserMinus className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          title="Delete this account"
          aria-label={`Delete ${email}`}
          onClick={() => setConfirming("delete")}
          className="p-1.5 rounded-lg text-white/30 hover:text-[#F87171] hover:bg-white/8 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
        </>
        )}
      </div>
      {note && <span className="text-[11px] text-[#F87171] max-w-[15rem] text-right">{note}</span>}
    </div>
  );
}

const INPUT =
  "w-full bg-white/5 border border-white/12 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50 transition-all";

function Field({
  label,
  name,
  type = "text",
  placeholder,
  required = false,
  hint,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-white/70 mb-1.5">{label}</span>
      <input type={type} name={name} required={required} placeholder={placeholder} className={INPUT} />
      {hint && <span className="block text-[11px] text-white/35 mt-1">{hint}</span>}
    </label>
  );
}
