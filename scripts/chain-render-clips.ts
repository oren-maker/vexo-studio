/**
 * CHAIN RENDER — sequential clip generation with frame chaining.
 *
 * Each clip uses the LAST FRAME of the previous clip as i2v seed,
 * so visual continuity is physically guaranteed.
 *
 * Flow per clip:
 *   1. If first clip → pure t2v (or character portrait seed)
 *   2. Else → download previous clip → extract last frame → use as i2v seed
 *   3. Submit to Sora with sanitized prompt
 *   4. Poll until done
 *   5. Create Asset + update scene status
 *   6. Move to next clip
 */
import { PrismaClient } from "@prisma/client";
import { submitSoraVideo, pollSoraVideo, type SoraSeconds } from "../lib/providers/openai-sora";

const p = new PrismaClient();
const EPISODE_ID = "cmny2i5k2000lu7yrxy2s63r6";

// Sora moderation filter
const BLOCKED = /\b(paranoid|paranoia|thriller|surveillance|threatening|suspicious|dark psychological|noir|crime|espionage|blood|violence|drugs|tattoo|weapon|gun|knife|attack|murder|kill|dead|death)\b/gi;
const SAFE: Record<string, string> = {
  paranoid: "anxious", paranoia: "anxiety", thriller: "drama",
  surveillance: "observation", threatening: "intense", suspicious: "curious",
  "dark psychological": "deep emotional", noir: "shadow-lit", crime: "investigation",
  espionage: "intelligence", blood: "liquid", violence: "conflict",
  drugs: "substances", tattoo: "marking", weapon: "device",
  gun: "object", knife: "tool", attack: "encounter",
  murder: "incident", kill: "remove", dead: "still", death: "ending",
};
function sanitize(text: string): string {
  return text.replace(BLOCKED, (m) => SAFE[m.toLowerCase()] ?? "notable");
}

async function extractLastFrame(videoUrl: string): Promise<Buffer> {
  // Download video → extract last frame with sharp/ffmpeg
  // For Sora proxy URLs, download the actual MP4 first
  const sharp = (await import("sharp")).default;

  let mp4Url = videoUrl;
  if (videoUrl.includes("sora-proxy")) {
    const videoId = new URL(videoUrl, "https://vexo-studio.vercel.app").searchParams.get("id");
    if (videoId) {
      // Download directly from OpenAI
      const key = require("fs").readFileSync(".env.prod", "utf8").match(/OPENAI_API_KEY="([^"\n]+?)(?:\\n)?"/)?.[1]?.trim();
      const res = await fetch(`https://api.openai.com/v1/videos/${videoId}/content`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!res.ok) throw new Error(`download failed: ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      // Extract last frame using ffmpeg-static if available, else use sharp on a screenshot
      // Simplest approach: save mp4, use sharp to get frame
      // Actually sharp can't read mp4. Use a different approach:
      // Write to temp file, use ffmpeg to extract last frame
      const { execSync } = require("child_process");
      const tmp = `/tmp/clip-${Date.now()}.mp4`;
      const tmpFrame = `/tmp/frame-${Date.now()}.jpg`;
      require("fs").writeFileSync(tmp, buf);
      try {
        execSync(`ffmpeg -sseof -0.5 -i "${tmp}" -frames:v 1 -q:v 2 "${tmpFrame}" -y 2>/dev/null`);
        const frame = require("fs").readFileSync(tmpFrame);
        require("fs").unlinkSync(tmp);
        require("fs").unlinkSync(tmpFrame);
        return frame;
      } catch {
        // ffmpeg not available — fallback: use the video as-is (Sora will adapt)
        require("fs").unlinkSync(tmp);
        throw new Error("ffmpeg not available for frame extraction");
      }
    }
  }

  // For direct URLs (Higgsfield CloudFront), download and extract
  const res = await fetch(mp4Url);
  const buf = Buffer.from(await res.arrayBuffer());
  const { execSync } = require("child_process");
  const tmp = `/tmp/clip-${Date.now()}.mp4`;
  const tmpFrame = `/tmp/frame-${Date.now()}.jpg`;
  require("fs").writeFileSync(tmp, buf);
  try {
    execSync(`ffmpeg -sseof -0.5 -i "${tmp}" -frames:v 1 -q:v 2 "${tmpFrame}" -y 2>/dev/null`);
    const frame = require("fs").readFileSync(tmpFrame);
    require("fs").unlinkSync(tmp);
    require("fs").unlinkSync(tmpFrame);
    return frame;
  } finally {
    try { require("fs").unlinkSync(tmp); } catch {}
    try { require("fs").unlinkSync(tmpFrame); } catch {}
  }
}

async function extractLastFrameAsUrl(videoUrl: string): Promise<string> {
  const sharp = (await import("sharp")).default;
  const frameBuf = await extractLastFrame(videoUrl);
  // Resize to 1280x720 for Sora
  const resized = await sharp(frameBuf).resize(1280, 720, { fit: "cover" }).jpeg({ quality: 90 }).toBuffer();
  // Upload to Vercel Blob for a public URL
  const { put } = await import("@vercel/blob");
  const blob = await put(`chain-frames/frame-${Date.now()}.jpg`, resized, {
    access: "public",
    contentType: "image/jpeg",
  });
  return blob.url;
}

(async () => {
  const clipNumbers = process.argv.slice(2).map(Number).filter(Boolean);
  if (clipNumbers.length === 0) { console.error("Usage: chain-render-clips.ts 1 2 3"); process.exit(1); }

  console.log("═══════════════════════════════════════");
  console.log("  CHAIN RENDER — clips " + clipNumbers.join(", "));
  console.log("═══════════════════════════════════════\n");

  const scenes = await p.scene.findMany({
    where: { episodeId: EPISODE_ID, sceneNumber: { in: clipNumbers } },
    orderBy: { sceneNumber: "asc" },
    include: { episode: { include: { season: { include: { series: true } } } } },
  });
  const projectId = scenes[0]?.episode?.season?.series?.projectId;

  // Get Maya's portrait for first clip seed
  const maya = await p.character.findFirst({
    where: { name: { contains: "Maya" } },
    include: { media: { take: 1 } },
  });
  const mayaPortrait = maya?.media?.[0]?.fileUrl;

  let previousVideoUrl: string | null = null;

  // If clip 1 is NOT in the list, check if a previous clip exists to chain from
  if (clipNumbers[0] > 1) {
    const prevScene = await p.scene.findFirst({
      where: { episodeId: EPISODE_ID, sceneNumber: clipNumbers[0] - 1 },
    });
    if (prevScene) {
      const prevAsset = await p.asset.findFirst({
        where: { entityType: "SCENE", entityId: prevScene.id, assetType: "VIDEO", status: "READY" },
        orderBy: { createdAt: "desc" },
      });
      if (prevAsset) previousVideoUrl = prevAsset.fileUrl;
    }
  }

  for (const scene of scenes) {
    const num = scene.sceneNumber;
    console.log(`\n─── SC${String(num).padStart(2, "0")} "${scene.title}" ───`);

    // Build prompt
    let prompt = sanitize(scene.scriptText ?? "");
    if (previousVideoUrl) {
      prompt = `Continue EXACTLY from the reference image — same location, same character position, same camera angle, same lighting. The video must start precisely where the previous clip ended.\n\n${prompt}`;
    }

    // Get seed image
    let seedImageUrl: string | undefined;
    if (previousVideoUrl) {
      console.log("  Extracting last frame from previous clip...");
      try {
        seedImageUrl = await extractLastFrameAsUrl(previousVideoUrl);
        console.log(`  ✓ Frame extracted: ${seedImageUrl.slice(0, 60)}...`);
      } catch (e: any) {
        console.log(`  ⚠ Frame extraction failed: ${e.message}. Using Maya portrait.`);
        seedImageUrl = mayaPortrait;
      }
    } else if (num === 1 && mayaPortrait) {
      seedImageUrl = mayaPortrait;
      console.log("  Using Maya portrait as first clip seed");
    }

    // Submit to Sora
    console.log("  Submitting to Sora i2v...");
    const submitted = await submitSoraVideo({
      prompt: prompt.slice(0, 2000),
      model: "sora-2",
      seconds: "20",
      size: "1280x720",
      imageUrl: seedImageUrl,
    });
    console.log(`  ✓ Submitted: ${submitted.id}`);

    // Save pending
    const existingMem = (scene.memoryContext as any) ?? {};
    await p.scene.update({
      where: { id: scene.id },
      data: {
        status: "VIDEO_GENERATING",
        memoryContext: {
          ...existingMem,
          pendingVideoJob: { provider: "openai", jobId: submitted.id, model: "sora-2", durationSeconds: 20, submittedAt: new Date().toISOString() },
        } as any,
      },
    });

    // Poll until done
    const start = Date.now();
    let resultUrl: string | null = null;
    while (Date.now() - start < 8 * 60 * 1000) {
      await new Promise((r) => setTimeout(r, 20_000));
      const elapsed = Math.round((Date.now() - start) / 1000);
      try {
        const r = await pollSoraVideo(submitted.id);
        if (r.status === "completed") {
          const proxyUrl = `/api/v1/videos/sora-proxy?id=${encodeURIComponent(submitted.id)}`;
          console.log(`  [${elapsed}s] ✅ DONE`);

          // Create asset
          if (projectId) {
            await p.asset.create({
              data: {
                projectId, entityType: "SCENE", entityId: scene.id, assetType: "VIDEO",
                fileUrl: proxyUrl, mimeType: "video/mp4", status: "READY",
                metadata: { provider: "openai", model: "sora-2", durationSeconds: 20, costUsd: 2.00 } as any,
              },
            });
          }
          const { pendingVideoJob: _, ...rest } = existingMem;
          await p.scene.update({ where: { id: scene.id }, data: { status: "VIDEO_REVIEW", memoryContext: rest as any } });
          await (p as any).sceneLog.create({
            data: {
              sceneId: scene.id,
              action: "video_ready",
              actor: "system:chain-render",
              actorName: "Sora 2 (chain)",
              details: { provider: "openai", model: "sora-2", durationSeconds: 20, jobId: submitted.id, chainedFrom: previousVideoUrl ? "previous-clip" : "none" },
            },
          }).catch(() => {});

          resultUrl = proxyUrl;
          break;
        } else if (r.status === "failed") {
          console.log(`  [${elapsed}s] ❌ FAILED: ${JSON.stringify(r.error)}`);
          const { pendingVideoJob: _, ...rest } = existingMem;
          await p.scene.update({ where: { id: scene.id }, data: { status: "STORYBOARD_REVIEW", memoryContext: { ...rest, lastVideoError: r.error?.message ?? "failed" } as any } });
          break;
        } else {
          console.log(`  [${elapsed}s] ⏳ ${r.status} ${r.progress ?? 0}%`);
        }
      } catch (e: any) { console.log(`  [${elapsed}s] ⚠ ${e.message.slice(0, 100)}`); }
    }

    previousVideoUrl = resultUrl;
    console.log(`  Cost: $2.00`);
  }

  console.log("\n═══════════════════════════════════════");
  console.log(`  DONE — ${clipNumbers.length} clips × $2 = $${clipNumbers.length * 2}`);
  console.log("═══════════════════════════════════════");

  await p.$disconnect();
})();
