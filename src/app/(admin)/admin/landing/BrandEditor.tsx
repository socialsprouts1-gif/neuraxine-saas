"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Loader2, Upload, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { saveSiteSection } from "../actions";
import { Card } from "@/components/ui/primitives";
import type { BrandContent } from "@/lib/site-content";

/**
 * Brand: the name, the logo, the favicon, and what a browser tab says.
 *
 * Files go straight from the browser to Supabase Storage rather than through
 * a server action — a serverless request body is capped well below the size
 * of a logo exported at 2x, and a route that works for a 40 KB SVG and fails
 * for a 6 MB PNG is worse than one that never sees the file at all.
 */
export default function BrandEditor({ initial }: { initial: BrandContent }) {
  const router = useRouter();
  const [brand, setBrand] = useState(initial);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<"logo" | "favicon" | null>(null);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof BrandContent>(key: K, value: BrandContent[K]) =>
    setBrand((current) => ({ ...current, [key]: value }));

  const upload = async (file: File, kind: "logo" | "favicon") => {
    setBusy(kind);
    setNote(null);
    try {
      const supabase = createClient();
      const safe = file.name.replace(/[^\w.-]+/g, "-").slice(-60);
      const path = `${kind}/${crypto.randomUUID()}-${safe}`;

      const { error } = await supabase.storage
        .from("brand")
        .upload(path, file, { contentType: file.type || undefined, upsert: false });

      if (error) {
        setNote({
          ok: false,
          text: /bucket|not found/i.test(error.message)
            ? "There's no “brand” storage bucket yet — run supabase/setup.sql, then try again."
            : /row-level security|policy|denied|unauthor/i.test(error.message)
              ? "Storage refused the upload. Run supabase/setup.sql again to install the brand policies."
              : error.message,
        });
        return;
      }

      const { data } = supabase.storage.from("brand").getPublicUrl(path);
      set(kind === "logo" ? "logoUrl" : "faviconUrl", data.publicUrl);
      setNote({ ok: true, text: `${kind === "logo" ? "Logo" : "Favicon"} uploaded. Press Save to publish it.` });
    } finally {
      setBusy(null);
    }
  };

  const save = () =>
    startTransition(async () => {
      const result = await saveSiteSection("brand", { ...brand });
      setNote({ ok: result.ok, text: result.message ?? result.error ?? "" });
      if (result.ok) router.refresh();
    });

  return (
    <Card>
      <h2 className="font-semibold mb-1">Brand</h2>
      <p className="text-sm text-white/50 mb-5">
        The name and logo in the header and footer, and what a browser tab shows.
      </p>

      <div className="grid md:grid-cols-2 gap-4 mb-5">
        <Text label="Name" value={brand.name} onChange={(v) => set("name", v)} hint="Shown in plain white." />
        <Text
          label="Accent word"
          value={brand.nameAccent}
          onChange={(v) => set("nameAccent", v)}
          hint="Rendered in the green gradient. Leave empty for a single-word name."
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-4 mb-5">
        <AssetSlot
          label="Logo"
          url={brand.logoUrl}
          busy={busy === "logo"}
          hint="Replaces the generated mark. SVG or PNG, square works best."
          onPick={(file) => void upload(file, "logo")}
          onClear={() => set("logoUrl", "")}
        />
        <AssetSlot
          label="Favicon"
          url={brand.faviconUrl}
          busy={busy === "favicon"}
          hint="The browser tab icon. 32×32 or an SVG."
          onPick={(file) => void upload(file, "favicon")}
          onClear={() => set("faviconUrl", "")}
        />
      </div>

      <div className="space-y-4 mb-5">
        <Text
          label="Browser tab title"
          value={brand.siteTitle}
          onChange={(v) => set("siteTitle", v)}
          hint="Also the headline when someone shares a link."
        />
        <Text
          label="Description"
          value={brand.siteDescription}
          onChange={(v) => set("siteDescription", v)}
          multiline
          hint="The sentence search engines and link previews show."
        />
      </div>

      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={pending} className="btn-primary text-sm">
          {pending && <Loader2 className="w-4 h-4 animate-spin" />}
          Save brand
        </button>
        {note && (
          <span className={`text-xs ${note.ok ? "text-accent-ink" : "text-[#F87171]"}`}>
            {note.text}
          </span>
        )}
      </div>
    </Card>
  );
}

function Text({
  label,
  value,
  onChange,
  hint,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  multiline?: boolean;
}) {
  const shared =
    "w-full bg-white/5 border border-white/12 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50 transition-all";
  return (
    <label className="block">
      <span className="block text-xs font-medium text-white/70 mb-1.5">{label}</span>
      {multiline ? (
        <textarea
          rows={3}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`${shared} resize-y`}
        />
      ) : (
        <input value={value} onChange={(event) => onChange(event.target.value)} className={shared} />
      )}
      {hint && <span className="block text-[11px] text-white/35 mt-1">{hint}</span>}
    </label>
  );
}

/** An uploaded image, with what it looks like now. */
function AssetSlot({
  label,
  url,
  hint,
  busy,
  onPick,
  onClear,
}: {
  label: string;
  url: string;
  hint: string;
  busy: boolean;
  onPick: (file: File) => void;
  onClear: () => void;
}) {
  return (
    <div>
      <span className="block text-xs font-medium text-white/70 mb-1.5">{label}</span>
      <div className="flex items-center gap-3 bg-white/4 border border-white/10 rounded-xl p-3">
        <div className="w-12 h-12 rounded-lg bg-white/5 border border-white/10 grid place-items-center overflow-hidden shrink-0">
          {url ? (
            <Image src={url} alt={label} width={48} height={48} className="object-contain" unoptimized />
          ) : (
            <span className="text-[10px] text-white/30">none</span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <label className="inline-flex items-center gap-1.5 text-xs text-accent-ink cursor-pointer hover:underline">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {busy ? "Uploading…" : url ? "Replace" : "Upload"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onPick(file);
                event.target.value = "";
              }}
            />
          </label>
          <p className="text-[11px] text-white/35 mt-1 leading-snug">{hint}</p>
        </div>

        {url && (
          <button
            type="button"
            onClick={onClear}
            aria-label={`Remove ${label}`}
            className="p-1.5 rounded-lg text-white/30 hover:text-[#F87171] hover:bg-white/8 transition-colors shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
