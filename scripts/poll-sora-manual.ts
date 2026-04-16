/**
 * Manually poll a stuck Sora opening job and flip the opening to READY if done.
 */
import { PrismaClient } from "@prisma/client";
import { pollSoraVideo, priceSora, type SoraModel } from "../lib/providers/openai-sora";

const p = new PrismaClient();
const OPENING_ID = "cmnzgpsu1000511asr87f093i";

(async () => {
  const opening = await p.seasonOpening.findUnique({
    where: { id: OPENING_ID },
    include: { season: { include: { series: { select: { projectId: true } } } } },
  });
  if (!opening) { console.error("opening not found"); process.exit(1); }
  console.log(`opening=${opening.id} status=${opening.status} falRequestId=${opening.falRequestId}`);
  if (!opening.falRequestId) { console.error("no falRequestId"); process.exit(1); }

  const res = await pollSoraVideo(opening.falRequestId);
  console.log(`Sora poll: status=${res.status} progress=${res.progress ?? "?"}%`);
  if (res.status !== "completed") {
    console.log(res.status === "failed" ? "Job FAILED." : "Still processing — try again later.");
    if (res.status === "failed" && (res as any).error) console.log(`error: ${(res as any).error}`);
    process.exit(0);
  }

  const proxyUrl = `/api/v1/videos/sora-proxy?id=${encodeURIComponent(opening.falRequestId)}`;
  await p.seasonOpening.update({
    where: { id: opening.id },
    data: { status: "READY", videoUrl: proxyUrl, videoUri: opening.falRequestId },
  });
  const projectId = opening.season.series.projectId;
  await p.asset.create({
    data: {
      projectId, entityType: "SEASON_OPENING", entityId: opening.id, assetType: "VIDEO",
      fileUrl: proxyUrl, mimeType: "video/mp4", status: "READY",
      metadata: {
        provider: "openai-sora",
        model: opening.model,
        durationSeconds: opening.duration,
        costUsd: priceSora(opening.model as SoraModel, opening.duration),
        soraVideoId: opening.falRequestId,
      } as any,
    },
  }).catch((e) => console.warn("asset create failed:", e.message));
  console.log(`✅ Opening set to READY. videoUrl=${proxyUrl}`);
  await p.$disconnect();
})();
