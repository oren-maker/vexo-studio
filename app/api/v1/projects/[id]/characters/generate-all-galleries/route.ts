/**
 * Generate 5-angle image galleries for every character in this project that
 * currently has NO images. Non-destructive: characters that already have media
 * are skipped entirely.
 *
 * Runs inline per-image via fal nano-banana. maxDuration 60s limits this to
 * ~4-5 characters per call on average. Returns a summary so the UI can
 * re-invoke for anything skipped by timeout.
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { assertProjectInOrg } from "@/lib/plan-limits";
import { generateImage, priceImage } from "@/lib/providers/fal";
import { chargeUsd } from "@/lib/billing";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 60;

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
    await assertProjectInOrg(params.id, ctx.organizationId);

    const characters = await prisma.character.findMany({
      where: { projectId: params.id },
      include: { media: true },
    });

    const deadline = Date.now() + 55_000; // leave ~5s headroom
    const processed: { id: string; name: string; generated: number; skipped?: boolean; reason?: string }[] = [];

    for (const c of characters) {
      if (c.media.length > 0) {
        processed.push({ id: c.id, name: c.name, generated: 0, skipped: true, reason: "already has media" });
        continue;
      }
      if (Date.now() > deadline) {
        processed.push({ id: c.id, name: c.name, generated: 0, skipped: true, reason: "deadline — rerun to continue" });
        continue;
      }

      const basePrompt = [
        c.appearance || `${c.gender ?? ""} ${c.ageRange ?? ""} character named ${c.name}`.trim(),
        c.wardrobeRules ? `Wardrobe: ${c.wardrobeRules}.` : "",
        c.personality ? `Personality cue: ${c.personality}.` : "",
        "High-detail cinematic photography, consistent identity across all angles.",
      ].filter(Boolean).join(" ");

      let made = 0;
      for (const a of ANGLES) {
        if (Date.now() > deadline) break;
        try {
          const prompt = `${basePrompt} Camera: ${a.desc}.`;
          const img = await generateImage({ prompt, aspectRatio: "1:1", model: "nano-banana" });
          const media = await prisma.characterMedia.create({
            data: {
              characterId: c.id,
              mediaType: "IMAGE",
              fileUrl: img.imageUrl,
              metadata: { angle: a.key, prompt, provider: "fal.ai/nano-banana" } as any,
            },
          });
          made++;
          await chargeUsd({
            organizationId: ctx.organizationId,
            projectId: params.id,
            entityType: "CHARACTER_MEDIA",
            entityId: media.id,
            providerName: "fal.ai",
            category: "GENERATION",
            description: `Character gallery ${a.key}: ${c.name}`,
            unitCost: priceImage("nano-banana", 1),
            userId: ctx.user.id,
          }).catch(() => {});
        } catch (e) {
          // swallow per-angle errors; keep the rest
          console.warn("gallery angle failed", c.name, a.key, (e as Error).message);
        }
      }
      processed.push({ id: c.id, name: c.name, generated: made });
    }

    const totalGenerated = processed.reduce((s, p) => s + p.generated, 0);
    const pending = processed.filter((p) => p.skipped && p.reason?.startsWith("deadline")).length;
    return ok({ processed, totalGenerated, pending });
  } catch (e) { return handleError(e); }
}
