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

async function extractLastFrameToBlob(opts: {
  videoUrl: string;
  soraVideoId: string | null;
  openaiKey: string | null;
}): Promise<{ url: string; bytes: number } | { error: string }> {
  try {
    const fs = await import("fs/promises");
    const path = await import("path");
    const os = await import("os");
    const { execSync } = await import("child_process");

    // Download the MP4. For Sora-proxy URLs we go directly to OpenAI using
    // the key, because the proxy requires session auth. For CloudFront or
    // other direct URLs we fetch them as-is.
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

    const tmp = path.join(os.tmpdir(), `approve-${Date.now()}.mp4`);
    const tmpFrame = path.join(os.tmpdir(), `approve-${Date.now()}.jpg`);
    await fs.writeFile(tmp, buf);
    try {
      // Vercel Lambda doesn't ship ffmpeg on PATH. Use
      // @ffmpeg-installer/ffmpeg — unlike ffmpeg-static which downloads
      // the binary at postinstall (unreliable on Vercel), this package
      // ships the binary pre-bundled for every platform in the tarball.
      const ffmpegInstaller = (await import("@ffmpeg-installer/ffmpeg")) as unknown as { path: string; version: string };
      const ffmpegBin = ffmpegInstaller?.path || "ffmpeg";
      // Ensure the bundled binary is executable — Next.js's file-tracing
      // preserves the file but not always its permissions, so `chmod +x`
      // defensively. Cheap no-op if already set.
      try { await fs.chmod(ffmpegBin, 0o755); } catch { /* ignore */ }
      // Pick the SHARPEST frame in the last ~5s of the video, then run
      // an unsharp filter to compensate for Sora's natural softness and
      // any residual motion-blur. Pipeline:
      //   -sseof -5             seek to 5 s before end (wider window)
      //   -skip_frame nokey     decode ONLY I-frames (keyframes — always
      //                         sharper than inter-frames, no motion blur)
      //   thumbnail=80          sample 80 keyframes, pick the most
      //                         representative (score = lowest diff
      //                         from local average → stable frames win)
      //   unsharp=5:5:1.5:5:5:0 soft mask 5×5 luma / 5×5 chroma with
      //                         +1.5/+0 amount → perceptibly crisper
      //                         without introducing noise
      //   -q:v 1                highest JPEG quality (1 = best, 31 = worst)
      execSync(
        `"${ffmpegBin}" -sseof -5 -skip_frame nokey -i "${tmp}" -vf "thumbnail=80,unsharp=5:5:1.5:5:5:0" -frames:v 1 -q:v 1 "${tmpFrame}" -y`,
        { stdio: ["ignore", "ignore", "pipe"] },
      );
    } catch (e: any) {
      const stderr = e?.stderr ? String(e.stderr).slice(-600) : "";
      const msg = String(e?.message || e);
      await fs.unlink(tmp).catch(() => {});
      return { error: `ffmpeg: ${msg.slice(0, 300)} | stderr: ${stderr}` };
    }

    const frameRaw = await fs.readFile(tmpFrame);
    const sharp = (await import("sharp")).default;
    const resized = await sharp(frameRaw).resize(1280, 720, { fit: "cover" }).jpeg({ quality: 90 }).toBuffer();

    const { put } = await import("@vercel/blob");
    const blob = await put(`bridge-frames/scene-${Date.now()}.jpg`, resized, {
      access: "public",
      contentType: "image/jpeg",
    });

    await fs.unlink(tmp).catch(() => {});
    await fs.unlink(tmpFrame).catch(() => {});
    return { url: blob.url, bytes: resized.length };
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

    let bridgeFrameUrl: string | null = null;
    let bridgeCostUsd = 0;

    if (primary) {
      const meta = (primary.metadata as { soraVideoId?: string } | null) ?? {};
      const soraId = meta.soraVideoId ?? (primary.fileUrl.match(/[?&]id=(video_[^&]+)/) || [])[1] ?? null;
      const openaiKey = process.env.OPENAI_API_KEY?.replace(/\\n$/, "") ?? null;

      const extract = await extractLastFrameToBlob({
        videoUrl: primary.fileUrl,
        soraVideoId: soraId,
        openaiKey,
      });
      if ("url" in extract) {
        bridgeFrameUrl = extract.url;
        // Cost = compute + tiny blob storage. Flat $0.002 per extraction is
        // a conservative upper bound (real ffmpeg time is ms, blob is ~100KB).
        bridgeCostUsd = 0.002;

        // Save on THIS scene
        const thisMem = (scene.memoryContext as object | null) ?? {};
        await prisma.scene.update({
          where: { id: params.id },
          data: { memoryContext: { ...thisMem, bridgeFrameUrl } as object },
        });

        // Propagate to NEXT scene if it exists
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
            description: `Bridge frame extraction (ffmpeg + sharp + Blob) · ~${Math.round(extract.bytes / 1024)}KB`,
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
        details: { bridgeFrameUrl, bridgeCostUsd },
      },
    }).catch(() => {});

    return ok({ ...updated, bridgeFrameUrl, bridgeCostUsd });
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
