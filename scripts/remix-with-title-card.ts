/**
 * One-off: remix the latest Sora video on a given scene with a prompt
 * that emphasizes the episode title card at the top. This is to verify
 * the new REQUIRED OPENING TITLE CARD language works on Sora.
 */
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const KEY = process.env.OPENAI_API_KEY?.replace(/\\n$/, "");
const SCENE_ID = process.argv[2];
if (!SCENE_ID) { console.error("usage: remix-with-title-card.ts <sceneId>"); process.exit(1); }
if (!KEY) { console.error("OPENAI_API_KEY missing"); process.exit(1); }

(async () => {
  const scene = await p.scene.findUnique({
    where: { id: SCENE_ID },
    include: { episode: { include: { season: { include: { series: true } } } } },
  });
  if (!scene) { console.error("scene not found"); return; }

  const latestAsset = await p.asset.findFirst({
    where: { entityType: "SCENE", entityId: scene.id, assetType: "VIDEO", status: "READY" },
    orderBy: { createdAt: "desc" },
    select: { id: true, fileUrl: true, metadata: true },
  });
  if (!latestAsset) { console.error("no READY video asset on scene"); return; }

  const meta = (latestAsset.metadata as any) ?? {};
  const soraId = meta.soraVideoId ?? latestAsset.fileUrl.match(/[?&]id=(video_[^&]+)/)?.[1];
  if (!soraId) { console.error("could not extract soraVideoId"); return; }
  console.log(`remixing ${soraId}`);

  const sNum = scene.episode?.season?.seasonNumber ?? 1;
  const eNum = scene.episode?.episodeNumber ?? 1;

  // The new prompt: TITLE CARD as rule #1, no negotiation. Sora often
  // skips overlay text when it's buried — this puts it at the top with
  // explicit frame timing and typography specs.
  const remixPrompt = [
    `REQUIRED OPENING TITLE CARD — NON-NEGOTIABLE. Frames 0.0–2.0s: pure black screen with the text "SEASON ${sNum} · EPISODE ${eNum}" in large, crisp, clean white Helvetica Bold sans-serif typography (font weight 700, ~9% of screen height), perfectly centered with 15% safe margins. The text must be legible and readable — not stylised, not decorative, not handwritten, not 3D, not glowing, not textured. Frames 2.0–2.5s: smooth fade to black. Only after 2.5s does the live-action scene begin. A calm male narrator voice says "Season ${sNum}, Episode ${eNum}" in English, timed to finish just before the fade. NO other on-screen text anywhere else in the clip.`,
    `KEEP everything else from the original: same characters, same wardrobe, same location, same lighting, same dialogue, same action, same camera work. This is an overlay-only remix — add the title card at the start, leave the rest identical.`,
  ].join("\n\n");

  const res = await fetch(`https://api.openai.com/v1/videos/${soraId}/remix`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: remixPrompt.slice(0, 2000) }),
  });
  const data: any = await res.json();
  if (!res.ok) { console.error("remix failed:", data); return; }
  console.log(`✓ remix submitted: ${data.id} · status=${data.status} · seconds=${data.seconds}`);

  // Save pending job on the scene so the scene page picks it up
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
          sourceAssetId: latestAsset.id,
        },
      } as any,
    },
  });
  console.log(`✓ pending job saved to scene memoryContext`);

  await (p as any).sceneLog.create({
    data: {
      sceneId: scene.id,
      action: "video_remix",
      actor: "system:remix-title-card-script",
      actorName: "Title-card remix (one-off)",
      details: { sourceAssetId: latestAsset.id, jobId: data.id, purpose: "force title card" },
    },
  }).catch(() => {});

  console.log(`\nREMIX_ID=${data.id}`);
  await p.$disconnect();
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
