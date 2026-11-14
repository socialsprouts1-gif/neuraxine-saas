import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

// Depth.
// ======================================================================
// The product was flat. Every screen opened with the same recipe — a
// rounded rectangle, a diagonal gradient, a blurred circle in the corner —
// and that recipe is what a generated mockup looks like. Nothing in it
// has a size, a weight or a place in a room.
//
// What reads as real is light behaving consistently. So everything in here
// shares one lighting setup: the sun is up and to the left, tops are lit,
// the left-facing side is mid, the right-facing side is in shade,
// everything that floats casts a shadow on what is under it, and every
// lit edge gets a hairline highlight where it catches the light.
//
// The artwork is drawn, not photographed and not fetched. Two reasons.
// A dashboard is loaded a hundred times a day by the same person, so a
// 400KB photograph is a tax they pay forever; and the app has a dark and a
// light theme, which a raster image cannot follow. SVG is a few kilobytes,
// stays sharp on a 5K display, and reads the theme variables like
// everything else.
//
// The one thing a flat vector cannot fake is grain. Real renders and real
// photographs have noise in them; CSS gradients are mathematically smooth,
// and that smoothness is the single biggest tell. <Grain> puts it back.

/* ----------------------------------------------------------------------
   Isometric projection

   True isometric, not the 2:1 "pixel-art" cheat: x goes right and down,
   y goes left and down, z goes straight up.

       sx = (x - y) · cos30
       sy = (x + y) · sin30 - z

   Two ways to draw in it, and both are needed.

   A solid gets its three visible faces from box() below — a cube has a
   top, a right face and a left face, each a flat quad with its own shade.

   Anything flat that lies ON a surface — a card, a wire, a disc, a label —
   goes inside a group carrying ISO, the matrix that maps the unit x and y
   vectors onto those screen directions. Inside that group an ordinary
   <rect> comes out as an isometric card and an ordinary <circle> comes out
   as the correct ellipse, which is far less error-prone than working out
   eight corner coordinates by hand.
   ---------------------------------------------------------------------- */

const COS30 = 0.8660254;

/** The flat-on-the-floor transform. Wrap in translate(0,-z) to raise it. */
const ISO = `matrix(${COS30},0.5,${-COS30},0.5,0,0)`;

/** A plane at height z, for things lying on top of something. */
function plane(z: number): string {
  return `translate(0,${-z}) ${ISO}`;
}

function p(x: number, y: number, z: number): string {
  return `${((x - y) * COS30).toFixed(2)},${((x + y) * 0.5 - z).toFixed(2)}`;
}

/**
 * The three faces a solid shows this camera. Faces pointing away are not
 * drawn at all — a cube is three quads, never six.
 */
function box(x: number, y: number, w: number, d: number, z0: number, z1: number) {
  return {
    top: `M${p(x, y, z1)} ${p(x + w, y, z1)} ${p(x + w, y + d, z1)} ${p(x, y + d, z1)}Z`,
    // Faces lower-right, away from the light.
    right: `M${p(x + w, y, z1)} ${p(x + w, y + d, z1)} ${p(x + w, y + d, z0)} ${p(x + w, y, z0)}Z`,
    // Faces lower-left, catching it side on.
    left: `M${p(x, y + d, z1)} ${p(x + w, y + d, z1)} ${p(x + w, y + d, z0)} ${p(x, y + d, z0)}Z`,
  };
}

/** Mix a hex toward white (amount > 0) or black (amount < 0). */
function shade(hex: string, amount: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const target = amount >= 0 ? 255 : 0;
  const t = Math.min(1, Math.abs(amount));
  const mix = (c: number) => Math.round(c + (target - c) * t);
  return `rgb(${mix((n >> 16) & 255)} ${mix((n >> 8) & 255)} ${mix(n & 255)})`;
}

/**
 * A solid block. The three faces are three steps of one colour rather
 * than three colours: a block whose faces disagree about its material
 * reads as three triangles that happen to meet.
 */
function Block({
  x,
  y,
  w,
  d,
  z0 = 0,
  z1,
  color,
}: {
  x: number;
  y: number;
  w: number;
  d: number;
  z0?: number;
  z1: number;
  color: string;
}) {
  const f = box(x, y, w, d, z0, z1);
  return (
    <g>
      <path d={f.left} fill={shade(color, -0.2)} />
      <path d={f.right} fill={shade(color, -0.45)} />
      <path d={f.top} fill={shade(color, 0.14)} />
      {/* Where the lit top meets the air. Without it the block has no
          edge, and an edgeless solid looks painted on. */}
      <path d={f.top} fill="none" stroke={shade(color, 0.55)} strokeWidth="0.9" strokeOpacity="0.7" />
    </g>
  );
}

/* ----------------------------------------------------------------------
   Texture and light
   ---------------------------------------------------------------------- */

/**
 * Film grain. The cheapest honest detail in here: it is what separates a
 * surface from a swatch, and it costs no network request.
 *
 * Overlay rather than plain alpha, so it darkens the lights and lifts the
 * darks instead of greying the whole panel — and so it survives both
 * themes without a second value.
 */
export function Grain({ opacity = 0.06 }: { opacity?: number }) {
  return (
    <svg
      aria-hidden
      className="absolute inset-0 w-full h-full pointer-events-none mix-blend-overlay"
      style={{ opacity }}
    >
      <filter id="dim-grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves="3" stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#dim-grain)" />
    </svg>
  );
}

/** The shared defs every scene draws with. */
function SceneDefs({ id }: { id: string }) {
  return (
    <defs>
      {/* Fades the floor out at the edges, so the ground ends in air
          rather than at a visible straight cut. */}
      <radialGradient id={`${id}-fade`}>
        <stop offset="0%" stopColor="#fff" stopOpacity="1" />
        <stop offset="40%" stopColor="#fff" stopOpacity="0.8" />
        {/* Nothing left by 78% of the radius. The floor runs wider than
            the frame, so a fade that is still faintly on at the edge is
            a straight cut across the artwork — which is the one thing
            that gives away that this is a drawing in a box. */}
        <stop offset="78%" stopColor="#fff" stopOpacity="0" />
      </radialGradient>
      <mask id={`${id}-floor`} maskUnits="userSpaceOnUse" x="-200" y="-200" width="400" height="400">
        <rect x="-200" y="-200" width="400" height="400" fill={`url(#${id}-fade)`} />
      </mask>

      {/* A contact shadow, not a drop shadow: tight and dark directly
          under the object, open and faint further out. */}
      <radialGradient id={`${id}-contact`}>
        <stop offset="0%" stopColor="#000" stopOpacity="0.5" />
        <stop offset="60%" stopColor="#000" stopOpacity="0.18" />
        <stop offset="100%" stopColor="#000" stopOpacity="0" />
      </radialGradient>

      {/* The glow a lit object throws onto the floor around it. */}
      <radialGradient id={`${id}-pool`}>
        <stop offset="0%" stopColor="#00FF87" stopOpacity="0.4" />
        <stop offset="100%" stopColor="#00FF87" stopOpacity="0" />
      </radialGradient>
    </defs>
  );
}

/** The floor: a glow, a grid, and nothing at the edges. */
function Floor({ id, grid = 24, reach = 132 }: { id: string; grid?: number; reach?: number }) {
  const lines: number[] = [];
  for (let v = -reach; v <= reach; v += grid) lines.push(v);

  return (
    <g mask={`url(#${id}-floor)`}>
      <ellipse cx="0" cy="0" rx="190" ry="96" fill={`url(#${id}-pool)`} opacity="0.5" />
      <g transform={ISO} stroke="currentColor" strokeWidth="1" opacity="0.14">
        {lines.map((v) => (
          <line key={`a${v}`} x1={v} y1={-reach} x2={v} y2={reach} />
        ))}
        {lines.map((v) => (
          <line key={`b${v}`} x1={-reach} y1={v} x2={reach} y2={v} />
        ))}
      </g>
    </g>
  );
}

/** A card lying flat on a plane at height z, with the shadow it throws. */
function FloatingCard({
  id,
  x,
  y,
  w,
  h,
  z,
  children,
}: {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  children?: ReactNode;
}) {
  return (
    <>
      {/* Thrown straight down and spread by the height it fell from. */}
      <g transform={ISO} opacity={Math.max(0.12, 0.4 - z / 420)}>
        <ellipse
          cx={x + w / 2}
          cy={y + h / 2}
          rx={w * 0.62}
          ry={h * 0.62}
          fill={`url(#${id}-contact)`}
        />
      </g>
      <g transform={plane(z)}>
        {/* The slab's own thickness, seen as the sliver of its underside. */}
        <rect x={x + 1.5} y={y + 1.5} width={w} height={h} rx="7" fill="#000" opacity="0.35" />
        {/* surface-3, not surface-1: on the dark theme the panel behind
            this is already surface-1, so a card painted in it is a card
            you cannot see — a black rectangle on black with a hairline
            around it. A card is lit by the same light as everything else
            here and has to come back brighter than its background. */}
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          rx="7"
          fill="var(--surface-3)"
          stroke="currentColor"
          strokeOpacity="0.22"
          strokeWidth="1"
        />
        {/* The lit edge along the top of the slab. */}
        <rect x={x + 6} y={y + 0.6} width={w - 12} height="1" rx="0.5" fill="#fff" opacity="0.14" />
        {children}
      </g>
    </>
  );
}

/* ----------------------------------------------------------------------
   The scenes

   One per section, each shaped around what that section actually does.
   A single illustration reused four times is wallpaper; the point of
   drawing them is that the dashboard scene is measurement, the chatbot
   scene is branching, and the assistant scene is a thing that thinks.
   ---------------------------------------------------------------------- */

export type SceneName = "console" | "flow" | "agent" | "stack" | "wallet";

const BARS = [
  { at: -52, h: 30, color: "#00D4FF" },
  { at: -26, h: 54, color: "#22D3A8" },
  { at: 0, h: 42, color: "#00FF87" },
  { at: 26, h: 74, color: "#00FF87" },
  { at: 52, h: 60, color: "#A855F7" },
];

/** Measurement: bars standing on a floor, with the day's card above them. */
function Console({ id }: { id: string }) {
  return (
    <>
      <Floor id={id} />
      {/* Laid along y = -x, the one line in this projection that comes out
          horizontal on screen — bars along the x axis alone march away
          from the reader and stop being comparable, which is the only
          thing a bar chart is for. */}
      {/* The light each bar spills onto the floor it stands on. Drawn
          before the bars so a bar always covers its own pool, and this is
          most of what separates "a solid that is lit" from "a solid that
          is coloured in". */}
      <g transform={ISO} opacity="0.5">
        {BARS.map((bar) => (
          <ellipse key={bar.at} cx={bar.at} cy={-bar.at} rx="30" ry="30" fill={`url(#${id}-contact)`} />
        ))}
      </g>
      <g transform={ISO} style={{ mixBlendMode: "screen" }} opacity="0.5">
        {BARS.map((bar) => (
          <radialGradient key={`g${bar.at}`} id={`${id}-spill-${bar.at}`}>
            <stop offset="0%" stopColor={bar.color} stopOpacity="0.55" />
            <stop offset="100%" stopColor={bar.color} stopOpacity="0" />
          </radialGradient>
        ))}
        {BARS.map((bar) => (
          <ellipse
            key={bar.at}
            cx={bar.at}
            cy={-bar.at}
            rx="34"
            ry="34"
            fill={`url(#${id}-spill-${bar.at})`}
          />
        ))}
      </g>

      {BARS.map((bar) => (
        <Block
          key={bar.at}
          x={bar.at - 9}
          y={-bar.at - 9}
          w={18}
          d={18}
          z1={bar.h}
          color={bar.color}
        />
      ))}

      <FloatingCard id={id} x={-96} y={-26} w={92} h={62} z={104}>
        <circle cx={-84} cy={-14} r="5.5" fill="#00FF87" />
        <rect x={-74} y={-17} width="44" height="5" rx="2.5" fill="currentColor" opacity="0.5" />
        <rect x={-74} y={-8} width="28" height="4" rx="2" fill="currentColor" opacity="0.22" />
        <rect x={-84} y={4} width="66" height="4" rx="2" fill="currentColor" opacity="0.16" />
        <rect x={-84} y={13} width="52" height="4" rx="2" fill="currentColor" opacity="0.16" />
        <rect x={-84} y={22} width="36" height="7" rx="3.5" fill="#00FF87" opacity="0.85" />
      </FloatingCard>
    </>
  );
}

/** Branching: one trigger, two outcomes, wired in three dimensions. */
function Flow({ id }: { id: string }) {
  const nodes = [
    { x: -62, y: -10, w: 34, d: 34, z: 20, color: "#00FF87" },
    { x: 10, y: -60, w: 30, d: 30, z: 34, color: "#00D4FF" },
    { x: 14, y: 26, w: 30, d: 30, z: 12, color: "#A855F7" },
  ];

  return (
    <>
      <Floor id={id} />
      {/* The wires go on the floor, under everything, so a block always
          occludes the wire arriving at it. Drawn in plane space, which is
          what makes the corners turn the right way. */}
      <g transform={ISO} fill="none" strokeWidth="2.4" strokeLinecap="round">
        <path
          d="M-28 7 L-4 7 L-4 -45 L10 -45"
          stroke="#00D4FF"
          strokeOpacity="0.55"
        />
        <path d="M-28 7 L-4 7 L-4 41 L14 41" stroke="#A855F7" strokeOpacity="0.5" />
        <circle cx={-4} cy={7} r="3.4" fill="#00FF87" stroke="none" />
      </g>

      {nodes.map((node) => (
        <Block
          key={`${node.x}:${node.y}`}
          x={node.x}
          y={node.y}
          w={node.w}
          d={node.d}
          z1={node.z}
          color={node.color}
        />
      ))}

      {/* The message that comes out, mid-air above the branch it took. */}
      <FloatingCard id={id} x={6} y={-74} w={62} h={34} z={96}>
        <rect x={12} y={-66} width="38" height="4.5" rx="2.2" fill="currentColor" opacity="0.45" />
        <rect x={12} y={-57} width="26" height="4" rx="2" fill="currentColor" opacity="0.2" />
        <rect x={12} y={-48} width="20" height="6" rx="3" fill="#00D4FF" opacity="0.8" />
      </FloatingCard>
    </>
  );
}

/**
 * Something that thinks: a lit sphere over a ring, with things in orbit.
 *
 * Three details do all the work, and a circle with a gradient in it has
 * none of them — the specular highlight where the light source reflects,
 * the terminator where the lit side turns away, and the rim light bounced
 * back off the floor along the bottom edge.
 */
function Agent({ id }: { id: string }) {
  return (
    <>
      <Floor id={id} grid={26} />

      {/* Under the sphere, not behind it. */}
      <g transform={ISO}>
        <ellipse cx="0" cy="0" rx="54" ry="54" fill={`url(#${id}-contact)`} />
        <circle cx="0" cy="0" r="62" fill="none" stroke="#00FF87" strokeOpacity="0.5" strokeWidth="2" />
        <circle cx="0" cy="0" r="74" fill="none" stroke="#00D4FF" strokeOpacity="0.2" strokeWidth="1.4" />
      </g>

      <defs>
        <radialGradient id={`${id}-ball`} cx="34%" cy="28%" r="78%">
          <stop offset="0%" stopColor="#8BFFC9" />
          <stop offset="34%" stopColor="#00E87A" />
          <stop offset="72%" stopColor="#06965A" />
          <stop offset="100%" stopColor="#033D2B" />
        </radialGradient>
        <linearGradient id={`${id}-rim`} x1="0" y1="1" x2="0.4" y2="0">
          <stop offset="0%" stopColor="#7DF3FF" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#7DF3FF" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${id}-spec`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-halo`}>
          <stop offset="55%" stopColor="#00FF87" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#00FF87" stopOpacity="0" />
        </radialGradient>
      </defs>

      <g transform="translate(0,-74)">
        <circle cx="0" cy="0" r="74" fill={`url(#${id}-halo)`} />
        <circle cx="0" cy="0" r="46" fill={`url(#${id}-ball)`} />
        {/* Light off the floor, along the edge that faces it. */}
        <circle cx="0" cy="0" r="45" fill="none" stroke={`url(#${id}-rim)`} strokeWidth="2.6" />
        {/* The source, reflected. Small, bright, and not in the middle. */}
        <ellipse cx="-15" cy="-18" rx="13" ry="9" fill={`url(#${id}-spec)`} transform="rotate(-24 -15 -18)" />
        {/* A seam, so the sphere has a surface rather than only a size. */}
        <path d="M-44 6 C-22 20 22 20 44 6" fill="none" stroke="#042A1E" strokeOpacity="0.35" strokeWidth="1.6" />
        <path d="M-44 4 C-22 18 22 18 44 4" fill="none" stroke="#9BFFD4" strokeOpacity="0.22" strokeWidth="1" />
      </g>

      {/* Orbits, crossing in front of and behind the sphere. The two
          halves are separate paths for exactly that reason: a ring drawn
          in one stroke always passes in front, and then it is a hoop
          hanging on a wall rather than an orbit. */}
      <g transform="translate(0,-74)">
        <ellipse
          cx="0"
          cy="0"
          rx="86"
          ry="27"
          fill="none"
          stroke="#00D4FF"
          strokeOpacity="0.3"
          strokeWidth="1.6"
          transform="rotate(-18)"
        />
        <path
          d="M-81.8 -25.3 A86 27 0 0 0 81.8 25.3"
          fill="none"
          stroke="#00D4FF"
          strokeOpacity="0.75"
          strokeWidth="2"
          transform="rotate(-18)"
        />
        <circle cx="68" cy="-32" r="5" fill="#00D4FF" />
        <circle cx="-74" cy="26" r="3.6" fill="#A855F7" />
        <circle cx="30" cy="42" r="3" fill="#00FF87" />
      </g>
    </>
  );
}

/** A set of things: cards stacked in the air, each throwing on the next. */
function Stack({ id }: { id: string }) {
  const cards = [
    { z: 16, x: -46, y: -34, w: 92, h: 68, tint: "#A855F7" },
    { z: 58, x: -52, y: -40, w: 92, h: 68, tint: "#00D4FF" },
    { z: 100, x: -58, y: -46, w: 92, h: 68, tint: "#00FF87" },
  ];

  return (
    <>
      <Floor id={id} grid={26} />
      {cards.map((card) => (
        <FloatingCard key={card.z} id={id} x={card.x} y={card.y} w={card.w} h={card.h} z={card.z}>
          <rect
            x={card.x + 12}
            y={card.y + 12}
            width="22"
            height="22"
            rx="7"
            fill={card.tint}
            opacity="0.9"
          />
          <rect
            x={card.x + 42}
            y={card.y + 14}
            width="38"
            height="5"
            rx="2.5"
            fill="currentColor"
            opacity="0.45"
          />
          <rect
            x={card.x + 42}
            y={card.y + 24}
            width="24"
            height="4.5"
            rx="2.2"
            fill="currentColor"
            opacity="0.2"
          />
          <rect
            x={card.x + 12}
            y={card.y + 44}
            width="68"
            height="4.5"
            rx="2.2"
            fill="currentColor"
            opacity="0.16"
          />
        </FloatingCard>
      ))}
    </>
  );
}

/** Money: coins on a plinth. Stacked, so the quantity is visible. */
function Wallet({ id }: { id: string }) {
  const coins = [0, 11, 22, 33];
  return (
    <>
      <Floor id={id} grid={26} />
      <g transform={ISO}>
        <ellipse cx="0" cy="0" rx="62" ry="62" fill={`url(#${id}-contact)`} />
      </g>
      {coins.map((z, index) => (
        <g key={z} transform={plane(z)}>
          <ellipse cx="0" cy="0" rx="42" ry="42" fill={shade("#00FF87", -0.52)} />
          <ellipse cx="0" cy="-2.5" rx="42" ry="42" fill={shade("#00FF87", index === coins.length - 1 ? 0.1 : -0.18)} />
          {index === coins.length - 1 && (
            <>
              <ellipse cx="0" cy="-2.5" rx="33" ry="33" fill="none" stroke={shade("#00FF87", -0.3)} strokeWidth="2" />
              {/* The app's own face. An SVG <text> with no family falls
                  back to the browser's default serif, and ₹ in a serif at
                  26px came out as an unreadable squiggle. */}
              <text
                x="0"
                y="7"
                textAnchor="middle"
                fontSize="30"
                fontWeight="700"
                fontFamily="var(--font-sans), system-ui, sans-serif"
                fill={shade("#00FF87", -0.62)}
              >
                ₹
              </text>
            </>
          )}
        </g>
      ))}
      <FloatingCard id={id} x={-84} y={-70} w={70} h={38} z={96}>
        <rect x={-74} y={-60} width="38" height="5" rx="2.5" fill="currentColor" opacity="0.45" />
        <rect x={-74} y={-50} width="50" height="8" rx="4" fill="#00FF87" opacity="0.85" />
      </FloatingCard>
    </>
  );
}

const SCENES: Record<SceneName, (props: { id: string }) => ReactNode> = {
  console: Console,
  flow: Flow,
  agent: Agent,
  stack: Stack,
  wallet: Wallet,
};

/**
 * One drawing, sized to drop into a banner.
 *
 * currentColor is the whole theming strategy: the floor grid, the card
 * faces and the text bars inherit it, so the illustration follows the
 * light and dark themes without a second copy. Saturated brand colour
 * stays literal, because #00FF87 is #00FF87 in both.
 */
export function Scene({
  name,
  className = "",
}: {
  name: SceneName;
  className?: string;
}) {
  const Art = SCENES[name];
  return (
    <svg
      aria-hidden
      // Cropped close to the artwork. The generous frame it had looked
      // fine on its own and cost the banner eighty pixels of nothing on
      // every screen that uses one.
      viewBox="-164 -186 328 252"
      className={`text-[var(--color-white)] ${className}`}
      role="presentation"
    >
      <SceneDefs id={name} />
      <Art id={name} />
    </svg>
  );
}

/* ----------------------------------------------------------------------
   The banner
   ---------------------------------------------------------------------- */

/**
 * The top of a screen.
 *
 * Five layers, and the order matters: a tinted base, two pools of light
 * where the artwork is brightest, a grid that gives the panel a floor,
 * the drawing, and grain over all of it. Taking any one away is what the
 * old banner was — and it looked like a gradient with a title on it.
 */
export function Banner({
  eyebrow,
  title,
  subtitle,
  actions,
  scene,
  stats,
  children,
}: {
  eyebrow?: ReactNode;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  scene?: SceneName;
  /** Figures worth reading before the page, in the banner itself. */
  stats?: { label: string; value: string | number }[];
  children?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-[22px] border border-white/10 shadow-[0_1px_0_rgba(255,255,255,0.06)_inset,0_18px_40px_-24px_rgba(0,0,0,0.55)] mb-6">
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(118deg, color-mix(in oklab, var(--accent) 16%, var(--surface-1)) 0%, var(--surface-1) 46%, color-mix(in oklab, var(--accent-2) 14%, var(--surface-1)) 100%)",
        }}
      />
      <div className="absolute -top-28 -left-20 w-[22rem] h-[22rem] rounded-full bg-accent/20 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 right-10 w-[20rem] h-[20rem] rounded-full bg-accent2/14 blur-3xl pointer-events-none" />
      <div className="absolute inset-0 dot-pattern opacity-50 pointer-events-none [mask-image:radial-gradient(110%_90%_at_80%_100%,#000,transparent)]" />
      <Grain />

      <div className="relative flex flex-col gap-6 p-6 md:p-8 lg:flex-row lg:items-center lg:gap-10">
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <div className="inline-flex items-center gap-2 mb-3 px-2.5 py-1 rounded-full border border-accent/30 bg-accent/10 text-[12px] font-semibold uppercase tracking-widest text-accent-ink">
              {eyebrow}
            </div>
          )}
          {/* Tight tracking at display sizes. Default spacing is set for
              body copy and leaves a 30px heading looking loose. */}
          <h1 className="text-[26px] md:text-[34px] font-bold tracking-[-0.02em] leading-[1.1]">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-white/55 mt-2.5 max-w-xl leading-relaxed">{subtitle}</p>
          )}

          {stats && stats.length > 0 && (
            <div className="flex flex-wrap items-stretch gap-x-7 gap-y-3 mt-6">
              {stats.map((stat, index) => (
                <div
                  key={stat.label}
                  className={
                    index > 0
                      ? "pl-7 border-l border-white/10 min-w-0"
                      : "min-w-0"
                  }
                >
                  <div className="text-xl font-bold tracking-tight">{stat.value}</div>
                  <div className="text-[12px] text-white/45 mt-0.5">{stat.label}</div>
                </div>
              ))}
            </div>
          )}

          {actions && <div className="flex flex-wrap gap-2.5 mt-6">{actions}</div>}
          {children}
        </div>

        {/* Hidden below sm rather than scaled down: at 140px the floor
            grid aliases into moiré and the sphere's highlight is one
            pixel, which is worse than the space it saves. */}
        {/* Sized against what else the banner is carrying. A title and
            one line do not need a 300px illustration beside them — the
            picture then sets the height and leaves the text floating in
            the middle of an empty panel. */}
        {scene && (
          <div className="hidden sm:block shrink-0 self-center">
            <Scene
              name={scene}
              // Bounded by height rather than width, because height is
              // what the banner pays for. Sized by width, a 270px
              // drawing is 207px tall and sets the height of a panel
              // whose text is 130px — which is how a two-line heading
              // ends up floating in the middle of an empty box.
              className={
                (stats && stats.length > 0) || actions
                  ? "h-[150px] lg:h-[178px] w-auto"
                  : "h-[112px] lg:h-[132px] w-auto"
              }
            />
          </div>
        )}
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------------
   The stat tile
   ---------------------------------------------------------------------- */

/** A tiny shape of the last fortnight, for under a number. */
export function Spark({
  values,
  color,
  className = "",
}: {
  values: number[];
  color: string;
  className?: string;
}) {
  if (values.length < 2) return null;
  const peak = Math.max(1, ...values);
  const step = 100 / (values.length - 1);
  const points = values.map((value, index): [number, number] => [
    index * step,
    28 - (value / peak) * 24,
  ]);
  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");

  return (
    <svg
      aria-hidden
      viewBox="0 0 100 30"
      preserveAspectRatio="none"
      className={className}
      // Stretched to the card's width, so the stroke has to opt out of
      // being stretched with it.
      style={{ overflow: "visible" }}
    >
      <path d={`${line} L100 30 L0 30Z`} fill={color} opacity="0.16" />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="1.75"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/**
 * One number, with a lit chip for the thing it counts.
 *
 * The chip is the difference between this and the tile it replaces. That
 * one was a flat 8%-alpha square with a thin outline — the same square
 * four times in a row, in four hues. This one has a light source: a
 * diagonal gradient, a highlight along the top edge where it catches,
 * and a coloured shadow underneath, so it sits above the card instead of
 * being printed on it.
 */
export function Tile({
  icon: Icon,
  label,
  value,
  delta,
  hint,
  tint,
  spark,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  /** Signed, already formatted — "+18%". */
  delta?: string;
  hint?: string;
  tint: string;
  spark?: number[];
}) {
  const down = delta?.startsWith("-");

  return (
    <div className="glass-card lift relative overflow-hidden p-5 min-w-0">
      <div className="flex items-start justify-between gap-3">
        <span
          className="w-11 h-11 rounded-[14px] grid place-items-center shrink-0"
          style={{
            background: `linear-gradient(145deg, ${shade(tint, 0.34)}, ${tint} 46%, ${shade(tint, -0.3)})`,
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.5), inset 0 -1px 0 rgba(0,0,0,0.22), 0 6px 14px -5px ${tint}, 0 2px 5px rgba(0,0,0,0.3)`,
          }}
        >
          <Icon className="w-[19px] h-[19px] text-white" strokeWidth={2.3} />
        </span>
        {delta && (
          <span
            className={`text-[12px] font-semibold px-2 py-0.5 rounded-lg border ${
              down
                ? "text-[#F87171] bg-[#F87171]/10 border-[#F87171]/20"
                : "text-accent-ink bg-accent/10 border-accent/20"
            }`}
          >
            {delta}
          </span>
        )}
      </div>

      <div className="text-[28px] font-bold tracking-[-0.02em] leading-none mt-4">{value}</div>
      <div className="text-xs text-white/45 mt-1.5">{label}</div>
      {hint && <div className="text-[12px] text-white/30 mt-1">{hint}</div>}

      {/* Bleeds to all three edges. Inset, it reads as a second chart
          that happens to be small; bled, it reads as the card's own
          footing. */}
      {spark && spark.length > 1 && (
        <Spark values={spark} color={tint} className="absolute inset-x-0 -bottom-px h-10 w-full" />
      )}
    </div>
  );
}
