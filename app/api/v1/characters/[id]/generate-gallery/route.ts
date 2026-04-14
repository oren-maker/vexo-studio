/**
 * Generate a 5-angle image gallery for a character via fal nano-banana.
 * Saves each as CharacterMedia + charges wallet.
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { generateImage, priceImage } from "@/lib/providers/fal";
import { chargeUsd } from "@/lib/billing";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 60;

const ANGLES = [
  { key: "front",        desc: "front-facing portrait, neutral expression, eye-level, full upper body" },
  { key: "three-quarter", desc: "3/4 angle, relaxed natural pose, soft cinematic lighting" },
  { key: "profile",       desc: "side profile, full face silhouette, same wardrobe & lighting" },
  { key: "back",          desc: "back view, same wardrobe, showing hairstyle and outfit from behind" },
  { key: "action",        desc: "dynamic action pose, full body, in an environment that fits the character" },
];

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "generate_assets"); if (f) return f;

    const character = await prisma.character.findFirst({
      where: { id: params.id, project: { organizationId: ctx.organizationId } },
      include: { project: true },
    });
    if (!character) throw Object.assign(new Error("character not found"), { statusCode: 404 });

    const basePrompt = [
      character.appearance || `${character.gender ?? ""} ${character.ageRange ?? ""} character named ${character.name}`.trim(),
      character.wardrobeRules ? `Wardrobe: ${character.wardrobeRules}.` : "",
      character.personality ? `Personality cue: ${character.personality}.` : "",
      "High-detail cinematic photography, consistent identity across all angles.",
    ].filter(Boolean).join(" ");

    const created: { angle: string; url: string }[] = [];
    const errors: { angle: string; error: string }[] = [];

    for (const a of ANGLES) {
      try {
        const prompt = `${basePrompt} Camera: ${a.desc}.`;
        const img = await generateImage({ prompt, aspectRatio: "1:1", model: "nano-banana" });
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

    return ok({ characterId: character.id, generated: created.length, images: created, errors });
  } catch (e) { return handleError(e); }
}
