/**
 * POST /api/v1/scenes/[id]/approve
 *   Sets scene.status = "APPROVED" AND extracts the last frame of the
 *   scene's primary (or latest) video asset, uploads it to Vercel Blob,
 *   and saves the URL on both THIS scene (`bridgeFrameUrl`) and the
 *   NEXT scene in the episode (`seedImageUrl`) so future generate-video
 *   calls for N+1 can pass it as i2v seed.
 *
 *   Extraction is best-effort — if ffmpeg / blob / asset is missing,
 *   the approval still succeeds. Cost of the extraction is logged as a
 *   GENERATION CostEntry (tiny amount — compute only).
 *
 * DELETE /api/v1/scenes/[id]/approve
 *   Reverts approval: flips status back to VIDEO_REVIEW. The
 *   bridgeFrameUrl stays saved (it's a pure asset — reverting the
 *   approval shouldn't delete work already done).
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";
import { chargeUsd } from "@/lib/billing";

export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 60;

async function extractLastFramesToBlob(opts: {
  videoUrl: string;
  soraVideoId: string | null;
  openaiKey: string | null;
}): Promise<{ urls: string[]; bytes: number } | { error: string }> {
  try {
    const fs = await import("fs/promises");
    const path = await import("path");
    const os = await import("os");
    const { execSync } = await import("child_process");

    // Download the MP4 once.
    let buf: Buffer;
    if (opts.soraVideoId && opts.openaiKey) {
      const res = await fetch(`https://api.openai.com/v1/videos/${opts.soraVideoId}/content`, {
        headers: { Authorization: `Bearer ${opts.openaiKey}` },
      });
      if (!res.ok) return { error: `OpenAI video fetch ${res.status}` };
      buf = Buffer.from(await res.arrayBuffer());
    } else {
      const res = await fetch(opts.videoUrl);
      if (!res.ok) return { error: `video fetch ${res.status}` };
      buf = Buffer.from(await res.arrayBuffer());
    }

    const ts = Date.now();
    const tmp = path.join(os.tmpdir(), `approve-${ts}.mp4`);
    await fs.writeFile(tmp, buf);

    const ffmpegInstaller = (await import("@ffmpeg-installer/ffmpeg")) as unknown as { path: string; version: string };
    const ffmpegBin = ffmpegInstaller?.path || "ffmpeg";
    try { await fs.chmod(ffmpegBin, 0o755); } catch { /* ignore */ }

    // Extract FOUR sharp frames near the end of the clip — not just one.
    // Each frame is the sharpest keyframe in its own 1-second window.
    // Windows (seconds from end): [-4→-3], [-3→-2], [-2→-1], [-1→0].
    // Oren asked for 4 so the UI can show the last beats of motion, and
    // the BEST of them can seed the next scene.
    const windows = [
      { start: 4, end: 3, label: "t-4s" },
      { start: 3, end: 2, label: "t-3s" },
      { start: 2, end: 1, label: "t-2s" },
      { start: 1, end: 0, label: "t-1s" },
    ];
    const framePaths: string[] = [];
    try {
      for (const w of windows) {
        const out = path.join(os.tmpdir(), `approve-${ts}-${w.label}.jpg`);
        // -sseof -W.start seeks to W.start seconds before end.
        // `thumbnail=30` samples 30 keyframes in the ~1s window and
        // picks the sharpest. `unsharp` compensates for Sora softness.
        execSync(
          `"${ffmpegBin}" -sseof -${w.start} -skip_frame nokey -i "${tmp}" -vf "thumbnail=30,unsharp=5:5:1.5:5:5:0" -frames:v 1 -q:v 1 "${out}" -y`,
          { stdio: ["ignore", "ignore", "pipe"] },
        );
        framePaths.push(out);
      }
    } catch (e: any) {
      const stderr = e?.stderr ? String(e.stderr).slice(-600) : "";
      const msg = String(e?.message || e);
      await fs.unlink(tmp).catch(() => {});
      for (const fp of framePaths) await fs.unlink(fp).catch(() => {});
      return { error: `ffmpeg: ${msg.slice(0, 300)} | stderr: ${stderr}` };
    }

    // Resize + upload each to Blob.
    const sharp = (await import("sharp")).default;
    const { put } = await import("@vercel/blob");
    const urls: string[] = [];
    let totalBytes = 0;
    for (let i = 0; i < framePaths.length; i++) {
      const raw = await fs.readFile(framePaths[i]);
      const resized = await sharp(raw).resize(1280, 720, { fit: "cover" }).jpeg({ quality: 90 }).toBuffer();
      const blob = await put(`bridge-frames/scene-${ts}-${i + 1}.jpg`, resized, {
        access: "public",
        contentType: "image/jpeg",
      });
      urls.push(blob.url);
      totalBytes += resized.length;
    }

    // Cleanup
    await fs.unlink(tmp).catch(() => {});
    for (const fp of framePaths) await fs.unlink(fp).catch(() => {});

    return { urls, bytes: totalBytes };
  } catch (e: any) {
    return { error: String(e?.message || e).slice(0, 200) };
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "approve_scene"); if (f) return f;

    const scene = await prisma.scene.findFirst({
      where: { id: params.id },
      include: { episode: { include: { season: { include: { series: { select: { projectId: true } } } } } } },
    });
    if (!scene) throw Object.assign(new Error("scene not found"), { statusCode: 404 });

    // 1) Flip status
    const updated = await prisma.scene.update({ where: { id: params.id }, data: { status: "APPROVED" } });

    // 2) Find the primary (or latest) video asset
    const assets = await prisma.asset.findMany({
      where: { entityType: "SCENE", entityId: params.id, assetType: "VIDEO", status: "READY" },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, fileUrl: true, metadata: true },
    });
    const primary = assets.find((a) => (a.metadata as { isPrimary?: boolean } | null)?.isPrimary) ?? assets[0];

    let bridgeFrameUrls: string[] = [];
    let bridgeFrameUrl: string | null = null;
    let bridgeCostUsd = 0;

    if (primary) {
      const meta = (primary.metadata as { soraVideoId?: string } | null) ?? {};
      const soraId = meta.soraVideoId ?? (primary.fileUrl.match(/[?&]id=(video_[^&]+)/) || [])[1] ?? null;
      const openaiKey = process.env.OPENAI_API_KEY?.replace(/\\n$/, "") ?? null;

      const extract = await extractLastFramesToBlob({
        videoUrl: primary.fileUrl,
        soraVideoId: soraId,
        openaiKey,
      });
      if ("urls" in extract) {
        bridgeFrameUrls = extract.urls;
        // The LAST of the four (t-1s) is the canonical bridge frame — it's
        // what seeds the next scene. The other three are kept for review.
        bridgeFrameUrl = bridgeFrameUrls[bridgeFrameUrls.length - 1] ?? null;
        // Cost scales with number of frames extracted + uploaded.
        // $0.002 per frame is a conservative estimate.
        bridgeCostUsd = +(0.002 * bridgeFrameUrls.length).toFixed(4);

        // Save on THIS scene — both the array (new) and the single URL
        // (legacy, used as the i2v seed for the next scene).
        const thisMem = (scene.memoryContext as object | null) ?? {};
        await prisma.scene.update({
          where: { id: params.id },
          data: { memoryContext: { ...thisMem, bridgeFrameUrl, bridgeFrameUrls } as object },
        });

        // Propagate the CANONICAL (last) bridge frame to the NEXT scene
        // so it can be used as i2v seed.
        if (scene.episodeId != null && scene.sceneNumber != null) {
          const nextScene = await prisma.scene.findFirst({
            where: { episodeId: scene.episodeId, sceneNumber: scene.sceneNumber + 1 },
          });
          if (nextScene) {
            const nextMem = (nextScene.memoryContext as object | null) ?? {};
            await prisma.scene.update({
              where: { id: nextScene.id },
              data: { memoryContext: { ...nextMem, seedImageUrl: bridgeFrameUrl } as object },
            });
          }
        }

        // Log the extraction cost
        const projectId = scene.episode?.season.series.projectId;
        if (projectId) {
          await chargeUsd({
            organizationId: ctx.organizationId,
            projectId,
            entityType: "SCENE",
            entityId: scene.id,
            providerName: "Vercel",
            category: "GENERATION",
            description: `Bridge frame extraction · ${bridgeFrameUrls.length} frames (ffmpeg + sharp + Blob) · ~${Math.round(extract.bytes / 1024)}KB`,
            unitCost: bridgeCostUsd,
            quantity: 1,
            userId: ctx.user.id,
          }).catch(() => {});
        }
      } else {
        // Non-fatal — log the reason in sceneLog so Oren can see what happened
        await (prisma as any).sceneLog.create({
          data: {
            sceneId: scene.id,
            action: "bridge_frame_skipped",
            actor: `user:${ctx.user.id}`,
            actorName: ctx.user.fullName ?? ctx.user.email,
            details: { reason: extract.error },
          },
        }).catch(() => {});
      }
    }

    await (prisma as any).sceneLog.create({
      data: {
        sceneId: params.id,
        action: "scene_approved",
        actor: `user:${ctx.user.id}`,
        actorName: ctx.user.fullName ?? ctx.user.email,
        details: { bridgeFrameUrl, bridgeFrameUrls, bridgeCostUsd },
      },
    }).catch(() => {});

    return ok({ ...updated, bridgeFrameUrl, bridgeFrameUrls, bridgeCostUsd });
  } catch (e) { return handleError(e); }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "approve_scene"); if (f) return f;
    const updated = await prisma.scene.update({ where: { id: params.id }, data: { status: "VIDEO_REVIEW" } });
    await (prisma as any).sceneLog.create({
      data: {
        sceneId: params.id,
        action: "scene_unapproved",
        actor: `user:${ctx.user.id}`,
        actorName: ctx.user.fullName ?? ctx.user.email,
      },
    }).catch(() => {});
    return ok(updated);
  } catch (e) { return handleError(e); }
}
