"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Download,
  FileText,
  Film,
  Image as ImageIcon,
  Link2,
  Music,
  AlertTriangle,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { deleteMediaAsset, deleteMediaAssets, recordUploadedMedia } from "../portal-actions";
import type { MediaAsset } from "@/types/portal";

// The gallery exists to feed the builder: upload a file here, copy its URL,
// paste it into a Send Media Message node. So Copy URL is the primary action
// on every card, not something hidden behind a menu.

type MediaType = MediaAsset["media_type"];

const TABS: { id: MediaType | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "image", label: "Images" },
  { id: "video", label: "Videos" },
  { id: "document", label: "Documents" },
  { id: "audio", label: "Audio" },
];

const TYPE_ICON = { image: ImageIcon, video: Film, document: FileText, audio: Music };

const TYPE_ACCENT: Record<MediaType, string> = {
  image: "#00D4FF",
  video: "#A78BFA",
  document: "#FBBF24",
  audio: "#00FF87",
};

// WhatsApp's own per-type ceilings. Refusing here beats Meta refusing later,
// when the file is already stored and the operator is mid-campaign.
const WHATSAPP_LIMITS: Record<MediaType, number> = {
  image: 5 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  document: 100 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
};

export function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 2 : 0)} ${units[unit]}`;
}

function mediaTypeOf(file: File): MediaType {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return "document";
}

export default function GalleryBrowser({
  assets,
  orgId,
  stats,
}: {
  assets: MediaAsset[];
  /** Counted server-side, rendered here so they sit under the hero. */
  stats: { label: string; value: string }[];
  /**
   * Resolved server-side by requireOrg. Guessing it from a membership row
   * would pick an arbitrary one for anyone who belongs to two workspaces,
   * and upload their file into the wrong tenant's folder.
   */
  orgId: string;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [, startTransition] = useTransition();

  const [tab, setTab] = useState<MediaType | "all">("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [uploading, setUploading] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  // A success can fade; a failure must not. An error that disappears after
  // three seconds is indistinguishable from nothing happening at all, which
  // is exactly how a failed upload looked.
  const say = useCallback((ok: boolean, text: string) => {
    setToast({ ok, text });
    if (ok) setTimeout(() => setToast((current) => (current?.ok ? null : current)), 3000);
  }, []);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return assets.filter(
      (asset) =>
        (tab === "all" || asset.media_type === tab) &&
        (!term || asset.name.toLowerCase().includes(term))
    );
  }, [assets, tab, query]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: assets.length };
    for (const asset of assets) map[asset.media_type] = (map[asset.media_type] ?? 0) + 1;
    return map;
  }, [assets]);

  // Check the bucket on load rather than letting the first upload be the
  // thing that discovers it is missing.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { error } = await createClient().storage.from("media").list("", { limit: 1 });
      if (cancelled || !error) return;
      setStorageError(
        /bucket|not found/i.test(error.message)
          ? "Storage isn't set up yet: this project has no \u201cmedia\u201d bucket. Run supabase/setup.sql in the Supabase SQL editor, then reload."
          : `Storage rejected a read: ${error.message}. If this mentions row-level security, run supabase/setup.sql again \u2014 uploads need a select policy on storage.objects.`
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const upload = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;

      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        say(false, "Your session expired — sign in again.");
        return;
      }

      setUploading(list.map((f) => f.name));

      for (const file of list) {
        const mediaType = mediaTypeOf(file);
        const limit = WHATSAPP_LIMITS[mediaType];
        if (file.size > limit) {
          say(
            false,
            `${file.name} is ${formatBytes(file.size)} — WhatsApp caps ${mediaType}s at ${formatBytes(limit)}.`
          );
          continue;
        }

        // Keep the original name visible but not in the key: two people
        // uploading "photo.jpg" must not collide, and storage keys are
        // easier to reason about without spaces or unicode in them.
        const safe = file.name.replace(/[^\w.-]+/g, "-").slice(-80);
        const path = `${orgId}/${crypto.randomUUID()}-${safe}`;

        const { error: uploadError } = await supabase.storage
          .from("media")
          .upload(path, file, { contentType: file.type || undefined, upsert: false });

        if (uploadError) {
          const raw = uploadError.message;
          const hint = /bucket|not found/i.test(raw)
            ? " The \u201cmedia\u201d bucket does not exist \u2014 run supabase/setup.sql."
            : /row-level security|policy|denied|unauthor/i.test(raw)
              ? " Storage refused the write \u2014 run supabase/setup.sql again to install the media policies."
              : "";
          say(false, `${file.name}: ${raw}.${hint}`);
          continue;
        }

        const { data: pub } = supabase.storage.from("media").getPublicUrl(path);

        const result = await recordUploadedMedia({
          name: file.name,
          url: pub.publicUrl,
          storagePath: path,
          mediaType,
          mimeType: file.type || null,
          sizeBytes: file.size,
        });

        if (!result.ok) {
          // The file is in storage but has no row, so nothing can reach it.
          await supabase.storage.from("media").remove([path]);
          say(false, result.error ?? `Couldn't save ${file.name}.`);
          continue;
        }

        say(true, `Uploaded ${file.name}.`);
      }

      setUploading([]);
      router.refresh();
    },
    [orgId, router, say]
  );

  const copyUrl = useCallback(
    async (asset: MediaAsset) => {
      try {
        await navigator.clipboard.writeText(asset.url);
        say(true, "URL copied — paste it into a Send Media Message node.");
      } catch {
        say(false, "Your browser blocked the clipboard. Open the file and copy the address.");
      }
    },
    [say]
  );

  const removeOne = (asset: MediaAsset) =>
    startTransition(async () => {
      const data = new FormData();
      data.set("id", asset.id);
      const result = await deleteMediaAsset(data);
      say(result.ok, result.ok ? `Deleted ${asset.name}.` : (result.error ?? "Delete failed."));
      setSelected((current) => {
        const next = new Set(current);
        next.delete(asset.id);
        return next;
      });
      router.refresh();
    });

  const removeSelected = () =>
    startTransition(async () => {
      const result = await deleteMediaAssets([...selected]);
      say(result.ok, result.error ?? result.message ?? "Deleted.");
      setSelected(new Set());
      router.refresh();
    });

  const allVisibleSelected = visible.length > 0 && visible.every((a) => selected.has(a.id));

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        // Only clear when the pointer actually leaves the drop zone, not
        // when it crosses onto a child element.
        if (e.currentTarget.contains(e.relatedTarget as globalThis.Node)) return;
        setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void upload(e.dataTransfer.files);
      }}
    >
      <input
        ref={fileInput}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          // Copy out of the FileList before resetting the input. e.target.files
          // is live: clearing value empties it in place, so holding the list
          // and reading it afterwards yields nothing and the upload silently
          // does not happen. The reset itself is needed — without it, picking
          // the same file twice fires no change event.
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length > 0) void upload(files);
        }}
      />

      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-r from-accent/18 via-accent/10 to-transparent border border-accent/15 px-6 py-7 mb-4">
        <h1 className="text-2xl font-bold mb-1">Gallery</h1>
        <p className="text-sm text-white/55">
          Media library for templates, campaigns, and quick replies.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {stats.map((stat) => (
          <div key={stat.label} className="glass-card px-4 py-3">
            <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1">
              {stat.label}
            </div>
            <div className="text-xl font-semibold">{stat.value}</div>
          </div>
        ))}
      </div>

      {storageError && (
        <div className="flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/8 p-4 mb-4">
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-medium text-red-300 mb-0.5">Uploads will not work yet</div>
            <p className="text-xs text-white/60 leading-relaxed">{storageError}</p>
          </div>
        </div>
      )}

      {/* Upload */}
      <div
        className={`rounded-2xl px-6 py-5 mb-6 border transition-colors ${
          dragging
            ? "border-accent border-dashed bg-accent/12"
            : "border-accent/15 bg-gradient-to-r from-accent/12 to-transparent"
        }`}
      >
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={uploading.length > 0}
            className="btn-primary text-sm disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            {uploading.length > 0 ? `Uploading ${uploading.length}\u2026` : "Upload media"}
          </button>
          <p className="text-xs text-white/45 flex-1 min-w-[16rem]">
            {dragging
              ? "Drop to upload."
              : "Or drop files anywhere on this page. Images up to 5\u00A0MB, video and audio 16\u00A0MB, documents 100\u00A0MB \u2014 WhatsApp\u2019s own limits."}
          </p>
        </div>
        {uploading.length > 0 && (
          <p className="text-[11px] text-white/35 mt-2 truncate">{uploading.join(", ")}</p>
        )}
      </div>

      {/* Search + selection */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[14rem]">
          <Search className="w-4 h-4 text-white/30 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            className="w-full bg-white/4 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/40"
            placeholder="Search media…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <button
          type="button"
          onClick={() =>
            setSelected(allVisibleSelected ? new Set() : new Set(visible.map((a) => a.id)))
          }
          disabled={visible.length === 0}
          className="btn-secondary text-xs disabled:opacity-40"
        >
          {allVisibleSelected ? <X className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
          {allVisibleSelected ? "Clear selection" : "Select all"}
        </button>

        {selected.size > 0 && (
          <button
            type="button"
            onClick={removeSelected}
            className="text-xs px-3 py-2 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 hover:bg-red-500/25 transition-colors inline-flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete {selected.size}
          </button>
        )}
      </div>

      {/* Type tabs */}
      <div className="flex flex-wrap gap-1 p-1.5 rounded-xl bg-white/3 border border-white/8 mb-5">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            className={`text-xs px-3.5 py-1.5 rounded-lg transition-colors ${
              tab === entry.id
                ? "bg-accent/15 text-accent-ink border border-accent/25"
                : "text-white/50 hover:text-white/80 border border-transparent"
            }`}
          >
            {entry.label}
            <span className="ml-1.5 text-white/30">{counts[entry.id] ?? 0}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="glass-card p-10 text-center">
          <p className="text-sm text-white/50">
            {assets.length === 0
              ? "Nothing here yet. Upload a file and its URL becomes usable in any Send Media Message node."
              : "No media matches those filters."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {visible.map((asset) => (
            <MediaCard
              key={asset.id}
              asset={asset}
              selected={selected.has(asset.id)}
              onToggle={() =>
                setSelected((current) => {
                  const next = new Set(current);
                  if (next.has(asset.id)) next.delete(asset.id);
                  else next.add(asset.id);
                  return next;
                })
              }
              onCopy={() => copyUrl(asset)}
              onDelete={() => removeOne(asset)}
            />
          ))}
        </div>
      )}

      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 max-w-sm rounded-xl border px-4 py-3 shadow-2xl text-sm ${
            toast.ok
              ? "bg-[#0A1A12] border-accent/30 text-accent-ink"
              : "bg-[#1A0A0A] border-red-500/30 text-red-300"
          }`}
          role="status"
        >
          <div className="flex items-start gap-3">
            <span className="flex-1 leading-relaxed">{toast.text}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="opacity-60 hover:opacity-100 transition-opacity flex-shrink-0"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MediaCard({
  asset,
  selected,
  onToggle,
  onCopy,
  onDelete,
}: {
  asset: MediaAsset;
  selected: boolean;
  onToggle: () => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const Icon = TYPE_ICON[asset.media_type];
  const accent = TYPE_ACCENT[asset.media_type];
  const [confirming, setConfirming] = useState(false);

  return (
    <div
      className={`group relative rounded-xl border overflow-hidden bg-[var(--surface-1)] transition-colors ${
        selected ? "border-accent/60" : "border-white/10 hover:border-white/20"
      }`}
    >
      <div className="relative aspect-square bg-[var(--surface-2)] flex items-center justify-center overflow-hidden">
        {asset.media_type === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={asset.url}
            alt={asset.name}
            loading="lazy"
            className="w-full h-full object-cover"
          />
        ) : asset.media_type === "video" ? (
          // Metadata only: loading whole videos to draw a grid is wasteful,
          // and the poster frame is all a thumbnail needs.
          <video src={asset.url} preload="metadata" className="w-full h-full object-cover" muted />
        ) : (
          <Icon className="w-10 h-10" style={{ color: `${accent}66` }} />
        )}

        <button
          type="button"
          onClick={onToggle}
          role="checkbox"
          aria-checked={selected}
          aria-label={selected ? `Deselect ${asset.name}` : `Select ${asset.name}`}
          className={`absolute top-2 left-2 w-5 h-5 rounded border flex items-center justify-center transition-all ${
            selected
              ? "bg-accent border-accent"
              : "bg-black/50 border-white/40 opacity-0 group-hover:opacity-100 backdrop-blur-sm"
          }`}
        >
          {selected && <Check className="w-3.5 h-3.5 text-[#050508]" />}
        </button>

        {/* Copy URL is the reason this page exists, so it is the widest
            target and it is labelled. */}
        <div className="absolute inset-x-0 bottom-0 p-2 flex items-center gap-1.5 bg-gradient-to-t from-black/85 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={onCopy}
            className="flex-1 inline-flex items-center justify-center gap-1.5 text-[11px] py-1.5 rounded-lg bg-accent/90 text-[#050508] font-medium hover:bg-accent transition-colors"
          >
            <Link2 className="w-3.5 h-3.5" />
            Copy URL
          </button>
          <a
            href={asset.url}
            target="_blank"
            rel="noopener noreferrer"
            download={asset.name}
            className="p-1.5 rounded-lg bg-white/15 text-white hover:bg-white/25 transition-colors backdrop-blur-sm"
            aria-label={`Download ${asset.name}`}
          >
            <Download className="w-3.5 h-3.5" />
          </a>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="p-1.5 rounded-lg bg-red-500/80 text-white hover:bg-red-500 transition-colors"
            aria-label={`Delete ${asset.name}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {confirming && (
          <div className="absolute inset-0 bg-[var(--app-bg)]/92 flex flex-col items-center justify-center gap-2 p-3 text-center">
            <p className="text-[11px] text-white/70 leading-relaxed">
              Delete this file? Any flow using its URL will stop sending media.
            </p>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  onDelete();
                }}
                className="text-[11px] px-2.5 py-1 rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 hover:bg-red-500/30"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="text-[11px] px-2.5 py-1 rounded-lg border border-white/15 text-white/60 hover:bg-white/6"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <span
          className="absolute top-2 right-2 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded backdrop-blur-sm"
          style={{ background: `${accent}25`, color: accent }}
        >
          {asset.media_type}
        </span>
      </div>

      <div className="p-2.5">
        <p className="text-[11px] font-medium truncate" title={asset.name}>
          {asset.name}
        </p>
        <div className="flex items-center justify-between text-[10px] text-white/35 mt-0.5">
          <span>{formatBytes(asset.size_bytes)}</span>
          <span>{new Date(asset.created_at).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
}
