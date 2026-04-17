/**
 * Remix AGAINST A SPECIFIC source video_id (not "the latest asset").
 * Uses the same delta-only prompt logic as the route.
 *
 * Usage:
 *   DATABASE_URL=... OPENAI_API_KEY=... \
 *     npx tsx scripts/remix-specific-source.ts <sceneId> <sourceVideoId> ["user notes"]
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const KEY = process.env.OPENAI_API_KEY?.replace(/\\n$/, "");
const SCENE_ID = process.argv[2];
const SOURCE_VIDEO_ID = process.argv[3];
const USER_NOTES = process.argv[4] ?? "Insert the opening title card at the start.";
if (!SCENE_ID || !SOURCE_VIDEO_ID) { console.error("usage: remix-specific-source.ts <sceneId> <sourceVideoId> [notes]"); process.exit(1); }
if (!KEY) { console.error("OPENAI_API_KEY missing"); process.exit(1); }

(async () => {
  const scene = await p.scene.findUnique({
    where: { id: SCENE_ID },
    include: { episode: { include: { season: { include: { series: true } } } } },
  });
  if (!scene) { console.error("scene not found"); return; }

  const sourceAsset = await p.asset.findFirst({
    where: {
      entityType: "SCENE", entityId: scene.id, assetType: "VIDEO",
      OR: [
        { fileUrl: { contains: SOURCE_VIDEO_ID } },
        { metadata: { path: ["soraVideoId"], equals: SOURCE_VIDEO_ID } as any },
      ],
    },
    select: { id: true, fileUrl: true },
  });
  if (!sourceAsset) console.log(`⚠ source asset not in DB — that's OK, using raw sora id`);

  const isFirstScene = scene.sceneNumber === 1;
  const seasonNum = scene.episode?.season?.seasonNumber;
  const epNum = scene.episode?.episodeNumber;

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

  console.log("━━━ prompt ━━━");
  console.log(dedupedPrompt);
  console.log(`\n━━━ submitting against ${SOURCE_VIDEO_ID} ━━━\n`);

  const res = await fetch(`https://api.openai.com/v1/videos/${SOURCE_VIDEO_ID}/remix`, {
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
          kind: "remix",
          sourceAssetId: sourceAsset?.id ?? null,
          sourceSoraId: SOURCE_VIDEO_ID,
        },
      } as any,
    },
  });
  console.log(`✓ pending saved`);

  await (p as any).sceneLog.create({
    data: {
      sceneId: scene.id,
      action: "video_remix",
      actor: "system:remix-specific",
      actorName: "Remix (specific source)",
      details: { sourceVideoId: SOURCE_VIDEO_ID, jobId: data.id, userNotes: USER_NOTES.slice(0, 200) },
    },
  }).catch(() => {});

  console.log(`\nREMIX_ID=${data.id}`);
  await p.$disconnect();
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
