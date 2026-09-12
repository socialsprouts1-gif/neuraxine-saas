import Image from "next/image";

/**
 * The Neura Chat mark. One component so the logo can be replaced in a single
 * place — the sidebar, both auth pages and the landing footer all render this.
 *
 * The SVG carries its own gradients and glow, so it needs no wrapper tile and
 * stays sharp at every size.
 */
export default function BrandMark({
  size = 32,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src="/logo.svg"
      alt="Neura Chat"
      width={size}
      height={size}
      priority
      className={`flex-shrink-0 ${className}`}
    />
  );
}
