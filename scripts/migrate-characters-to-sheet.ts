// One-shot migration: wipe every legacy CharacterMedia row and generate
// fresh single-image character sheets for every character.
//
// Old format: 5 angle images (front/3-4/profile/back/action) + optional
//   post-hoc composite.
// New format: 1 nano-banana image (metadata.angle="sheet") with all
//   turnarounds, expressions and wardrobe details in a single 16:9 canvas.
//
// Cost per character: ~$0.04 (one nano-banana call via fal).
// Run from repo root:
//   DATABASE_URL="..." GEMINI_API_KEY="..." FAL_KEY="..." npx tsx scripts/migrate-characters-to-sheet.ts

import { PrismaClient } from "@prisma/client";
import { generateImage } from "../lib/providers/fal";
import { PHOTOREAL_DIRECTIVE, PHOTOREAL_NEGATIVE } from "../lib/photoreal";

const p = new PrismaClient();

function buildSheetPrompt(c: any): string {
  const genderClause = c.gender ? `${String(c.gender).toLowerCase()} ` : "";
  const ageClause = c.ageRange ? `aged ${c.ageRange} years old` : "";
  const identityPreamble = `${genderClause}character named ${c.name}, ${ageClause}`.replace(/\s+/g, " ").trim();
  const seriesTone = [
    c.project?.description ? `Series premise: ${c.project.description}.` : "",
    c.project?.genreTag ? `Genre: ${c.project.genreTag}.` : "",
  ].filter(Boolean).join(" ");

  return [
    `PROFESSIONAL 3D ANIMATION CHARACTER SHEET of a ${identityPreamble}.`,
    c.appearance ? `APPEARANCE: ${c.appearance}.` : "",
    c.wardrobeRules ? `WARDROBE: ${c.wardrobeRules}.` : "",
    c.personality ? `PERSONALITY: ${c.personality}.` : "",
    seriesTone,
    "LAYOUT — SINGLE IMAGE with clearly divided panels showing:",
    "1. Full body turnaround in the TOP ROW: front view, 3/4 view, side profile, and back view — all full body, neutral T-pose, same lighting, same wardrobe",
    "2. BOTTOM ROW: face close-up with neutral expression, face close-up with signature expression (smile or determination), hand detail, and costume detail (boots/accessories)",
    "3. LABEL each panel with small clean sans-serif text at the bottom of that panel: 'Front', 'Left Profile', 'Right Profile', 'Back View', 'Face Close-up', 'Expression', 'Hand Detail', 'Costume Detail'",
    "STYLE: Pixar/Disney-quality stylized 3D animation character design sheet.",
    "Clean neutral studio background (soft light gray gradient), even flat lighting, sharp focus on the character.",
    "IDENTITY: the SAME PERSON across every panel — identical face shape, eye color, skin tone, hair color and length, exact wardrobe in every angle.",
    "Aspect ratio 16:9, high detail, crisp rendering, grid clearly visible.",
    PHOTOREAL_DIRECTIVE,
  ].filter(Boolean).join(" ");
}

async function main() {
  const characters = await p.character.findMany({
    include: { project: true, media: { orderBy: { createdAt: "asc" } } },
  });
  console.log(`[migrate] ${characters.length} characters total`);

  const withMedia = characters.filter((c) => c.media.length > 0);
  const withoutSheet = characters.filter((c) => !c.media.some((m: any) => m.metadata?.angle === "sheet"));
  console.log(`[migrate] ${withMedia.length} have at least one media row · ${withoutSheet.length} need a fresh sheet`);
  console.log(`[migrate] Estimated cost: $${(withoutSheet.length * 0.04).toFixed(2)}\n`);

  let created = 0;
  let failed = 0;
  for (let i = 0; i < withoutSheet.length; i++) {
    const c = withoutSheet[i];
    const label = `[${i + 1}/${withoutSheet.length}] ${c.project?.name ?? "(no-project)"} / ${c.name}`;
    try {
      process.stdout.write(`${label} … `);
      // 1. Wipe all existing media
      const deleted = await p.characterMedia.deleteMany({ where: { characterId: c.id } });
      // 2. Generate the new sheet
      const prompt = buildSheetPrompt(c);
      const img = await generateImage({
        prompt,
        negativePrompt: PHOTOREAL_NEGATIVE + ", multiple different people, inconsistent face, watermark, signature",
        aspectRatio: "16:9",
        model: "nano-banana",
      });
      // 3. Save the new row + cost entry so the UI/wallet can see the spend
      const media = await p.characterMedia.create({
        data: {
          characterId: c.id,
          mediaType: "IMAGE",
          fileUrl: img.imageUrl,
          metadata: {
            angle: "sheet",
            prompt: prompt.slice(0, 1500),
            provider: "fal.ai/nano-banana",
            layout: "8-panel",
            migration: "2026-04",
          } as any,
        },
      });
      const falProvider = await p.provider.findFirst({ where: { name: { contains: "fal", mode: "insensitive" } } });
      await p.costEntry.create({
        data: {
          entityType: "CHARACTER_MEDIA",
          entityId: media.id,
          costCategory: "GENERATION",
          description: `Character sheet: ${c.name}`,
          unitCost: 0.04,
          quantity: 1,
          totalCost: 0.04,
          sourceType: "GENERATION",
          projectId: c.projectId,
          providerId: falProvider?.id ?? null,
        },
      });
      console.log(`✓ deleted=${deleted.count} sheet=${img.imageUrl.slice(-60)}`);
      created++;
    } catch (e: any) {
      console.log(`✗ ${String(e?.message || e).slice(0, 150)}`);
      failed++;
    }
  }

  console.log(`\n[migrate] done · created=${created} failed=${failed} skipped=${characters.length - withoutSheet.length}`);
  await p.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
