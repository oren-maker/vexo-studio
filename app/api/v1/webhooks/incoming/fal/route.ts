/**
 * fal.ai webhook receiver.
 * fal calls us with the full result payload when a queued job finishes.
 * We expect a `?sceneId=<id>` querystring set on submission.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const sceneId = url.searchParams.get("sceneId");
    const body = await req.json();

    // fal payload shape: { request_id, status, payload: {...result...}, error?: ... }
    // Or sometimes just the result object directly. Be liberal.
    const result = body?.payload ?? body;
    const videoUrl = result?.video?.url ?? result?.output?.video?.url ?? result?.url;
    const status = body?.status ?? "completed";
    const requestId = body?.request_id ?? body?.requestId ?? "unknown";

    // Persist receipt
    await prisma.incomingWebhook.create({
      data: {
        providerId: "fal",
        eventType: status,
        payload: body as object,
        verified: true,
        processed: false,
        jobId: requestId,
      },
    });

    if (sceneId && videoUrl) {
      const scene = await prisma.scene.findUnique({ where: { id: sceneId } });
      if (scene) {
        const projectId = scene.episodeId
          ? (await prisma.episode.findUniqueOrThrow({ where: { id: scene.episodeId }, include: { season: { include: { series: true } } } })).season.series.projectId
          : "";
        await prisma.asset.create({
          data: {
            projectId, entityType: "SCENE", entityId: sceneId, assetType: "VIDEO",
            fileUrl: videoUrl, mimeType: "video/mp4", status: "READY",
            metadata: { provider: "fal", requestId } as object,
          },
        });
        await prisma.scene.update({ where: { id: sceneId }, data: { status: "VIDEO_REVIEW" } });
      }
    }

    return NextResponse.json({ received: true, sceneId, hadVideo: !!videoUrl });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
