// Renders the NX mark as a PNG for email.
//
// Two reasons this cannot just be public/logo.svg:
//
// Gmail, Outlook and Yahoo all refuse SVG in a message body — it is an
// attack surface, so they strip it. A PNG is the only vector-free format
// every client renders.
//
// And the mark is silver and lime, drawn for the dark app chrome. The email
// card is white, where the silver N all but disappears. So it is composed
// on the same dark rounded square the sidebar puts it in, which is how the
// logo is meant to be seen anyway.
//
// Run with: node scripts/build-email-logo.mjs

import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const SIZE = 128; // Rendered at 40px, so it stays sharp on a retina screen.
const PAD = 22; // Breathing room inside the badge, in viewBox units.

const source = await readFile("public/logo.svg", "utf8");

// The mark's own <defs> and paths, lifted out so they can be re-mounted
// inside a larger canvas rather than scaled by CSS in the message.
const inner = source
  .replace(/^[\s\S]*?<svg[^>]*>/, "")
  .replace(/<\/svg>\s*$/, "")
  .replace(/<title>[\s\S]*?<\/title>/, "");

const composed = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 164 164">
  <rect x="0" y="0" width="164" height="164" rx="38" fill="#0B1220"/>
  <g transform="translate(${PAD}, ${PAD})">${inner}</g>
</svg>`;

await writeFile("public/logo-email.svg", composed);

await sharp(Buffer.from(composed), { density: 384 })
  .png({ compressionLevel: 9 })
  .toFile("public/logo-email.png");

const { size } = await sharp("public/logo-email.png").metadata();
console.log(`public/logo-email.png written, ${SIZE}x${SIZE}, ${size} bytes`);
