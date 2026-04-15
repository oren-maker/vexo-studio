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

    const character = await prisma.character.findFirst({
      where: { id: params.id, project: { organizationId: ctx.organizationId } },
      include: { project: true, media: { orderBy: { createdAt: "asc" } } },
    });
    if (!character) throw Object.assign(new Error("character not found"), { statusCode: 404 });

    const doneKeys = new Set<string>(
      character.media
        .map((m) => (m.metadata as { angle?: string } | null)?.angle)
        .filter((x): x is string => !!x),
    );
    const pending = ANGLES.filter((a) => !doneKeys.has(a.key));
    if (pending.length === 0) return ok({ characterId: character.id, generated: 0, done: true });

    const want = body.count === "rest" ? pending.length : Math.min(body.count ?? 1, pending.length);
    const toRun = pending.slice(0, want);

    const seriesTone = [
      character.project.description ? `Series premise: ${character.project.description}.` : "",
      character.project.genreTag ? `Genre: ${character.project.genreTag}.` : "",
    ].filter(Boolean).join(" ");

    const basePrompt = [
      character.appearance || `${character.gender ?? ""} ${character.ageRange ?? ""} character named ${character.name}`.trim(),
      character.wardrobeRules ? `Wardrobe: ${character.wardrobeRules}.` : "",
      character.personality ? `Personality: ${character.personality}.` : "",
      seriesTone,
      PHOTOREAL_DIRECTIVE,
      "High-detail cinematic photography. Consistent identity across all angles.",
    ].filter(Boolean).join(" ");

    const created: { angle: string; url: string }[] = [];
    const errors: { angle: string; error: string }[] = [];

    for (const a of toRun) {
      try {
        const prompt = `${basePrompt} Camera: ${a.desc}.`;
        const img = await generateImage({ prompt, negativePrompt: PHOTOREAL_NEGATIVE, aspectRatio: "1:1", model: "nano-banana" });
        const media = await prisma.characterMedia.create({
          data: {
            characterId: character.id,
            mediaType: "IMAGE",
            fileUrl: img.imageUrl,
            metadata: { angle: a.key, prompt, provider: "fal.ai/nano-banana" } as any,
          },
        });
        created.push({ angle: a.key, url: img.imageUrl });
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
