/**
 * Generate a SINGLE character sheet image via nano-banana.
 *
 *   POST { regenerate?: boolean }
 *
 * New model (2026-04 refactor): instead of 5 separate angle images (front /
 * 3-4 / profile / back / action) we produce ONE composite "character sheet"
 * in a single nano-banana call. Benefits:
 *
 * - Identity consistency: all angles come from one model invocation → same
 *   face/hair/wardrobe guaranteed. Multi-call generation kept flipping
 *   gender/features across angles.
 * - Video API compatibility: Sora / VEO / fal accept one reference image.
 *   The sheet IS the reference — no post-hoc compositing needed.
 * - ~5× cheaper (1 image instead of 5).
 *
 * Stored as CharacterMedia with metadata.angle="sheet" so legacy 5-angle
 * records still render, but new characters use the sheet-first UI.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { generateImage, priceImage } from "@/lib/providers/fal";
import { chargeUsd } from "@/lib/billing";
import { handleError, ok } from "@/lib/route-utils";
import { PHOTOREAL_DIRECTIVE, PHOTOREAL_NEGATIVE } from "@/lib/photoreal";

export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 60;

const Body = z.object({
  // Wipe existing media and regenerate a fresh sheet. Default: only generate
  // when no sheet exists.
  regenerate: z.boolean().optional(),
}).partial();

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "generate_assets"); if (f) return f;

    const body = req.headers.get("content-length") && Number(req.headers.get("content-length")) > 0
      ? Body.parse(await req.json()) : Body.parse({});

    const character = await prisma.character.findFirst({
      where: { id: params.id, project: { organizationId: ctx.organizationId } },
      include: { project: true, media: { orderBy: { createdAt: "desc" } } },
    });
    if (!character) throw Object.assign(new Error("character not found"), { statusCode: 404 });

    // Check if a sheet already exists (unless regenerating)
    const existingSheet = character.media.find(
      (m) => (m.metadata as { angle?: string } | null)?.angle === "sheet",
    );
    if (existingSheet && !body.regenerate) {
      return ok({
        characterId: character.id,
        sheet: { url: existingSheet.fileUrl, existing: true },
        generated: 0,
      });
    }

    // Wipe everything if regenerating — the old 5-angle set is replaced by
    // a single sheet. Old rows would confuse the UI picker.
    if (body.regenerate) {
      await prisma.characterMedia.deleteMany({ where: { characterId: character.id } });
    }

    const seriesTone = [
      character.project.description ? `Series premise: ${character.project.description}.` : "",
      character.project.genreTag ? `Genre: ${character.project.genreTag}.` : "",
    ].filter(Boolean).join(" ");

    const genderClause = character.gender ? `${character.gender.toLowerCase()} ` : "";
    const ageClause = character.ageRange ? `aged ${character.ageRange} years old` : "";
    const identityPreamble = `${genderClause}character named ${character.name}, ${ageClause}`.replace(/\s+/g, " ").trim();

    // Character sheet prompt — one image, multiple panels, consistent identity.
    // nano-banana handles single-image multi-panel layouts well when we're
    // explicit about the grid structure.
    const sheetPrompt = [
      `PROFESSIONAL 3D ANIMATION CHARACTER SHEET of a ${identityPreamble}.`,
      character.appearance ? `APPEARANCE: ${character.appearance}.` : "",
      character.wardrobeRules ? `WARDROBE: ${character.wardrobeRules}.` : "",
      character.personality ? `PERSONALITY: ${character.personality}.` : "",
      seriesTone,
      "",
      "LAYOUT — SINGLE IMAGE with clearly divided panels showing:",
      "1. Full body turnaround in the TOP ROW: front view, 3/4 view, side profile, and back view — all full body, neutral T-pose, same lighting, same wardrobe",
      "2. BOTTOM ROW: face close-up with neutral expression, face close-up with signature expression (smile or determination), hand detail, and costume detail (boots/accessories)",
      "3. LABEL each panel with small clean sans-serif text at the bottom of that panel: 'Front', 'Left Profile', 'Right Profile', 'Back View', 'Face Close-up', 'Expression', 'Hand Detail', 'Costume Detail'",
      "",
      "STYLE: Pixar/Disney-quality stylized 3D animation character design sheet.",
      "Clean neutral studio background (soft light gray gradient), even flat lighting, sharp focus on the character.",
      "IDENTITY: the SAME PERSON across every panel — identical face shape, eye color, skin tone, hair color and length, exact wardrobe in every angle.",
      "Aspect ratio 16:9, high detail, crisp rendering, grid clearly visible.",
      PHOTOREAL_DIRECTIVE,
    ].filter(Boolean).join(" ");

    const img = await generateImage({
      prompt: sheetPrompt,
      negativePrompt: PHOTOREAL_NEGATIVE + ", multiple different people, inconsistent face, watermark, signature",
      aspectRatio: "16:9",
      model: "nano-banana",
    });

    const media = await prisma.characterMedia.create({
      data: {
        characterId: character.id,
        mediaType: "IMAGE",
        fileUrl: img.imageUrl,
        metadata: {
          angle: "sheet",
          prompt: sheetPrompt.slice(0, 1500),
          provider: "fal.ai/nano-banana",
          layout: "8-panel",
        } as any,
      },
    });

    await chargeUsd({
      organizationId: ctx.organizationId,
      projectId: character.projectId,
      entityType: "CHARACTER_MEDIA",
      entityId: media.id,
      providerName: "fal.ai",
      category: "GENERATION",
      description: `Character sheet: ${character.name}`,
      unitCost: priceImage("nano-banana", 1),
      userId: ctx.user.id,
    }).catch(() => {});

    return ok({
      characterId: character.id,
      sheet: { url: img.imageUrl, mediaId: media.id, existing: false },
      generated: 1,
    });
  } catch (e) { return handleError(e); }
}
