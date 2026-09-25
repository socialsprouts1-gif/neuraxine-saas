"use client";

import { useState } from "react";
import { GROUP_ICONS, initials, withAlpha } from "@/lib/group-identity";

/**
 * Sixteen emoji and a box to type another.
 *
 * A full emoji keyboard was the obvious thing and the wrong one: most
 * emoji are unreadable at 20px on a dark tile, and picking from a grid of
 * a thousand is slower than picking from a grid of sixteen. Anything not
 * offered can still be pasted into the box.
 *
 * Writes to a hidden input so the surrounding ActionForm submits it with
 * everything else — no separate save, no second round trip.
 */
export default function IconPicker({
  name = "icon",
  defaultValue,
  colour,
  groupName,
}: {
  name?: string;
  defaultValue?: string | null;
  colour: string;
  groupName: string;
}) {
  const [icon, setIcon] = useState(defaultValue ?? "");

  return (
    <div>
      <span className="block text-xs font-medium text-white/70 mb-1.5">Icon</span>

      <input type="hidden" name={name} value={icon} />

      <div className="flex flex-wrap gap-1.5 mb-2.5">
        {/* "None" first, so clearing is a click and not a puzzle. */}
        <button
          type="button"
          onClick={() => setIcon("")}
          aria-pressed={icon === ""}
          title="No icon — use the group's initials"
          className={`w-9 h-9 rounded-xl grid place-items-center font-semibold border transition-colors ${
            groupName.trim() ? "text-[11px]" : "text-[9px] uppercase tracking-wide"
          } ${icon === "" ? "ring-2 ring-[var(--accent)]" : "hover:bg-white/8"}`}
          style={{
            background: withAlpha(colour, 0.16),
            borderColor: withAlpha(colour, 0.35),
            color: colour,
          }}
        >
          {/* Initials once there is a name to take them from. On a blank
              create form there is not, and inventing "NG" from the
              placeholder would be showing somebody a wrong answer. */}
          {groupName.trim() ? initials(groupName) : "None"}
        </button>

        {GROUP_ICONS.map((choice) => (
          <button
            key={choice}
            type="button"
            onClick={() => setIcon(choice)}
            aria-pressed={icon === choice}
            className={`w-9 h-9 rounded-xl grid place-items-center text-base border border-white/10 bg-white/5 transition-colors ${
              icon === choice ? "ring-2 ring-[var(--accent)]" : "hover:bg-white/10"
            }`}
          >
            {choice}
          </button>
        ))}
      </div>

      <input
        value={icon}
        onChange={(event) => setIcon(event.target.value)}
        placeholder="or paste any emoji"
        maxLength={16}
        className="w-full bg-white/5 border border-white/12 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-[#A855F7]/50"
      />
    </div>
  );
}
