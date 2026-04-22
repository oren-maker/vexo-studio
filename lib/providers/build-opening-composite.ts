/**
 * Build a single-reference composite image for a multi-character opening.
 *
 * Sora only accepts ONE reference image for i2v identity lock. With 2+ cast
 * members, picking just the first character's portrait invents faces for the
 * rest. Instead we crop the front panel from each character's sheet and
 * compose them side-by-side on one 1280x720 canvas (existing
 * buildCharacterSheet helper). Sora gets all N faces in one reference and
 * the prompt is pre-pended with a layout description so the model knows
 * "X is on the left, Y is in the center..." and won't swap identities.
 */

import sharp from "sharp";
import { put as putBlob } from "@vercel/blob";
import { buildCharacterSheet, describeSheetLayout } from "../character-sheet";

type CharacterRef = {
  id: string;
  name: string;
  media: Array<{ fileUrl: string; metadata: unknown }>;
};

async function fetchBuf(url: string): Promise<Buffer> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ${r.status}: ${url.slice(0, 90)}`);
  return Buffer.from(await r.arrayBuffer());
}

// Extract the top-left panel (front view) of an 8-panel character sheet.
// The sheet layout from generate-gallery is 4 cols × 2 rows; the front view
// is always the top-left quadrant. Returns a Buffer + a tmp data URL
// suitable for feeding back into buildCharacterSheet.
async function frontPanelUrl(ref: CharacterRef, openingId: string): Promise<string | null> {
  const chosen = ref.media.find((m) => (m.metadata as { angle?: string } | null)?.angle === "front") ?? ref.media[0];
  if (!chosen) return null;
  const angle = (chosen.metadata as { angle?: string } | null)?.angle;
  if (angle !== "sheet") return chosen.fileUrl; // already a single portrait

  // Crop the top-left quadrant from the sheet and upload it as its own blob
  // so buildCharacterSheet can refetch it by URL. Caching the front panel as
  // a separate blob also speeds up future openings that use the same char.
  const src = await fetchBuf(chosen.fileUrl);
  const meta = await sharp(src).metadata();
  if (!meta.width || !meta.height) return chosen.fileUrl;
  const panelW = Math.floor(meta.width / 4);
  const panelH = Math.floor(meta.height / 2);
  const cropped = await sharp(src)
    .extract({ left: 0, top: 0, width: panelW, height: panelH })
    .jpeg({ quality: 92 })
    .toBuffer();
  const blob = await putBlob(
    `character-front-panels/${ref.id}-${Date.now()}.jpg`,
    cropped,
    { access: "public", contentType: "image/jpeg", addRandomSuffix: true },
  );
  return blob.url;
}

export type CompositeResult = {
  compositeUrl: string;
  layoutDescription: string;
  characterCount: number;
};

export async function buildOpeningCompositeReference(
  openingId: string,
  characters: CharacterRef[],
): Promise<CompositeResult> {
  if (characters.length === 0) {
    throw new Error("buildOpeningCompositeReference: no characters");
  }

  // Resolve each character's best single-person portrait URL.
  // Limit to 6 characters so the composite stays legible at 1280x720.
  const ordered = characters.slice(0, 6);
  const resolved: { name: string; portraitUrl: string }[] = [];
  for (const c of ordered) {
    const portrait = await frontPanelUrl(c, openingId);
    if (portrait) resolved.push({ name: c.name, portraitUrl: portrait });
  }
  if (resolved.length === 0) {
    throw new Error("buildOpeningCompositeReference: no portraits available");
  }

  const jpeg = await buildCharacterSheet(resolved);
  const blob = await putBlob(
    `opening-composites/${openingId}-${Date.now()}.jpg`,
    jpeg,
    { access: "public", contentType: "image/jpeg", addRandomSuffix: true },
  );

  const layoutDescription = describeSheetLayout(resolved);
  return {
    compositeUrl: blob.url,
    layoutDescription,
    characterCount: resolved.length,
  };
}
