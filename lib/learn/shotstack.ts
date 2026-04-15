// Shotstack edit-list builder + render dispatcher + polling.
// Server-only (uses SHOTSTACK_API_KEY).

import { prisma } from "./db";

const STAGE = process.env.SHOTSTACK_ENV || "stage";
const BASE = `https://api.shotstack.io/edit/${STAGE}`;

type ShotstackClip = {
  asset: { type: "video" | "audio"; src: string; trim?: number };
  start: number;
  length: number;
  transition?: { in?: string; out?: string };
};

export async function renderWithShotstack(jobId: string): Promise<void> {
  const apiKey = process.env.SHOTSTACK_API_KEY;
  if (!apiKey) throw new Error("SHOTSTACK_API_KEY missing");

  const job = await prisma.mergeJob.findUnique({
    where: { id: jobId },
    include: { clips: { orderBy: { order: "asc" } } },
  });
  if (!job) throw new Error("job not found");

  // Build the timeline
  let cursor = 0;
  const videoTrack: ShotstackClip[] = job.clips.map((c) => {
    const trimStart = c.trimStart ?? 0;
    const trimEnd = c.trimEnd ?? null;
    const sourceLen = c.durationSec ?? 8;
    const length = (trimEnd ?? sourceLen) - trimStart;
    const transitionType = c.transition === "fade" ? "fade" : c.transition === "dissolve" ? "carouselLeft" : null;
    const clip: ShotstackClip = {
      asset: { type: "video", src: c.blobUrl, ...(trimStart > 0 ? { trim: trimStart } : {}) },
      start: cursor,
      length,
      ...(transitionType ? { transition: { in: transitionType, out: transitionType } } : {}),
    };
    cursor += length;
    return clip;
  });

  const tracks: any[] = [{ clips: videoTrack }];

  if (job.audioMode === "track" && job.audioTrackUrl) {
    tracks.push({
      clips: [
        {
          asset: { type: "audio", src: job.audioTrackUrl, volume: 1 },
          start: 0,
          length: cursor,
        },
      ],
    });
  }

  const edit = {
    timeline: {
      background: "#000000",
      ...(job.audioMode === "mute" ? { soundtrack: undefined } : {}),
      tracks,
    },
    output: {
      format: "mp4",
      resolution: "hd",
      fps: 30,
    },
  };

  // Submit
  const submitRes = await fetch(`${BASE}/render`, {
    method: "POST",
    headers: { "x-api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify(edit),
  });
  if (!submitRes.ok) {
    const txt = await submitRes.text();
    throw new Error(`shotstack submit ${submitRes.status}: ${txt.slice(0, 300)}`);
  }
  const submitJson: any = await submitRes.json();
  const renderId: string = submitJson.response?.id;
  if (!renderId) throw new Error(`shotstack: no render id in response`);

  await prisma.mergeJob.update({
    where: { id: jobId },
    data: { shotstackId: renderId },
  });

  // Poll status
  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 4000));
    const statusRes = await fetch(`${BASE}/render/${renderId}`, {
      headers: { "x-api-key": apiKey },
    });
    if (!statusRes.ok) continue;
    const j: any = await statusRes.json();
    const r = j.response;
    if (r?.status === "done") {
      await prisma.mergeJob.update({
        where: { id: jobId },
        data: {
          status: "complete",
          outputUrl: r.url,
          outputDuration: cursor,
          completedAt: new Date(),
          costUsd: cursor * 0.005, // rough — Shotstack stage is free, prod ~$0.005/sec
        },
      });
      return;
    }
    if (r?.status === "failed") {
      throw new Error(`shotstack render failed: ${r.error || "unknown"}`);
    }
  }
  throw new Error("shotstack polling timeout");
}
