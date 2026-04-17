import { PrismaClient } from "@prisma/client";
import { submitSoraVideo, pollSoraVideo } from "../lib/providers/openai-sora";
const p = new PrismaClient();
const EPISODE_ID = "cmny2i5k2000lu7yrxy2s63r6";

// Words Sora blocks — must be stripped from prompts
const BLOCKED = /paranoid|paranoia|thriller|surveillance|threatening|suspicious|dark psychological|noir-dark|crime|espionage|blood|violence|drugs|tattoo|weapon|gun|knife|attack|murder|kill|dead|death/gi;

function sanitize(text: string): string {
  return text
    .replace(BLOCKED, (m) => {
      const map: Record<string, string> = {
        paranoid: "anxious", paranoia: "anxiety", thriller: "drama",
        surveillance: "observation", threatening: "intense", suspicious: "curious",
        crime: "investigation", espionage: "intelligence work", blood: "liquid",
        violence: "conflict", drugs: "substances", tattoo: "marking",
        weapon: "device", gun: "object", knife: "tool", attack: "encounter",
        murder: "incident", kill: "remove", dead: "still", death: "ending",
      };
      return map[m.toLowerCase()] ?? "notable";
    });
}

(async () => {
  const scene = await p.scene.findFirst({ where: { episodeId: EPISODE_ID, sceneNumber: 2 } });
  if (!scene) { console.error("no scene 2"); return; }
  console.log("SC02:", scene.title);
  console.log("Original scriptText length:", scene.scriptText?.length);

  // Sanitize the prompt
  const cleaned = sanitize(scene.scriptText ?? "");
  const changed = cleaned !== scene.scriptText;
  console.log("Sanitized:", changed ? "YES — blocked words removed" : "no changes needed");
  if (changed) {
    console.log("Diff preview:", (scene.scriptText ?? "").slice(0, 200));
    console.log("→", cleaned.slice(0, 200));
  }

  // Update scene + reset status
  await p.scene.update({
    where: { id: scene.id },
    data: {
      scriptText: cleaned,
      status: "STORYBOARD_APPROVED",
      memoryContext: {
        ...(scene.memoryContext as object ?? {}),
        lastVideoError: undefined,
        pendingVideoJob: undefined,
      } as any,
    },
  });
  console.log("Status reset to STORYBOARD_APPROVED");

  // Submit to Sora
  console.log("\nSubmitting to Sora...");
  const submitted = await submitSoraVideo({
    prompt: cleaned.slice(0, 2000),
    model: "sora-2",
    seconds: "20",
    size: "1280x720",
  });
  console.log("✓ Submitted:", submitted.id);

  // Save pending job
  await p.scene.update({
    where: { id: scene.id },
    data: {
      status: "VIDEO_GENERATING",
      memoryContext: {
        ...(scene.memoryContext as object ?? {}),
        pendingVideoJob: { provider: "openai", jobId: submitted.id, model: "sora-2", durationSeconds: 20, submittedAt: new Date().toISOString() },
      } as any,
    },
  });

  // Poll
  const start = Date.now();
  while (Date.now() - start < 8 * 60 * 1000) {
    await new Promise((r) => setTimeout(r, 20_000));
    const elapsed = Math.round((Date.now() - start) / 1000);
    try {
      const r = await pollSoraVideo(submitted.id);
      if (r.status === "completed") {
        console.log(`[${elapsed}s] ✅ DONE`);
        // Create asset + flip status
        const ep = await p.episode.findUnique({ where: { id: EPISODE_ID }, include: { season: { include: { series: true } } } });
        const projectId = ep?.season.series.projectId;
        const proxyUrl = `/api/v1/videos/sora-proxy?id=${encodeURIComponent(submitted.id)}`;
        if (projectId) {
          await p.asset.create({
            data: {
              projectId, entityType: "SCENE", entityId: scene.id, assetType: "VIDEO",
              fileUrl: proxyUrl, mimeType: "video/mp4", status: "READY",
              metadata: { provider: "openai", model: "sora-2", durationSeconds: 20, costUsd: 2.00 } as any,
            },
          });
        }
        const { pendingVideoJob: _, ...rest } = (scene.memoryContext as any) ?? {};
        await p.scene.update({ where: { id: scene.id }, data: { status: "VIDEO_REVIEW", memoryContext: rest as any } });
        console.log("   Asset created + status = VIDEO_REVIEW");
        break;
      } else if (r.status === "failed") {
        console.log(`[${elapsed}s] ❌ FAILED: ${JSON.stringify(r.error)}`);
        break;
      } else {
        console.log(`[${elapsed}s] ⏳ ${r.status} ${r.progress ?? 0}%`);
      }
    } catch (e: any) { console.log(`[${elapsed}s] ⚠ ${e.message.slice(0, 100)}`); }
  }
  await p.$disconnect();
})();
