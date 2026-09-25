"use client";

import { useState } from "react";
import { describeAudience, readAudience, type Audience } from "@/lib/group-identity";

/**
 * Who the message goes to, said before it is sent rather than after.
 *
 * "Key contacts only" over a group where nobody has been marked sends to
 * nobody, and finding that out from a result is a worse way to find it
 * out than reading it under the picker.
 */
export default function BroadcastFields({
  admins,
  total,
}: {
  admins: number;
  total: number;
}) {
  const [audience, setAudience] = useState<Audience>("everyone");

  return (
    <div className="mb-4">
      <label className="block">
        <span className="block text-xs font-medium text-white/70 mb-1.5">Send to</span>
        <select
          name="audience"
          value={audience}
          onChange={(event) => setAudience(readAudience(event.target.value))}
          className="w-full bg-white/5 border border-white/12 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#A855F7]/50"
        >
          <option value="everyone" className="bg-[var(--surface-3)]">
            Everyone in the group
          </option>
          <option value="admins" className="bg-[var(--surface-3)]">
            Key contacts only
          </option>
        </select>
      </label>

      <p
        className={`text-[11px] mt-1.5 leading-relaxed ${
          audience === "admins" && admins === 0 ? "text-amber-300/80" : "text-white/40"
        }`}
      >
        {describeAudience(audience, admins, total)}
      </p>
    </div>
  );
}
