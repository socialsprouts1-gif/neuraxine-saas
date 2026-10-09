"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Pause, Play, Plus, Trash2, UserPlus } from "lucide-react";
import DripBuilder, {
  emptyDraft,
  type DripDraft,
  type NumberChoice,
  type TemplateChoice,
} from "./DripBuilder";
import { deleteDrip, enrolInDrip, setDripStatus } from "../drip-actions";
import Modal from "@/components/ui/Modal";

// The buttons on the sequences screen.
//
// A client island on an otherwise server-rendered page, which is why the
// list itself is not in here: the page reads the rows, these move them.

export function NewDripButton({
  templates,
  numbers,
}: {
  templates: TemplateChoice[];
  numbers: NumberChoice[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-primary text-sm">
        <Plus className="w-4 h-4" />
        New sequence
      </button>
      {open && (
        <DripBuilder
          draft={emptyDraft()}
          templates={templates}
          numbers={numbers}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

export function EditDripButton({
  draft,
  templates,
  numbers,
}: {
  draft: DripDraft;
  templates: TemplateChoice[];
  numbers: NumberChoice[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-accent-ink hover:underline"
      >
        Edit
      </button>
      {open && (
        <DripBuilder
          draft={draft}
          templates={templates}
          numbers={numbers}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

export function DripStatusButton({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const running = status === "active";

  const flip = async () => {
    setBusy(true);
    const result = await setDripStatus(id, running ? "paused" : "active").catch(() => ({
      ok: false,
      error: "That could not be changed just now.",
      message: undefined,
    }));
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error ?? "That could not be changed.");
      return;
    }
    toast.success(result.message ?? "Saved.");
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={() => void flip()}
      disabled={busy || status === "archived"}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-white/60 hover:text-white disabled:opacity-40 transition-colors"
    >
      {running ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
      {running ? "Pause" : "Switch on"}
    </button>
  );
}

export function DeleteDripButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    // Everybody's place in the sequence goes with it, which is not
    // recoverable — so it is said out loud rather than discovered.
    if (!window.confirm(`Delete "${name}"? Everybody's place in it goes too.`)) return;
    setBusy(true);
    const result = await deleteDrip(id).catch(() => ({
      ok: false,
      error: "That could not be deleted just now.",
      message: undefined,
    }));
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error ?? "That could not be deleted.");
      return;
    }
    toast.success(result.message ?? "Deleted.");
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={() => void remove()}
      disabled={busy}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-white/40 hover:text-red-400 disabled:opacity-40 transition-colors"
    >
      <Trash2 className="w-3.5 h-3.5" />
      Delete
    </button>
  );
}

export function EnrolButton({ id }: { id: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [numbers, setNumbers] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    const list = numbers
      .split(/[\s,;\n]+/)
      .map((value) => value.trim())
      .filter(Boolean);

    if (list.length === 0) {
      toast.error("Paste at least one number.");
      return;
    }

    setBusy(true);
    const result = await enrolInDrip(id, list).catch(() => ({
      ok: false,
      error: "They could not be added just now.",
      message: undefined,
    }));
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error ?? "They could not be added.");
      return;
    }
    toast.success(result.message ?? "Added.");
    setNumbers("");
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-accent-ink hover:underline"
      >
        <UserPlus className="w-3.5 h-3.5" />
        Add people
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add people to this sequence"
        description="One number per line, or separated by commas. Step one goes out within the minute. Anybody already in it stays exactly where they are."
        size="sm"
        dismissable={!busy}
        footer={
          <>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={busy}
              className="px-4 py-2.5 rounded-xl border border-white/12 text-sm text-white/65 hover:text-white transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void add()}
              disabled={busy}
              className="btn-primary text-sm disabled:opacity-50"
            >
              {busy ? "Adding…" : "Add"}
            </button>
          </>
        }
      >
        <textarea
          value={numbers}
          onChange={(e) => setNumbers(e.target.value)}
          placeholder={"+91 98765 43210\n+91 91234 56789"}
          className="w-full min-h-[140px] bg-white/5 border border-white/12 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50"
        />
      </Modal>
    </>
  );
}
