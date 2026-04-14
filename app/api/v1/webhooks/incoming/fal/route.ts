/**
 * fal.ai webhook receiver.
 * fal calls us with the full result payload when a queued job finishes.
 * We expect a `?sceneId=<id>` querystring set on submission.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { chargeUsd } from "@/lib/billing";
import { priceVideo, type VideoModel } from "@/lib/providers/fal";

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
        const ep = scene.episodeId ? await prisma.episode.findUnique({ where: { id: scene.episodeId }, include: { season: { include: { series: { include: { project: true } } } } } }) : null;
        const projectId = ep?.season.series.projectId ?? "";
        const orgId = ep?.season.series.project.organizationId;

        await prisma.asset.create({
          data: {
            projectId, entityType: "SCENE", entityId: sceneId, assetType: "VIDEO",
            fileUrl: videoUrl, mimeType: "video/mp4", status: "READY",
            metadata: { provider: "fal", requestId } as object,
          },
        });
        await prisma.scene.update({ where: { id: sceneId }, data: { status: "VIDEO_REVIEW" } });

        // Charge wallet — fal payload may include duration. Default 5s if unknown.
        if (orgId) {
          const seconds = result?.video?.duration ?? result?.duration ?? scene.targetDurationSeconds ?? 5;
          // Detect model from URL or metadata; default to seedance
          const modelHint: VideoModel = (typeof result?.model === "string" && result.model.includes("kling")) ? "kling" : "seedance";
          await chargeUsd({
            organizationId: orgId, projectId,
            entityType: "SCENE", entityId: sceneId,
            providerName: "fal.ai", category: "GENERATION",
            description: `Video · ${modelHint} · ${seconds}s`,
            unitCost: priceVideo(modelHint, seconds), quantity: 1,
            meta: { requestId },
          });
        }
      }
    }

    return NextResponse.json({ received: true, sceneId, hadVideo: !!videoUrl });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
