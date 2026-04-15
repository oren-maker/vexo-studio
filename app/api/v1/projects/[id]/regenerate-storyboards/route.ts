/**
 * Regenerate every storyboard frame in the project, this time with the
 * character gallery images as references so identities are consistent.
 *
 * Workflow:
 *  - For each scene linked to an episode in this project:
 *    - Resolve characters via scene.memoryContext.characters (fallback to episode's cast)
 *    - Skip the scene if any character has no gallery image (character-first policy)
 *    - Re-run image generation for every frame with referenceImageUrls
 *    - chargeUsd per frame (cost saved via CostEntry + wallet deduct)
 *  - Deadline-aware (55s): stops mid-project and returns `pending` so the UI
 *    can re-invoke. Partial work is already saved.
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { assertProjectInOrg } from "@/lib/plan-limits";
import { generateImage, priceImage } from "@/lib/providers/fal";
import { chargeUsd } from "@/lib/billing";
import { handleError, ok } from "@/lib/route-utils";
import { PHOTOREAL_DIRECTIVE, PHOTOREAL_NEGATIVE } from "@/lib/photoreal";

export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "generate_assets"); if (f) return f;
    await assertProjectInOrg(params.id, ctx.organizationId);

    if (!process.env.FAL_API_KEY) throw Object.assign(new Error("FAL_API_KEY not configured"), { statusCode: 500 });

    const characters = await prisma.character.findMany({
      where: { projectId: params.id },
      include: { media: { orderBy: { createdAt: "asc" } } },
    });
    const charByName = new Map(characters.map((c) => [c.name.toLowerCase().trim(), c]));

    // Pull every scene in every episode in this project
    const scenes = await prisma.scene.findMany({
      where: {
        episode: { season: { series: { projectId: params.id } } },
      },
      include: {
        frames: { orderBy: { orderIndex: "asc" } },
        episode: { include: { characters: { include: { character: { include: { media: true } } } } } },
      },
      orderBy: [{ episodeId: "asc" }, { sceneNumber: "asc" }],
    });

    const deadline = Date.now() + 55_000;
    const report: { sceneId: string; sceneNumber: number; episodeId: string | null; generated: number; total: number; skipped?: string; cost: number }[] = [];
    let totalFrames = 0, totalCost = 0, pending = 0;

    for (const scene of scenes) {
      if (Date.now() > deadline) { pending += scene.frames.length; continue; }
      if (scene.frames.length === 0) continue;

      // Resolve this scene's characters
      const mem = (scene.memoryContext as { characters?: string[] } | null) ?? {};
      const sceneNames = (mem.characters ?? []).map((n) => n.toLowerCase().trim());
      const episodeCast = scene.episode?.characters.map((ec) => ec.character) ?? [];
      const resolved = (sceneNames.length > 0
        ? sceneNames.map((n) => charByName.get(n)).filter((c): c is NonNullable<typeof c> => !!c)
        : episodeCast);

      const missingGallery = resolved.filter((c) => !c.media || c.media.length === 0);
      if (resolved.length > 0 && missingGallery.length > 0) {
        report.push({ sceneId: scene.id, sceneNumber: scene.sceneNumber, episodeId: scene.episodeId, generated: 0, total: scene.frames.length, skipped: `missing gallery: ${missingGallery.map((c) => c.name).join(", ")}`, cost: 0 });
        continue;
      }

      const refsPicked = resolved.map((c) => {
        const mediaList = (c as { media?: { fileUrl: string; metadata?: unknown }[] }).media ?? [];
        const front = mediaList.find((m) => (m.metadata as { angle?: string } | null)?.angle === "front") ?? mediaList[0];
        return { name: c.name, url: front?.fileUrl };
      }).filter((r): r is { name: string; url: string } => !!r.url);
      const referenceImageUrls = refsPicked.map((r) => r.url);
      const identityLine = refsPicked.length > 0
        ? `SAME CHARACTERS AS THE REFERENCE IMAGES: ${refsPicked.map((r) => r.name).join(", ")}. Match their faces, hair, wardrobe and build EXACTLY across every frame.`
        : "";

      let sceneGenerated = 0, sceneCost = 0;
      for (const frame of scene.frames) {
        if (Date.now() > deadline) { pending++; continue; }
        if (!frame.imagePrompt) continue;
        try {
          const prompt = [PHOTOREAL_DIRECTIVE, frame.imagePrompt, identityLine].filter(Boolean).join("\n\n");
          const r = await generateImage({
            prompt,
            negativePrompt: [frame.negativePrompt, PHOTOREAL_NEGATIVE].filter(Boolean).join(", "),
            aspectRatio: "16:9",
            model: "nano-banana",
            referenceImageUrls,
          });
          await prisma.sceneFrame.update({ where: { id: frame.id }, data: { generatedImageUrl: r.imageUrl, status: "READY" } });
          const unitCost = priceImage("nano-banana", 1);
          await chargeUsd({
            organizationId: ctx.organizationId,
            projectId: params.id,
            entityType: "FRAME",
            entityId: frame.id,
            providerName: "fal.ai",
            category: "GENERATION",
            description: `Regen frame · ${scene.sceneNumber}.${frame.orderIndex + 1} · nano-banana w/ refs`,
            unitCost,
            userId: ctx.user.id,
            meta: { sceneId: scene.id, regeneration: true, references: refsPicked.map((r) => r.name) },
          }).catch(() => {});
          sceneGenerated++;
          sceneCost += unitCost;
        } catch (e) {
          console.warn("regen frame failed", frame.id, (e as Error).message);
        }
      }

      report.push({ sceneId: scene.id, sceneNumber: scene.sceneNumber, episodeId: scene.episodeId, generated: sceneGenerated, total: scene.frames.length, cost: +sceneCost.toFixed(4) });
      totalFrames += sceneGenerated;
      totalCost += sceneCost;
    }

    return ok({
      projectId: params.id,
      scenesProcessed: report.length,
      framesGenerated: totalFrames,
      totalCost: +totalCost.toFixed(4),
      pending,
      report,
    });
  } catch (e) { return handleError(e); }
}
