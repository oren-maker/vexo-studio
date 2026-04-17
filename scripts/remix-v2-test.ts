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
const USER_NOTES = process.argv[3] ?? "Render the full 20-second scene from the original but ensure the mandatory opening title card appears for the first 2 seconds. Keep Maya's identity, location, wardrobe, lighting, and props identical to the source.";

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

  const titleCardBlock = isFirstScene && seasonNum != null && epNum != null
    ? `REQUIRED OPENING TITLE CARD — NON-NEGOTIABLE. Frames 0.0–2.0s: pure black screen with the text "SEASON ${seasonNum} · EPISODE ${epNum}" in large, crisp, clean white Helvetica Bold sans-serif typography (font weight 700, ~9% of screen height), perfectly centered with 15% safe margins. The text must be legible — not stylised, not decorative, not handwritten, not 3D, not glowing, not textured. Frames 2.0–2.5s: smooth fade to black. Only after 2.5s does the live-action scene begin. A calm adult male narrator voice says "Season ${seasonNum}, Episode ${epNum}" in English, timed to finish just before the text starts fading. NO other on-screen text anywhere else in the clip.`
    : "";

  const noReferenceGridRule = `HARD OVERRIDE (i2v safety, NON-NEGOTIABLE): the source video and any reference image(s) are a LOOKUP ONLY for identity, wardrobe, and location. NONE of these MUST appear on screen: no character reference grid / portrait sheet / character lineup, no side-by-side portraits or split-screen showing the reference, no title-cards of the character's name with their photo, no fade-in from a reference image, no "introduction card" before the action. The video begins with the required opening title card (scene 1) or directly with the live-action scene (mid-episode).`;

  const endFrameRule = isLast
    ? `END-FRAME (episode finale): the final 1.5 seconds fade smoothly to pure black, audio ducks to silence in sync.`
    : `END-FRAME (mid-episode, NON-NEGOTIABLE): the final 1 second MUST settle into a cleanly composed, stable frame — no motion blur, characters holding position, lighting steady, every on-screen object clearly visible. This exact frame will seed the next clip via i2v. DO NOT fade to black and DO NOT end mid-motion.`;

  const originalContext = [
    titleCardBlock,
    noReferenceGridRule,
    seriesTitle ? `Series: "${seriesTitle}"` : null,
    scriptTextClean ? `Original script (maintain these requirements):\n${scriptTextClean.slice(0, 1200)}` : null,
    mem.characters?.length ? `Characters in scene: ${mem.characters.join(", ")}` : null,
    endFrameRule,
  ].filter(Boolean).join("\n\n");

  const dedupedPrompt = [originalContext, "--- REMIX NOTES (apply these changes) ---", USER_NOTES].join("\n\n").slice(0, 2000);

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
