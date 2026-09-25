"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";

export interface PickableContact {
  id: string;
  name: string | null;
  wa_id: string;
}

/**
 * Choosing people out of a list that may be five hundred long.
 *
 * The previous version was a scrolling box of every contact not already
 * in the group, which works at twenty and is unusable at five hundred —
 * and five hundred is the case a business actually has. A search box and
 * a running count of what is ticked is the whole difference.
 */
export default function ContactPicker({ contacts }: { contacts: readonly PickableContact[] }) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    // Digits only on the number side, so "98765 43210" finds 919876543210.
    const digits = needle.replace(/\D/g, "");

    const matches = needle
      ? contacts.filter(
          (contact) =>
            (contact.name ?? "").toLowerCase().includes(needle) ||
            (digits.length > 0 && contact.wa_id.includes(digits))
        )
      : contacts;

    // Capped so a workspace with thousands does not render thousands of
    // rows into a 16rem box. Searching narrows it; that is what it is for.
    return matches.slice(0, 200);
  }, [contacts, query]);

  const toggle = (id: string) => {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div>
      <div className="relative mb-2.5">
        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name or number"
          className="w-full bg-white/5 border border-white/12 rounded-lg pl-8 pr-3 py-2 text-xs text-white placeholder:text-white/25 focus:outline-none focus:border-[#A855F7]/50"
        />
      </div>

      <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
        {shown.length === 0 ? (
          <p className="text-xs text-white/40 py-3">Nobody matches “{query}”.</p>
        ) : (
          shown.map((contact) => (
            <label
              key={contact.id}
              className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/5 cursor-pointer"
            >
              <input
                type="checkbox"
                name="contact_ids"
                value={contact.id}
                checked={picked.has(contact.id)}
                onChange={() => toggle(contact.id)}
                className="accent-[var(--accent)] w-4 h-4"
              />
              <span className="text-xs min-w-0 flex-1 truncate">
                {contact.name || contact.wa_id}
                <span className="block text-[10px] text-white/30 tabular-nums">
                  {contact.wa_id}
                </span>
              </span>
            </label>
          ))
        )}
      </div>

      <p className="text-[11px] text-white/35 mt-2">
        {picked.size > 0
          ? `${picked.size} selected.`
          : contacts.length > shown.length
            ? `Showing ${shown.length} of ${contacts.length} — search to narrow it.`
            : `${contacts.length} not in this group yet.`}
      </p>
    </div>
  );
}
