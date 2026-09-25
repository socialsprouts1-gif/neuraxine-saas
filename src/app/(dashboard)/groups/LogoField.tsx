"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { withAlpha } from "@/lib/group-identity";

/** A logo on a 64px tile. Anything larger is bandwidth nobody sees. */
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Upload a logo, or paste the address of one.
 *
 * Uploads go to the same "media" bucket as the gallery, so there is one
 * place files live and one set of storage policies to get right. The URL
 * box stays because plenty of businesses already have their logo on their
 * own site and pasting it is faster than finding the file again.
 *
 * Writes to a hidden input the surrounding ActionForm submits, so the
 * logo saves with the name and the colour rather than on its own.
 */
export default function LogoField({
  name = "image_url",
  defaultValue,
  orgId,
  colour,
}: {
  name?: string;
  defaultValue?: string | null;
  orgId: string;
  colour: string;
}) {
  const [url, setUrl] = useState(defaultValue ?? "");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement | null>(null);

  const upload = async (file: File) => {
    setProblem(null);

    if (!file.type.startsWith("image/")) {
      setProblem("That is not an image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setProblem("Logos are capped at 2 MB. A 256px square is plenty.");
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();
      const safe = file.name.replace(/[^\w.-]+/g, "-").slice(-60);
      const path = `${orgId}/group-logos/${crypto.randomUUID()}-${safe}`;

      const { error } = await supabase.storage
        .from("media")
        .upload(path, file, { contentType: file.type || undefined, upsert: false });

      if (error) {
        // The two failures worth telling apart, because the fix differs:
        // one is a bucket that was never created, the other is policies.
        setProblem(
          /bucket|not found/i.test(error.message)
            ? "Storage has no “media” bucket yet. Run supabase/setup.sql in the Supabase SQL editor, then try again."
            : /row-level security|policy|denied|unauthor/i.test(error.message)
              ? "Storage refused the upload. Run supabase/setup.sql again — it installs the media policies."
              : error.message
        );
        return;
      }

      setUrl(supabase.storage.from("media").getPublicUrl(path).data.publicUrl);
    } catch {
      setProblem("The upload did not go through. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <span className="block text-xs font-medium text-white/70 mb-1.5">Logo</span>

      <input type="hidden" name={name} value={url} />

      <div className="flex items-center gap-3 mb-2.5">
        <span
          className="w-12 h-12 rounded-2xl border grid place-items-center overflow-hidden flex-shrink-0"
          style={{ background: withAlpha(colour, 0.16), borderColor: withAlpha(colour, 0.35) }}
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="w-full h-full object-cover" />
          ) : (
            <ImagePlus className="w-4 h-4 text-white/30" />
          )}
        </span>

        <button
          type="button"
          onClick={() => picker.current?.click()}
          disabled={busy}
          className="btn-secondary text-xs disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
          {busy ? "Uploading…" : url ? "Replace" : "Upload"}
        </button>

        {url && (
          <button
            type="button"
            onClick={() => setUrl("")}
            className="text-xs text-white/45 hover:text-white inline-flex items-center gap-1 transition-colors"
          >
            <X className="w-3 h-3" />
            Remove
          </button>
        )}

        <input
          ref={picker}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
            event.target.value = "";
          }}
        />
      </div>

      <input
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        placeholder="or paste an https:// address"
        className="w-full bg-white/5 border border-white/12 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-[#A855F7]/50"
      />

      {problem && (
        <p className="text-xs text-red-400 mt-2" role="alert">
          {problem}
        </p>
      )}
      <p className="text-[11px] text-white/35 mt-1.5">
        Shown instead of the icon. A square image looks best.
      </p>
    </div>
  );
}
