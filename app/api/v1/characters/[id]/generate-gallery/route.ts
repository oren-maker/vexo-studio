/**
 * Generate character gallery images via fal nano-banana.
 *
 *   POST { count?: number, onlyMissing?: boolean }
 *
 *   count=1 (default) -> one angle. Subsequent calls pick up the next missing angle.
 *   count=4 or 'rest' -> fill the remaining angles.
 *
 * Prompts are seeded from the project's premise/description so every character
 * stays in the series' tone.
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
  count: z.union([z.number().int().min(1).max(5), z.literal("rest")]).optional(),
  // When true, deletes all existing gallery images first then regenerates the
  // full set with identity-lock from a single freshly-made front portrait.
  regenerate: z.boolean().optional(),
}).partial();

const ANGLES = [
  { key: "front",         desc: "front-facing portrait, neutral expression, eye-level, full upper body" },
  { key: "three-quarter", desc: "3/4 angle, relaxed natural pose, soft cinematic lighting" },
  { key: "profile",       desc: "side profile, full face silhouette, same wardrobe & lighting" },
  { key: "back",          desc: "back view, same wardrobe, showing hairstyle and outfit from behind" },
  { key: "action",        desc: "dynamic action pose, full body, environment that fits the character" },
];

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "generate_assets"); if (f) return f;

    const body = req.headers.get("content-length") && Number(req.headers.get("content-length")) > 0
      ? Body.parse(await req.json()) : Body.parse({});

    let character = await prisma.character.findFirst({
      where: { id: params.id, project: { organizationId: ctx.organizationId } },
      include: { project: true, media: { orderBy: { createdAt: "asc" } } },
    });
    if (!character) throw Object.assign(new Error("character not found"), { statusCode: 404 });

    // Wipe-and-redo path: delete every existing media row so the loop below
    // generates a fresh front portrait first, then locks every other angle to
    // it. Fixes "two different faces under the same name" — earlier galleries
    // generated each angle independently from text only.
    if (body.regenerate) {
      await prisma.characterMedia.deleteMany({ where: { characterId: character.id } });
      character = { ...character, media: [] };
    }

    const doneKeys = new Set<string>(
      character.media
        .map((m) => (m.metadata as { angle?: string } | null)?.angle)
        .filter((x): x is string => !!x),
    );
    const pending = ANGLES.filter((a) => !doneKeys.has(a.key));
    if (pending.length === 0) return ok({ characterId: character.id, generated: 0, done: true });

    // ALWAYS generate front first when missing — every other angle uses it as
    // the identity-lock reference. Without this, nano-banana invents a new
    // face per angle and the gallery looks like 5 different people.
    const wantRaw = body.count === "rest" ? pending.length : Math.min(body.count ?? 1, pending.length);
    const frontPending = pending.find((a) => a.key === "front");
    const orderedPending = frontPending ? [frontPending, ...pending.filter((a) => a.key !== "front")] : pending;
    const toRun = orderedPending.slice(0, wantRaw);

    const seriesTone = [
      character.project.description ? `Series premise: ${character.project.description}.` : "",
      character.project.genreTag ? `Genre: ${character.project.genreTag}.` : "",
    ].filter(Boolean).join(" ");

    // ALWAYS lead with the hard identity facts (gender + age + name) — the
    // `appearance` field is often just vague adjectives and would otherwise
    // shadow these. Without an explicit gender, nano-banana sometimes flips
    // the character (e.g. "Dr. Ethan Kim" rendered as a woman because the
    // appearance text said only "Intelligent, slightly disheveled").
    const genderClause = character.gender ? `${character.gender.toLowerCase()} ` : "";
    const ageClause = character.ageRange ? `aged ${character.ageRange} years old` : "";
    const identityPreamble = `A ${genderClause}character named ${character.name}, ${ageClause}.`.replace(/\s+/g, " ").trim();

    const basePrompt = [
      identityPreamble,
      character.appearance ? `Appearance: ${character.appearance}.` : "",
      character.wardrobeRules ? `Wardrobe: ${character.wardrobeRules}.` : "",
      character.personality ? `Personality: ${character.personality}.` : "",
      seriesTone,
      PHOTOREAL_DIRECTIVE,
      "High-detail cinematic photography. Consistent identity across all angles. Do NOT render any text, captions, labels, or watermarks anywhere in the image.",
    ].filter(Boolean).join(" ");

    const created: { angle: string; url: string }[] = [];
    const errors: { angle: string; error: string }[] = [];

    // Collect reference images as we go. nano-banana accepts up to 3 refs —
    // passing multiple angles (front + three-quarter + profile) dramatically
    // improves identity lock for back/action shots vs passing just the front.
    // Seed with any images that already exist on the character (front first).
    const priorityOrder = ["front", "three-quarter", "profile", "back", "action"];
    const refUrls: string[] = [];
    for (const key of priorityOrder) {
      const m = character.media.find((x) => (x.metadata as { angle?: string } | null)?.angle === key);
      if (m?.fileUrl) refUrls.push(m.fileUrl);
    }

    for (const a of toRun) {
      try {
        const isFront = a.key === "front" && refUrls.length === 0;
        // For every non-seed shot, send up to 3 existing reference images.
        const referenceImageUrls = !isFront && refUrls.length > 0 ? refUrls.slice(0, 3) : undefined;
        const identityClause = referenceImageUrls
          ? ` SAME PERSON AS THE ${referenceImageUrls.length} REFERENCE IMAGE${referenceImageUrls.length > 1 ? "S" : ""} — match face shape, eye color, skin tone, hair color & length, facial hair, age, and exact wardrobe pixel-for-pixel. Do not change the person's identity.`
          : "";
        const prompt = `${basePrompt} Camera: ${a.desc}.${identityClause}`;
        const img = await generateImage({ prompt, negativePrompt: PHOTOREAL_NEGATIVE, aspectRatio: "1:1", model: "nano-banana", referenceImageUrls });
        const media = await prisma.characterMedia.create({
          data: {
            characterId: character.id,
            mediaType: "IMAGE",
            fileUrl: img.imageUrl,
            metadata: { angle: a.key, prompt, provider: "fal.ai/nano-banana" } as any,
          },
        });
        created.push({ angle: a.key, url: img.imageUrl });
        // Feed the new image back into the reference pool so later angles in
        // the same loop see it too. Keep the most identity-strong shots first.
        refUrls.unshift(img.imageUrl);
        await chargeUsd({
          organizationId: ctx.organizationId,
          projectId: character.projectId,
          entityType: "CHARACTER_MEDIA",
          entityId: media.id,
          providerName: "fal.ai",
          category: "GENERATION",
          description: `Character gallery ${a.key}: ${character.name}`,
          unitCost: priceImage("nano-banana", 1),
          userId: ctx.user.id,
        }).catch(() => {});
      } catch (e) {
        errors.push({ angle: a.key, error: (e as Error).message.slice(0, 200) });
      }
    }

    const remaining = pending.length - created.length;
    return ok({
      characterId: character.id,
      generated: created.length,
      images: created,
      errors,
      remaining,
      done: remaining === 0,
    });
  } catch (e) { return handleError(e); }
}
