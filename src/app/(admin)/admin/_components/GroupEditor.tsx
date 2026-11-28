"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Trash2, Users } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { deleteEmailGroup, saveEmailGroup, setEmailGroupMembers } from "../actions";

// Who is in a group.
//
// The whole membership is posted every time rather than one add and one
// remove, because the screen is a set of tickboxes showing the current
// state — so what it posts is the answer. Sending diffs from a form that
// shows the whole set is how an unticked box ends up being silently
// ignored.

export interface GroupRow {
  id: string;
  name: string;
  description: string | null;
  memberIds: string[];
}

export default function GroupEditor({
  group,
  workspaces,
}: {
  group: GroupRow;
  workspaces: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(group.name);
  const [picked, setPicked] = useState<Set<string>>(new Set(group.memberIds));
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const term = query.trim().toLowerCase();
  const shown = term
    ? workspaces.filter((row) => row.name.toLowerCase().includes(term))
    : workspaces;

  const toggle = (id: string) =>
    setPicked((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = async () => {
    setBusy(true);
    setError(null);

    if (name.trim() && name.trim() !== group.name) {
      const rename = new FormData();
      rename.set("id", group.id);
      rename.set("name", name.trim());
      const renamed = await saveEmailGroup(rename).catch(() => ({
        ok: false as const,
        error: "That could not be renamed.",
      }));
      if (!renamed.ok) {
        setBusy(false);
        setError(renamed.error ?? "That could not be renamed.");
        return;
      }
    }

    const data = new FormData();
    data.set("group_id", group.id);
    for (const id of picked) data.append("org", id);

    const result = await setEmailGroupMembers(data).catch(() => ({
      ok: false as const,
      error: "That could not be saved just now.",
    }));
    setBusy(false);

    if (!result.ok) {
      setError(result.error ?? "That could not be saved.");
      return;
    }
    setOpen(false);
    router.refresh();
  };

  const remove = async () => {
    if (!window.confirm(`Delete the group "${group.name}"? No workspace is changed.`)) return;
    setBusy(true);
    const data = new FormData();
    data.set("id", group.id);
    const result = await deleteEmailGroup(data).catch(() => ({
      ok: false as const,
      error: "That could not be deleted.",
    }));
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "That could not be deleted.");
      return;
    }
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-quiet btn-compact text-xs">
        <Users className="w-3.5 h-3.5" />
        {group.memberIds.length} in it
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Who is in ${group.name}`}
        description="Tick a workspace to include it. The message goes to that workspace's owner."
        size="lg"
        dismissable={!busy}
        footer={
          <>
            <button
              type="button"
              onClick={() => void remove()}
              disabled={busy}
              className="btn-danger btn-compact text-xs mr-auto"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete group
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={busy}
              className="btn-quiet text-sm disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy}
              className="btn-primary text-sm disabled:opacity-50"
            >
              {busy ? "Saving…" : `Save ${picked.size}`}
            </button>
          </>
        }
      >
        <label className="block mb-3">
          <span className="block text-xs font-medium text-white/70 mb-1.5">Group name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={busy}
            className="w-full bg-white/5 border border-white/12 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-accent/50"
          />
        </label>

        <div className="relative mb-3">
          <Search className="w-4 h-4 text-white/30 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a workspace"
            className="w-full bg-white/5 border border-white/12 rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50"
          />
        </div>

        <div className="max-h-[340px] overflow-y-auto rounded-xl border border-white/8 divide-y divide-white/5">
          {shown.length === 0 ? (
            <p className="px-3.5 py-6 text-sm text-white/35 text-center">Nothing matches that.</p>
          ) : (
            shown.map((row) => (
              <label
                key={row.id}
                className="flex items-center gap-3 px-3.5 py-2.5 cursor-pointer hover:bg-white/3 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={picked.has(row.id)}
                  onChange={() => toggle(row.id)}
                  disabled={busy}
                  className="accent-[var(--accent)] w-4 h-4 flex-shrink-0"
                />
                <span className="text-sm truncate">{row.name}</span>
              </label>
            ))
          )}
        </div>

        {error && (
          <p className="text-sm text-red-400 mt-3" role="alert">
            {error}
          </p>
        )}
      </Modal>
    </>
  );
}
