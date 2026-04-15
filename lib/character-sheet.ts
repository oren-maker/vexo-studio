/**
 * Composite "character sheet" generator.
 *
 * Sora's input_reference accepts ONE image. For multi-character scenes we used
 * to pass only the first character's front portrait — Sora then invented faces
 * for the rest. Instead, we lay out every scene character's portrait side-by-
 * side on a single 1280x720 canvas with their names labeled. The Sora prompt
 * tells the model "the reference is a character sheet — X is on the left,
 * Y is in the center …" so each face stays locked across the whole scene.
 *
 * Pure sharp (no extra AI cost). Output is a JPEG Buffer the caller can pass
 * straight to submitSoraVideo via the existing imageUrl flow.
 */
import sharp from "sharp";

export type SheetCharacter = { name: string; portraitUrl: string };

const W = 1280;
const H = 720;
const PADDING = 24;
const NAME_BAR_H = 60;

async function fetchPortrait(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`portrait fetch ${res.status}: ${url.slice(0, 100)}`);
  return Buffer.from(await res.arrayBuffer());
}

function nameBarSvg(text: string, width: number): Buffer {
  const safe = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return Buffer.from(`
    <svg width="${width}" height="${NAME_BAR_H}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${width}" height="${NAME_BAR_H}" fill="rgba(0,0,0,0.85)"/>
      <text x="${width / 2}" y="${NAME_BAR_H / 2 + 8}" font-family="sans-serif" font-size="22" font-weight="bold" fill="white" text-anchor="middle">${safe}</text>
    </svg>
  `);
}

/**
 * Build a 1280x720 character-sheet JPEG. Up to 4 characters fit comfortably
 * side-by-side; 5+ get scaled down (still legible).
 */
export async function buildCharacterSheet(chars: SheetCharacter[]): Promise<Buffer> {
  if (chars.length === 0) throw new Error("no characters to sheet");

  // Reserve room: each character gets a column. Inner image area H minus
  // the name bar.
  const cols = chars.length;
  const colW = Math.floor((W - PADDING * (cols + 1)) / cols);
  const imgH = H - PADDING * 2 - NAME_BAR_H;

  // Canvas — neutral dark background
  const canvas = sharp({
    create: { width: W, height: H, channels: 3, background: { r: 24, g: 24, b: 28 } },
  });

  // Process each portrait + name bar
  type Composite = { input: Buffer; left: number; top: number };
  const layers: Composite[] = [];
  for (let i = 0; i < chars.length; i++) {
    const buf = await fetchPortrait(chars[i].portraitUrl);
    const resized = await sharp(buf)
      .resize(colW, imgH, { fit: "cover", position: "centre" })
      .jpeg({ quality: 92 })
      .toBuffer();
    const left = PADDING + i * (colW + PADDING);
    const top = PADDING;
    layers.push({ input: resized, left, top });

    const bar = await sharp(nameBarSvg(chars[i].name, colW)).png().toBuffer();
    layers.push({ input: bar, left, top: top + imgH });
  }

  return await canvas.composite(layers).jpeg({ quality: 90 }).toBuffer();
}

/**
 * Build a human-readable "the reference image shows X on the left, Y in the
 * middle, Z on the right" string for the Sora prompt.
 */
export function describeSheetLayout(chars: SheetCharacter[]): string {
  if (chars.length === 0) return "";
  if (chars.length === 1) return `The reference image is a portrait of ${chars[0].name} — render them with this exact face, hair, skin tone, and wardrobe.`;
  const positions = chars.length === 2
    ? ["on the left", "on the right"]
    : chars.length === 3
    ? ["on the left", "in the center", "on the right"]
    : chars.map((_, i) => `at position ${i + 1} from the left`);
  const parts = chars.map((c, i) => `${c.name} (${positions[i]})`);
  return `The reference image is a CHARACTER SHEET showing ${chars.length} cast members side-by-side: ${parts.join(", ")}. Each name appears on a black bar below their portrait. Render every character in the video with EXACTLY the face, hair, skin tone, and wardrobe shown for them in the reference. Do not swap or merge identities.`;
}
