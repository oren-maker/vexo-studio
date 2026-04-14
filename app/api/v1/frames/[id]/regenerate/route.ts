/**
 * Regenerate a single storyboard frame using the scene's character gallery
 * as identity references — guarantees the same faces as the rest of the scene.
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { generateImage, priceImage } from "@/lib/providers/fal";
import { chargeUsd } from "@/lib/billing";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 30;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "generate_assets"); if (f) return f;
    if (!process.env.FAL_API_KEY) throw Object.assign(new Error("FAL_API_KEY not set"), { statusCode: 500 });

    const frame = await prisma.sceneFrame.findUnique({
      where: { id: params.id },
      include: {
        scene: {
          include: {
            episode: {
              include: {
                season: { include: { series: true } },
                characters: { include: { character: { include: { media: { orderBy: { createdAt: "asc" } } } } } },
              },
            },
          },
        },
      },
    });
    if (!frame) throw Object.assign(new Error("frame not found"), { statusCode: 404 });
    if (!frame.imagePrompt) throw Object.assign(new Error("frame has no prompt"), { statusCode: 400 });
    if (!frame.scene.episode) throw Object.assign(new Error("frame outside episode"), { statusCode: 400 });
    const projectId = frame.scene.episode.season.series.projectId;

    const project = await prisma.project.findFirst({ where: { id: projectId, organizationId: ctx.organizationId } });
    if (!project) throw Object.assign(new Error("not authorized"), { statusCode: 403 });

    const sceneMem = (frame.scene.memoryContext as { characters?: string[] } | null) ?? {};
    const sceneNames = (sceneMem.characters ?? []).map((n) => n.toLowerCase().trim());
    const episodeChars = frame.scene.episode.characters.map((ec) => ec.character);
    const charactersForScene = sceneNames.length > 0
      ? episodeChars.filter((c) => sceneNames.includes(c.name.toLowerCase().trim()))
      : episodeChars;

    const missing = charactersForScene.filter((c) => c.media.length === 0);
    if (charactersForScene.length > 0 && missing.length > 0) {
      throw Object.assign(
        new Error(`לא ניתן לייצר מחדש — לדמויות אין תמונות בגלריה: ${missing.map((c) => c.name).join(", ")}`),
        { statusCode: 400 },
      );
    }

    const refs = charactersForScene.map((c) => {
      const front = c.media.find((m) => (m.metadata as { angle?: string } | null)?.angle === "front") ?? c.media[0];
      return { name: c.name, url: front?.fileUrl };
    }).filter((r): r is { name: string; url: string } => !!r.url);
    const referenceImageUrls = refs.map((r) => r.url);
    const identityLine = refs.length > 0
      ? `SAME CHARACTERS AS THE REFERENCE IMAGES: ${refs.map((r) => r.name).join(", ")}. Match their faces, hair, wardrobe and build EXACTLY.`
      : "";

    const prompt = [frame.imagePrompt, identityLine].filter(Boolean).join("\n\n");
    const r = await generateImage({
      prompt,
      negativePrompt: frame.negativePrompt ?? undefined,
      aspectRatio: "16:9",
      model: "nano-banana",
      referenceImageUrls,
    });

    await prisma.sceneFrame.update({ where: { id: frame.id }, data: { generatedImageUrl: r.imageUrl, status: "READY" } });
    const unitCost = priceImage("nano-banana", 1);
    await chargeUsd({
      organizationId: ctx.organizationId,
      projectId,
      entityType: "FRAME",
      entityId: frame.id,
      providerName: "fal.ai",
      category: "GENERATION",
      description: `Regen frame · scene ${frame.scene.sceneNumber}.${frame.orderIndex + 1} · with ${refs.length} char refs`,
      unitCost,
      userId: ctx.user.id,
      meta: { regeneration: true, characterRefs: refs.map((r) => r.name) },
    }).catch(() => {});

    return ok({ frameId: frame.id, imageUrl: r.imageUrl, cost: unitCost, references: refs.map((r) => r.name) });
  } catch (e) { return handleError(e); }
}
