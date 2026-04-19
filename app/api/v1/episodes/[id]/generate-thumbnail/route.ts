import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, isAuthResponse, requirePermission } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";
import { generateImageFromPrompt } from "@/lib/learn/gemini-image";

export const runtime = "nodejs";
export const maxDuration = 120;

// Auto-generate an episode thumbnail from its scenes' scriptText.
// Builds a single image prompt out of the first 3 scene summaries +
// series title + cast, sends to nano-banana, saves as Asset(entityType
// =EPISODE, assetType=THUMBNAIL). Updates the episode's thumbnailUrl too
// if that column exists — otherwise only the Asset row is created.

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "generate_assets"); if (f) return f;

    const episode = await prisma.episode.findUnique({
      where: { id: params.id },
      include: {
        season: { include: { series: { select: { projectId: true, title: true } } } },
        scenes: { orderBy: { sceneNumber: "asc" }, take: 3, select: { summary: true, scriptText: true, title: true } },
        characters: { include: { character: { select: { name: true, appearance: true } } } },
      },
    });
    if (!episode) throw Object.assign(new Error("episode not found"), { statusCode: 404 });

    const sceneHints = episode.scenes
      .map((s) => s.summary || s.scriptText?.slice(0, 200) || s.title)
      .filter(Boolean)
      .join(" · ");

    const castHints = episode.characters.slice(0, 3)
      .map((ec) => `${ec.character.name}${ec.character.appearance ? ` (${ec.character.appearance.slice(0, 80)})` : ""}`)
      .join("; ");

    const prompt = [
      `Episode thumbnail for "${episode.season.series.title ?? "untitled series"}", episode ${episode.episodeNumber}${episode.title ? ` — "${episode.title}"` : ""}.`,
      sceneHints ? `Key beats: ${sceneHints.slice(0, 500)}.` : "",
      castHints ? `Cast: ${castHints.slice(0, 400)}.` : "",
      "Cinematic key-art composition, dramatic lighting, shallow depth of field, photoreal (not illustrated), 16:9 framing, single subject dominant with environmental context, moody color grading. No text or logos — pure image.",
    ].filter(Boolean).join(" ");

    const img = await generateImageFromPrompt(prompt, undefined, "nano-banana");

    const asset = await prisma.asset.create({
      data: {
        projectId: episode.season.series.projectId,
        entityType: "EPISODE",
        entityId: params.id,
        assetType: "THUMBNAIL",
        fileUrl: img.blobUrl,
        thumbnailUrl: img.blobUrl,
        mimeType: "image/png",
        status: "READY",
        metadata: { engine: "nano-banana", model: img.model, usdCost: img.usdCost, generatedAt: new Date().toISOString(), prompt: prompt.slice(0, 500) },
      },
    });

    return ok({
      assetId: asset.id,
      url: img.blobUrl,
      usdCost: img.usdCost,
      promptPreview: prompt.slice(0, 300),
    });
  } catch (e) { return handleError(e); }
}
