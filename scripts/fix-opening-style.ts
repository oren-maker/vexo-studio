/**
 * Rewrite the SeasonOpening prompt to match the actual scene aesthetic
 * (bright villa, mercury mirrors, Maya-focused, warm dawn lighting) —
 * NOT the psychological-thriller/noir tone the wizard defaulted to.
 *
 * Then regenerate the video + update DB.
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const KEY = process.env.OPENAI_API_KEY?.replace(/\\n$/, "");
if (!KEY) { console.error("OPENAI_API_KEY required"); process.exit(1); }

const NEW_PROMPT = `A photorealistic live-action cinematic opening title sequence for "Echoes of Tomorrow", a character-driven drama. The sequence is 20 seconds long, shot like a warm, elegant film teaser — NOT a thriller, NOT noir, NOT psychological suspense. The aesthetic matches the series: a luminous modern villa with mercury-finish mirror walls, obsidian floors, tall windows letting in golden dawn light, and a sense of calm curiosity.

0-4 seconds: wide establishing shot of the villa's hall of mirrors at sunrise. Warm amber light spills across the polished obsidian floor. The camera performs a slow, graceful dolly-in through the hall.

4-10 seconds: medium shot of Maya Ellis — early-30s woman with auburn wavy hair, warm hazel eyes, olive skin with soft freckles, wearing a black silk robe. She stands at the center of the hall, her reflection rippling gently in the mercury mirrors around her. She turns her head slowly toward the camera, a soft smile of quiet understanding crossing her face. A single clean white sans-serif name card "Maya Ellis" appears centered below her for 2 seconds, then fades.

10-16 seconds: the camera pulls out smoothly into a wide shot of the full mirror hall. Maya walks forward with calm, measured steps. Her reflections in the mercury walls move with her in perfect sync. Morning light beams diagonally across the frame.

16-20 seconds: the camera continues pulling out to a final tableau. Large clean white sans-serif typography fades in, centered, with 15% safe margins: "ECHOES OF TOMORROW". The text holds steady. A calm, warm male narrator voice says "Echoes of Tomorrow" once, clearly, in English. The frame settles into a stable final image.

Audio: a gentle, curious cinematic score — piano, soft strings, warm ambient pads. NO tension music, NO thriller beats, NO heavy bass drops. Warm and inviting. Light ambient sounds of a quiet villa at dawn — soft air, distant gulls, barely-there wind. Dialogue: only the single narrator line at the end.

Technical: 24fps, 1280x720, natural film grain, high-end cinema color science with a warm amber/cream palette. No desaturation, no cool/blue shift, no shadow-heavy grading.`;

(async () => {
  const op = await p.seasonOpening.findFirst({ where: { isSeriesDefault: true } });
  if (!op) { console.log("no opening"); return; }

  // Save old prompt as a version, then replace
  await p.seasonOpeningPromptVersion.create({
    data: {
      openingId: op.id,
      prompt: op.currentPrompt,
      styleLabel: op.styleLabel,
      editedBy: "script:fix-opening-style",
      reason: "Replaced noir/thriller default with warm-villa tone matching scene aesthetic",
    },
  }).catch((e) => console.log("version err:", e.message?.slice(0, 100)));

  await p.seasonOpening.update({
    where: { id: op.id },
    data: {
      currentPrompt: NEW_PROMPT,
      styleLabel: "מאיה וחדר המראות — טון חם",
      model: "sora-2",
      duration: 20,
      aspectRatio: "16:9",
      status: "GENERATING",
    },
  });
  console.log(`✓ prompt updated (${NEW_PROMPT.length} chars)`);
  console.log(`  styleLabel: מאיה וחדר המראות — טון חם`);

  // Submit new Sora job
  const form = new FormData();
  form.append("model", "sora-2");
  form.append("seconds", "20");
  form.append("size", "1280x720");
  form.append("prompt", NEW_PROMPT.slice(0, 2000));

  const sora = await fetch("https://api.openai.com/v1/videos", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}` },
    body: form,
  });
  const sdata: any = await sora.json();
  if (!sora.ok) { console.error("Sora err:", JSON.stringify(sdata).slice(0, 300)); return; }
  console.log(`  ✓ Sora submitted: ${sdata.id}`);

  await p.seasonOpening.update({
    where: { id: op.id },
    data: { falRequestId: sdata.id },
  });

  // Poll
  console.log(`\n━━━ monitoring ━━━`);
  const start = Date.now();
  while (Date.now() - start < 15 * 60 * 1000) {
    await new Promise((r) => setTimeout(r, 20_000));
    const r = await fetch(`https://api.openai.com/v1/videos/${sdata.id}`, { headers: { Authorization: `Bearer ${KEY}` } });
    const d: any = await r.json();
    const elapsed = Math.round((Date.now() - start) / 1000);
    console.log(`  [${elapsed}s] status=${d.status} progress=${d.progress ?? 0}%`);
    if (d.status === "completed") {
      await p.seasonOpening.update({
        where: { id: op.id },
        data: {
          status: "READY",
          videoUri: sdata.id,
          videoUrl: `/api/v1/videos/sora-proxy?id=${encodeURIComponent(sdata.id)}`,
          chunkVideoIds: [sdata.id] as any,
          updatedAt: new Date(),
        },
      });
      console.log(`\n✅ DONE`);
      console.log(`new opening: https://vexo-studio.vercel.app/api/v1/videos/sora-proxy?id=${sdata.id}`);
      break;
    }
    if (d.status === "failed" || d.status === "cancelled") {
      console.log(`❌ ${d.error?.code}: ${d.error?.message}`);
      await p.seasonOpening.update({ where: { id: op.id }, data: { status: "FAILED" } });
      break;
    }
  }

  await p.$disconnect();
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
