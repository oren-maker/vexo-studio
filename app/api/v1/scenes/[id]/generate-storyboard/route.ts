import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { CostStrategy, StyleEngine } from "@/lib/services";
import { generateImage, priceImage } from "@/lib/providers/fal";
import { fetchReferencePrompts, buildReferenceContext } from "@/lib/providers/vexo-learn";
import { chargeUsd } from "@/lib/billing";
import { handleError, ok } from "@/lib/route-utils";
import { PHOTOREAL_DIRECTIVE, PHOTOREAL_NEGATIVE } from "@/lib/photoreal";

export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 60;

const Body = z.object({
  imageModel: z.enum(["nano-banana"]).default("nano-banana"),
  aspectRatio: z.enum(["16:9", "9:16", "1:1"]).default("16:9"),
}).partial();

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "generate_assets"); if (f) return f;
    const body = req.headers.get("content-length") && Number(req.headers.get("content-length")) > 0
      ? Body.parse(await req.json()) : Body.parse({});

    const scene = await prisma.scene.findFirst({
      where: { id: params.id },
      include: { frames: { orderBy: { orderIndex: "asc" } } },
    });
    if (!scene) throw Object.assign(new Error("scene not found"), { statusCode: 404 });
    if (!scene.episodeId) throw Object.assign(new Error("scene has no episode"), { statusCode: 400 });

    const ep = await prisma.episode.findUniqueOrThrow({
      where: { id: scene.episodeId },
      include: { season: { include: { series: true } }, characters: { include: { character: { include: { media: { orderBy: { createdAt: "asc" } } } } } } },
    });
    const projectId = ep.season.series.projectId;

    // Resolve characters appearing in THIS scene. First look in memoryContext (names the
    // scene planner wrote), else fall back to all episode-linked characters.
    const sceneMemory = (scene.memoryContext as { characters?: string[] } | null) ?? {};
    const sceneCharNames = (sceneMemory.characters ?? []).map((n) => n.toLowerCase().trim());
    const episodeChars = ep.characters.map((ec) => ec.character);
    const charactersForScene = sceneCharNames.length > 0
      ? episodeChars.filter((c) => sceneCharNames.includes(c.name.toLowerCase().trim()))
      : episodeChars;

    // Hard block: if this scene has named characters but any of them has no gallery image,
    // refuse to generate the storyboard. Consistency requires reference images.
    const missingGallery = charactersForScene.filter((c) => c.media.length === 0);
    if (charactersForScene.length > 0 && missingGallery.length > 0) {
      throw Object.assign(
        new Error(`Cannot generate storyboard — these characters are missing gallery images (generate them first): ${missingGallery.map((c) => c.name).join(", ")}`),
        { statusCode: 400 },
      );
    }

    // Pick the most useful reference image per character: prefer the front angle.
    const charReferences = charactersForScene.map((c) => {
      const front = c.media.find((m) => (m.metadata as { angle?: string } | null)?.angle === "front") ?? c.media[0];
      return { name: c.name, url: front?.fileUrl };
    }).filter((r): r is { name: string; url: string } => !!r.url);
    const referenceImageUrls = charReferences.map((r) => r.url);
    const identityLine = charReferences.length > 0
      ? `SAME CHARACTERS AS THE REFERENCE IMAGES: ${charReferences.map((r) => r.name).join(", ")}. Match their faces, hair, wardrobe and build EXACTLY across every frame.`
      : "";
    const stylePrompt = await StyleEngine.generateStyleConstraints(projectId);
    const estimate = await CostStrategy.estimateSceneStoryboardCost(scene.id);

    await prisma.scene.update({
      where: { id: scene.id },
      data: { status: "STORYBOARD_GENERATING", styleConstraints: stylePrompt ? { prompt: stylePrompt } : undefined },
    });

    const generated: Array<{ frameId: string; imageUrl: string | null; error?: string }> = [];
    const frames = scene.frames.length > 0 ? scene.frames : [];

    if (frames.length > 0 && process.env.FAL_API_KEY) {
      // Limit parallelism to avoid rate limits + serverless timeout
      for (const frame of frames) {
        try {
          const basePrompt = frame.imagePrompt;
          if (!basePrompt) { generated.push({ frameId: frame.id, imageUrl: null, error: "no prompt" }); continue; }
          const refs = await fetchReferencePrompts(basePrompt, 3);
          const referenceCtx = buildReferenceContext(refs);
          const prompt = [
            PHOTOREAL_DIRECTIVE,
            basePrompt,
            identityLine,
            stylePrompt && `Style: ${stylePrompt}`,
            referenceCtx,
          ].filter(Boolean).join("\n\n");
          const r = await generateImage({
            prompt,
            negativePrompt: [frame.negativePrompt, PHOTOREAL_NEGATIVE].filter(Boolean).join(", "),
            aspectRatio: body.aspectRatio,
            model: body.imageModel,
            referenceImageUrls,
          });
          await prisma.sceneFrame.update({ where: { id: frame.id }, data: { generatedImageUrl: r.imageUrl, status: "READY" } });
          await prisma.asset.create({
            data: { projectId, entityType: "FRAME", entityId: frame.id, assetType: "IMAGE", fileUrl: r.imageUrl, mimeType: "image/jpeg", status: "READY", metadata: { provider: "fal", model: body.imageModel ?? "nano-banana", referencePromptIds: refs.map((r) => r.externalId).filter(Boolean) } },
          });
          await chargeUsd({
            organizationId: ctx.organizationId, projectId,
            entityType: "FRAME", entityId: frame.id,
            providerName: "fal.ai", category: "GENERATION",
            description: `Image · ${body.imageModel ?? "nano-banana"} · ${body.aspectRatio ?? "16:9"}`,
            unitCost: priceImage(body.imageModel ?? "nano-banana"), quantity: 1,
            userId: ctx.user.id, meta: { sceneId: scene.id, model: body.imageModel ?? "nano-banana", references: charReferences.map((r) => r.name) },
          });
          generated.push({ frameId: frame.id, imageUrl: r.imageUrl });
        } catch (e) {
          generated.push({ frameId: frame.id, imageUrl: null, error: (e as Error).message });
        }
      }
    }

    await prisma.scene.update({ where: { id: scene.id }, data: { status: "STORYBOARD_REVIEW" } });
    return ok({ jobId: `inline-${Date.now()}`, estimate, framesGenerated: generated.filter((g) => g.imageUrl).length, framesTotal: frames.length, model: body.imageModel ?? "nano-banana", details: generated });
  } catch (e) { return handleError(e); }
}
