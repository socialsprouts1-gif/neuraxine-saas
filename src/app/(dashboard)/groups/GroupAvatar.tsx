import { initials, withAlpha } from "@/lib/group-identity";

const SIZES = {
  sm: { box: "w-9 h-9 rounded-xl", glyph: "text-base", letters: "text-[11px]" },
  md: { box: "w-12 h-12 rounded-2xl", glyph: "text-xl", letters: "text-sm" },
  lg: { box: "w-16 h-16 rounded-2xl", glyph: "text-3xl", letters: "text-lg" },
} as const;

/**
 * How a group is recognised at a glance.
 *
 * A logo if there is one, else an emoji, else the initials — in that
 * order, so a group always has a face rather than sometimes having one.
 * The tile is tinted with the group's own colour, which is what makes a
 * list of fifteen scannable instead of fifteen identical grey rows.
 */
export default function GroupAvatar({
  name,
  colour,
  icon,
  imageUrl,
  size = "md",
}: {
  name: string;
  colour: string;
  icon?: string | null;
  imageUrl?: string | null;
  size?: keyof typeof SIZES;
}) {
  const style = SIZES[size];

  const shell = `${style.box} flex-shrink-0 grid place-items-center overflow-hidden border`;
  const tint = {
    background: withAlpha(colour, 0.16),
    borderColor: withAlpha(colour, 0.35),
  };

  if (imageUrl) {
    return (
      <span className={shell} style={tint}>
        {/* A plain img: these are arbitrary customer logos on arbitrary
            hosts, and next/image would need every one of those hosts
            listed in next.config before it would render at all. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
      </span>
    );
  }

  return (
    <span className={shell} style={tint} aria-hidden>
      {icon ? (
        <span className={style.glyph}>{icon}</span>
      ) : (
        <span className={`${style.letters} font-semibold tracking-wide`} style={{ color: colour }}>
          {initials(name)}
        </span>
      )}
    </span>
  );
}
