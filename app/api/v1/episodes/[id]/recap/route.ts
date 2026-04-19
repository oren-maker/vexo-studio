// Episode recap generator.
// Builds a short "previously on…" clip from each scene's bridgeFrameUrl.
// Each frame gets a fixed duration (default 2s), concatenated into an MP4
// via ffmpeg + libx264. Result uploads to Vercel Blob and is saved as an
// Asset(entityType="EPISODE", assetType="RECAP").
//
// Prerequisites: scenes must be APPROVED (that's when bridgeFrameUrl gets
// populated). Scenes without a bridge frame are skipped.

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Body = { perFrameSec?: number };

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;

    const body: Body = await req.json().catch(() => ({}));
    const perFrameSec = Math.max(1, Math.min(5, Number(body.perFrameSec) || 2));

    const episode = await prisma.episode.findUnique({
      where: { id: params.id },
      include: {
        season: { select: { series: { select: { projectId: true } } } },
        scenes: {
          orderBy: { sceneNumber: "asc" },
          select: { id: true, sceneNumber: true, memoryContext: true, status: true },
        },
      },
    });
    if (!episode) throw Object.assign(new Error("episode not found"), { statusCode: 404 });

    // Pull bridge frames in scene order — that's the sharpest single-frame
    // summary we already paid to compute at approval time.
    const frameUrls: { sceneNumber: number; url: string }[] = [];
    for (const s of episode.scenes) {
      const mem = (s.memoryContext as Record<string, unknown> | null) ?? {};
      const url = typeof mem.bridgeFrameUrl === "string" ? mem.bridgeFrameUrl : null;
      if (url) frameUrls.push({ sceneNumber: s.sceneNumber, url });
    }
    if (frameUrls.length === 0) {
      throw Object.assign(new Error("no bridge frames yet — approve scenes first"), { statusCode: 400 });
    }

    const fs = await import("fs/promises");
    const path = await import("path");
    const os = await import("os");
    const { execSync } = await import("child_process");

    const ts = Date.now();
    const work = await fs.mkdtemp(path.join(os.tmpdir(), `recap-${ts}-`));

    // Download each frame to disk, resizing to 1280x720 for consistency.
    const sharp = (await import("sharp")).default;
    const framePaths: string[] = [];
    for (let i = 0; i < frameUrls.length; i++) {
      const res = await fetch(frameUrls[i].url);
      if (!res.ok) continue;
      const raw = Buffer.from(await res.arrayBuffer());
      const resized = await sharp(raw).resize(1280, 720, { fit: "cover" }).jpeg({ quality: 88 }).toBuffer();
      const p = path.join(work, `frame-${String(i).padStart(3, "0")}.jpg`);
      await fs.writeFile(p, resized);
      framePaths.push(p);
    }

    if (framePaths.length === 0) {
      throw Object.assign(new Error("failed to download any bridge frames"), { statusCode: 502 });
    }

    // Build concat list: each frame → N seconds.
    const listPath = path.join(work, "list.txt");
    const lines: string[] = [];
    for (const p of framePaths) {
      lines.push(`file '${p}'`);
      lines.push(`duration ${perFrameSec}`);
    }
    // Last entry must repeat the final file without duration (ffmpeg quirk)
    lines.push(`file '${framePaths[framePaths.length - 1]}'`);
    await fs.writeFile(listPath, lines.join("\n"));

    const outPath = path.join(work, "recap.mp4");
    const ffmpegInstaller = (await import("@ffmpeg-installer/ffmpeg")) as unknown as { path: string };
    const ffmpegBin = ffmpegInstaller?.path || "ffmpeg";
    try { await fs.chmod(ffmpegBin, 0o755); } catch { /* ignore */ }

    // concat demuxer → h264 mp4. 30fps, crf 23 for reasonable size.
    try {
      execSync(
        `"${ffmpegBin}" -y -f concat -safe 0 -i "${listPath}" -vsync vfr -vf "fps=30,format=yuv420p" -c:v libx264 -preset medium -crf 23 "${outPath}"`,
        { stdio: ["ignore", "ignore", "pipe"] },
      );
    } catch (e: any) {
      const stderr = e?.stderr ? String(e.stderr).slice(-400) : "";
      throw new Error(`ffmpeg failed: ${stderr || e?.message}`);
    }

    const buf = await fs.readFile(outPath);
    const { put } = await import("@vercel/blob");
    const blob = await put(`recaps/episode-${params.id}-${ts}.mp4`, buf, { access: "public", contentType: "video/mp4" });

    const totalDurationSec = frameUrls.length * perFrameSec;
    const asset = await prisma.asset.create({
      data: {
        projectId: episode.season?.series?.projectId ?? "",
        entityType: "EPISODE",
        entityId: params.id,
        assetType: "RECAP",
        fileUrl: blob.url,
        mimeType: "video/mp4",
        durationSeconds: totalDurationSec,
        sizeBytes: BigInt(buf.length),
        status: "READY",
        metadata: { sceneCount: frameUrls.length, perFrameSec, generatedAt: new Date().toISOString() },
      },
    });

    // Cleanup tmp dir best-effort
    fs.rm(work, { recursive: true, force: true }).catch(() => {});

    return ok({
      url: blob.url,
      assetId: asset.id,
      sceneCount: frameUrls.length,
      durationSec: totalDurationSec,
      sizeBytes: buf.length,
    });
  } catch (e) { return handleError(e); }
}
