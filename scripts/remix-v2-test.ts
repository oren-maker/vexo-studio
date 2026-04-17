/**
 * Local end-to-end test of the improved remix prompt logic.
 * Mirrors EXACTLY what remix-video/route.ts now builds after commit fffa88c.
 *
 * Flow:
 *   1. Load scene + latest READY Sora asset
 *   2. Build the remix prompt the same way the route does
 *   3. Submit to OpenAI /v1/videos/{id}/remix
 *   4. Save pendingVideoJob on the scene (same shape as the route)
 *   5. Caller monitors externally and finalizes when Sora completes
 *
 * NOT pushed to prod — this is the "develop locally, verify, THEN deploy"
 * workflow per Oren's new rule (feedback_local_first_deploy_on_request).
 */
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const KEY = process.env.OPENAI_API_KEY?.replace(/\\n$/, "");
const SCENE_ID = process.argv[2];
const USER_NOTES = process.argv[3] ?? "Insert the opening title card at the start.";

if (!SCENE_ID) { console.error("usage: remix-v2-test.ts <sceneId> [remixNotes]"); process.exit(1); }
if (!KEY) { console.error("OPENAI_API_KEY missing"); process.exit(1); }

const PROBLEMATIC: RegExp[] = [
  /\btitle\b[^.]{0,80}\bfades? in\b[^.]*\./gi,
  /\bseason\s*\d+\s*[·•·]?\s*episode\s*\d+\b[^.]*\bfades? in\b[^.]*\./gi,
  /\b(lock\s+identity\s+to|anchor\s+to|match)\s+the\s+reference\s+image[s]?\b[^.]*\./gi,
  /\breference\s+image[s]?\s+(for|of)\s+[A-Z][a-zA-Z ]+\s+(across|throughout|in)\b[^.]*\./gi,
  /\bshow\s+(the|a)\s+character\s+(sheet|grid|lineup|composite)\b[^.]*\./gi,
  /\bportrait\s+(grid|lineup|composite|sheet)\b[^.]*\./gi,
];
const sanitize = (t: string | null | undefined) => {
  if (!t) return "";
  let out = String(t);
  for (const re of PROBLEMATIC) out = out.replace(re, "");
  return out.replace(/\s{3,}/g, " ").trim();
};

(async () => {
  const scene = await p.scene.findUnique({
    where: { id: SCENE_ID },
    include: {
      episode: {
        include: {
          season: { include: { series: { include: { project: { select: { id: true, name: true } } } } } },
          _count: { select: { scenes: true } },
        },
      },
    },
  });
  if (!scene) { console.error("scene not found"); return; }

  const latest = await p.asset.findFirst({
    where: { entityType: "SCENE", entityId: scene.id, assetType: "VIDEO", status: "READY" },
    orderBy: { createdAt: "desc" },
    select: { id: true, fileUrl: true, metadata: true },
  });
  if (!latest) { console.error("no READY asset on scene"); return; }
  const meta: any = latest.metadata ?? {};
  const soraId = meta.soraVideoId ?? latest.fileUrl.match(/[?&]id=(video_[^&]+)/)?.[1];
  if (!soraId) { console.error("no soraVideoId"); return; }

  const seasonNum = scene.episode?.season?.seasonNumber;
  const epNum = scene.episode?.episodeNumber;
  const seriesTitle = scene.episode?.season?.series?.title ?? scene.episode?.season?.series?.project?.name ?? "";
  const mem: any = scene.memoryContext ?? {};
  const isFirstScene = scene.sceneNumber === 1;
  const total = scene.episode?._count?.scenes ?? null;
  const isLast = total != null && scene.sceneNumber === total;
  const scriptTextClean = sanitize(scene.scriptText);

  // DELTA-ONLY remix prompt. Long prompts make Sora generate a new
  // unrelated video — keep this TIGHT and change-focused.
  const preservationHint = "Keep every unchanged element from the source video exactly — same characters, same location, same lighting, same camera angle, same action, same pacing. Apply ONLY the changes below.";
  const wantsTitleCard = isFirstScene && seasonNum != null && epNum != null &&
    /(title card|opening title|season.{0,5}episode|כותרת|כרטיס כותרת)/i.test(USER_NOTES);
  const titleCardDelta = wantsTitleCard
    ? `Insert a 2-second opening title card before the existing action: pure black screen with the text "SEASON ${seasonNum} · EPISODE ${epNum}" in clean white Helvetica Bold sans-serif, centered, 15% safe margins. Fade smoothly to the source action at the 2-second mark. A male narrator says "Season ${seasonNum}, Episode ${epNum}" during the card.`
    : "";
  const dedupedPrompt = [
    preservationHint,
    titleCardDelta,
    `CHANGES REQUESTED BY USER:\n${USER_NOTES}`,
  ].filter(Boolean).join("\n\n").slice(0, 1500);

  console.log("━━━ prompt preview (first 800 chars) ━━━");
  console.log(dedupedPrompt.slice(0, 800));
  console.log(`\n━━━ submitting remix against source=${soraId} ━━━\n`);

  const res = await fetch(`https://api.openai.com/v1/videos/${soraId}/remix`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: dedupedPrompt }),
  });
  const data: any = await res.json();
  if (!res.ok) { console.error("remix failed:", data); return; }
  console.log(`✓ submitted: ${data.id} · ${data.status} · ${data.seconds}s`);

  const existingMem: any = scene.memoryContext ?? {};
  await p.scene.update({
    where: { id: scene.id },
    data: {
      status: "VIDEO_GENERATING",
      memoryContext: {
        ...existingMem,
        pendingVideoJob: {
          provider: "openai",
          jobId: data.id,
          model: data.model,
          durationSeconds: parseInt(data.seconds, 10),
          submittedAt: new Date().toISOString(),
          kind: "remix-v2-test",
          sourceAssetId: latest.id,
        },
      } as any,
    },
  });
  console.log(`✓ pending saved on scene\n\nREMIX_ID=${data.id}`);

  await (p as any).sceneLog.create({
    data: {
      sceneId: scene.id,
      action: "video_remix",
      actor: "system:remix-v2-test",
      actorName: "Remix v2 (local test)",
      details: { sourceAssetId: latest.id, jobId: data.id, purpose: "test improved prompt logic" },
    },
  }).catch(() => {});

  await p.$disconnect();
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
