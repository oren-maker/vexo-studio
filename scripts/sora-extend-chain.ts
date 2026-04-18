/**
 * Build a 120s continuous-shot film via Sora Extensions:
 *   SC1 (base 20s) → ext1 → ext2 → ext3 → ext4 → ext5
 *
 * Each extension inherits pixel continuity from the previous — Maya's
 * identity, location, lighting, camera preserved by Sora itself. This is
 * the guaranteed-continuity path (vs i2v seeding which drifts).
 *
 * Each extension prompt is SHORT (≤600 chars), describes ONLY the next
 * 20 seconds of action, and avoids Sora moderation triggers (no dark
 * psychology / shock / soldier / weapon — curiosity + wonder + gentle
 * motion only).
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const KEY = process.env.OPENAI_API_KEY?.replace(/\\n$/, "");
if (!KEY) { console.error("OPENAI_API_KEY required"); process.exit(1); }

function log(m: string) { console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`); }

// Short, moderation-safe extension prompts. Each describes ONLY what
// happens in the next 20 seconds, from the last frame forward.
const EXTENSIONS = [
  "Continue exactly from the current moment. Maya stays in the same room, same lighting, same wardrobe. She turns her head slowly toward a luminous hallway to her left, a soft smile of curiosity breaking across her face. She takes three calm steps forward, her reflection rippling gently in the mercury-finish wall behind her. Camera matches her pace in a smooth dolly-in, keeping her at OTS distance.",
  "Maya reaches the archway of a sunlit study. She pauses in the doorway, her fingertips trailing the warm oak frame. The study holds a quiet wooden desk with a single glowing tablet resting on it. Soft morning light streams from tall windows. She steps inside, her movement unhurried, eyes widening gently with wonder.",
  "Maya approaches the desk and lifts the glowing tablet. She holds it at chest height and studies its surface. The tablet displays a calm mosaic of her own face in many variations — artist, teacher, dancer, writer — all gently morphing into each other. Her expression softens into quiet recognition. Camera pulls in to a medium close-up on the tablet and her face together.",
  "Maya lowers the tablet and walks to the window. Golden dawn light spills across her face. She places both palms on the glass and looks out at an obsidian cliff meeting a serene ocean below. Gulls drift silently. The mercury mirrors behind her continue to ripple softly. She takes a long, calm breath, her chest rising and falling visibly.",
  "Maya turns from the window with a small, certain nod to herself. She walks back toward the center of the study, her footsteps audible on the wooden floor. She picks up the tablet once more, holds it close, and the screen fades to a single warm golden light. The camera pulls out into a wide shot of the entire study, Maya centered, bathed in morning light. The scene settles into a quiet, stable final frame.",
];

async function submitExtension(sourceId: string, prompt: string): Promise<string> {
  const r = await fetch(`https://api.openai.com/v1/videos/${sourceId}/extensions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: prompt.slice(0, 2000), seconds: "20" }),
  });
  const d: any = await r.json();
  if (!r.ok) throw new Error(`ext: ${JSON.stringify(d).slice(0, 300)}`);
  return d.id;
}

async function waitFor(jobId: string, label: string): Promise<"completed" | "failed"> {
  const start = Date.now();
  while (Date.now() - start < 25 * 60 * 1000) {
    await new Promise((r) => setTimeout(r, 20_000));
    try {
      const r = await fetch(`https://api.openai.com/v1/videos/${jobId}`, { headers: { Authorization: `Bearer ${KEY}` } });
      const d: any = await r.json();
      log(`  [${label}] [${jobId.slice(-12)}] ${d.status} ${d.progress ?? 0}%`);
      if (d.status === "completed") return "completed";
      if (d.status === "failed" || d.status === "cancelled") {
        log(`  ❌ ${d.error?.code}: ${d.error?.message}`);
        return "failed";
      }
    } catch (e: any) { log(`  poll err: ${e.message?.slice(0, 100)}`); }
  }
  return "failed";
}

(async () => {
  // Find SC1's primary Sora video as the base
  const sc1 = await p.scene.findFirst({ where: { episodeId: "cmny2i5k2000lu7yrxy2s63r6", sceneNumber: 1 } });
  if (!sc1) { log("SC1 not found"); return; }
  const assets = await p.asset.findMany({
    where: { entityType: "SCENE", entityId: sc1.id, assetType: "VIDEO", status: "READY" },
    orderBy: { createdAt: "desc" }, take: 10,
  });
  const primary = assets.find((a) => (a.metadata as any)?.isPrimary) ?? assets[0];
  if (!primary) { log("no READY SC1 video"); return; }
  const sc1SoraId = (primary.metadata as any)?.soraVideoId ?? primary.fileUrl.match(/id=(video_[^&]+)/)?.[1];
  if (!sc1SoraId) { log("no soraVideoId on SC1"); return; }

  log(`━━━ Sora Extensions chain — 5 × 20s on top of SC1 ━━━`);
  log(`base: ${sc1SoraId}`);

  let currentId = sc1SoraId;
  const chain: Array<{ step: number; sourceId: string; newId: string; prompt: string }> = [];

  for (let i = 0; i < EXTENSIONS.length; i++) {
    const step = i + 1;
    const prompt = EXTENSIONS[i];
    log(`\n━━━ Ext ${step}/5 ━━━`);
    log(`  prompt: ${prompt.slice(0, 120)}…`);

    let newId: string;
    try {
      newId = await submitExtension(currentId, prompt);
      log(`  ✓ submitted: ${newId.slice(-12)}`);
    } catch (e: any) {
      log(`  ❌ submit err: ${e.message.slice(0, 200)}`);
      break;
    }

    const res = await waitFor(newId, `ext${step}`);
    if (res !== "completed") { log(`  chain stopped at ext ${step}`); break; }
    log(`  ✅ ext ${step} complete`);
    chain.push({ step, sourceId: currentId, newId, prompt });
    currentId = newId;
  }

  log(`\n━━━ DONE ━━━`);
  log(`chain length: ${chain.length}/5 extensions`);
  if (chain.length > 0) {
    const finalId = chain[chain.length - 1].newId;
    const totalSec = 20 + chain.length * 20;
    log(`final video id: ${finalId}`);
    log(`total duration: ${totalSec}s`);
    log(`proxy url: https://vexo-studio.vercel.app/api/v1/videos/sora-proxy?id=${finalId}`);
    log(`direct url (needs OPENAI_API_KEY): https://api.openai.com/v1/videos/${finalId}/content`);

    // Record as Asset on SC1 (or a separate entity — here we attach to SC1 as "extended" variant)
    const scWithProject = await p.scene.findUnique({
      where: { id: sc1.id },
      include: { episode: { include: { season: { include: { series: true } } } } },
    });
    const projectId = scWithProject?.episode?.season?.series?.projectId;
    if (projectId) {
      await p.asset.create({
        data: {
          projectId,
          entityType: "SCENE",
          entityId: sc1.id,
          assetType: "VIDEO",
          fileUrl: `/api/v1/videos/sora-proxy?id=${encodeURIComponent(finalId)}`,
          mimeType: "video/mp4",
          status: "READY",
          durationSeconds: totalSec,
          metadata: {
            provider: "openai",
            model: "sora-2",
            soraVideoId: finalId,
            durationSeconds: totalSec,
            costUsd: +(chain.length * 2).toFixed(2),
            kind: "sora-extended",
            chainLength: chain.length,
            baseSoraId: sc1SoraId,
          } as any,
        },
      });
      log(`  ✓ asset row created`);
    }
  }

  await p.$disconnect();
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
