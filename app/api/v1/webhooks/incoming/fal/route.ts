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
    const openingId = url.searchParams.get("openingId");
    const submittedDuration = Number(url.searchParams.get("duration") ?? "0");
    const submittedModel = url.searchParams.get("model") as VideoModel | null;
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

        const reportedSec = Number(result?.video?.duration ?? result?.duration ?? 0);
        const finalSec = reportedSec > 0 && reportedSec <= 20
          ? reportedSec
          : (submittedDuration > 0 && submittedDuration <= 20 ? submittedDuration : 5);
        const modelForMeta = submittedModel ?? ((typeof result?.model === "string" && result.model.includes("kling")) ? "kling" : "seedance");
        const ratePerSec: Record<string, number> = { seedance: 0.124, kling: 0.056, "veo3-fast": 0.40, "veo3-pro": 0.75 };
        const costUsd = +(ratePerSec[modelForMeta] * finalSec).toFixed(4);

        await prisma.asset.create({
          data: {
            projectId, entityType: "SCENE", entityId: sceneId, assetType: "VIDEO",
            fileUrl: videoUrl, mimeType: "video/mp4", status: "READY",
            metadata: {
              provider: "fal",
              requestId,
              model: modelForMeta,
              durationSeconds: finalSec,
              costUsd,
            } as object,
          },
        });
        await prisma.scene.update({ where: { id: sceneId }, data: { status: "VIDEO_REVIEW" } });

        // Charge wallet — reuses the same finalSec + model we computed for Asset.metadata
        if (orgId) {
          await chargeUsd({
            organizationId: orgId, projectId,
            entityType: "SCENE", entityId: sceneId,
            providerName: "fal.ai", category: "GENERATION",
            description: `Video · ${modelForMeta} · ${finalSec}s`,
            unitCost: priceVideo(modelForMeta as VideoModel, finalSec), quantity: 1,
            meta: { requestId, model: modelForMeta, durationSeconds: finalSec, reportedByProvider: reportedSec > 0 },
          });
        }
      }
    }

    if (openingId && videoUrl) {
      const opening = await prisma.seasonOpening.findUnique({
        where: { id: openingId },
        include: { season: { include: { series: { include: { project: true } } } } },
      });
      if (opening) {
        const projectId = opening.season.series.projectId;
        const reportedSec = Number(result?.video?.duration ?? result?.duration ?? 0);
        const finalSec = reportedSec > 0 && reportedSec <= 20
          ? reportedSec
          : (submittedDuration > 0 && submittedDuration <= 20 ? submittedDuration : opening.duration);
        const modelForMeta = submittedModel ?? opening.model;
        const costUsd = priceVideo(modelForMeta as VideoModel, finalSec);
        await prisma.seasonOpening.update({
          where: { id: openingId },
          data: { videoUrl, status: "READY", cost: (opening.cost ?? 0) + costUsd },
        });
        await prisma.asset.create({
          data: {
            projectId, entityType: "SEASON_OPENING", entityId: openingId, assetType: "VIDEO",
            fileUrl: videoUrl, mimeType: "video/mp4", status: "READY",
            metadata: { provider: "fal", requestId, model: modelForMeta, durationSeconds: finalSec, costUsd } as object,
          },
        });
      }
    }

    return NextResponse.json({ received: true, sceneId, openingId, hadVideo: !!videoUrl });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
