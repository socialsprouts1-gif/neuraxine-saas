import Image from "next/image";

/**
 * The mark, wherever it appears — sidebar, both auth pages, the landing
 * footer.
 *
 * Takes the uploaded logo as a prop rather than reading it here, because
 * two of the four callers are client components and the value lives in the
 * database. Whoever renders on the server looks it up once and passes it
 * down; everything else falls back to the file shipped with the build,
 * which is also what a fresh deployment with no upload should show.
 */
export default function BrandMark({
  size = 32,
  src,
  alt = "Neura Chat",
  className = "",
}: {
  size?: number;
  /** An uploaded logo URL. Blank or absent uses the bundled mark. */
  src?: string | null;
  alt?: string;
  className?: string;
}) {
  const source = src?.trim() || "/logo.svg";

  return (
    <Image
      src={source}
      alt={alt}
      width={size}
      height={size}
      priority
      // An uploaded PNG is rarely square and never the size it is rendered
      // at, so it is fitted rather than stretched.
      style={{ width: size, height: size, objectFit: "contain" }}
      // Supabase Storage serves these, and the loader would need every
      // project host allow-listed in next.config to optimise them.
      unoptimized={source.startsWith("http")}
      className={`flex-shrink-0 ${className}`}
    />
  );
}
