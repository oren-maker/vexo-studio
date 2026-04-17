import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const AUTH = "Key e2ca9f1f-a58e-40ce-b07e-79685643ae8c:80567f1f8feaf739754d3c122ded287ac791acb9f5164514d9b0ec091480fa2a";

(async () => {
  const maya = await p.character.findFirst({
    where: { name: { contains: "Maya" } },
    include: { media: { orderBy: { createdAt: "asc" }, take: 1 } },
  });
  const portrait = maya?.media?.[0]?.fileUrl;
  console.log("Maya appearance:", maya?.appearance?.slice(0, 200));
  console.log("Maya portrait:", portrait?.slice(0, 100));

  // Tight prompt: 3s intro + house entry + Maya bathroom scene
  const prompt = `Photorealistic live-action film, shot on 35mm Arri Alexa, natural morning light, shallow depth of field.

00:00-00:03: AERIAL SHOT descending fast from sky to a two-story suburban house at golden hour dawn. Large clean white text "SEASON 1 · EPISODE 1" centered on screen fades in and out. A warm narrator voice says "Season One, Episode One".

00:03-00:06: Camera PUSHES through the front door of the house in one fluid motion, entering a sunlit hallway with wooden floors, coat rack, and family photos on the wall.

00:06-00:10: Camera TRACKS smoothly down the hallway toward a half-open bathroom door. Sound: clock ticking, distant birds, soft piano score building tension.

00:10-00:15: Camera enters the bathroom. A woman stands at the marble sink looking into the mirror. She is Maya Ellis — age 33, olive-toned skin with visible pores and light freckles across her nose, sharp defined jawline, dark brown wavy hair in a messy bun with loose strands framing her face, wearing an oversized charcoal silk robe. Her expression shifts from calm to confused as her reflection blinks out of sync with her. Close-up on her brown eyes widening. Water drips from the faucet onto white porcelain.

Audio: Continuous cinematic score — solo piano with ambient pad, 70 BPM. Foley throughout: birds, footsteps on wood, clock, water drops, fabric rustle.

Last 1 second: smooth fade to black, audio ducks to silence.`;

  console.log(`\nPrompt: ${prompt.length} chars`);

  // Try IMAGE-TO-VIDEO with Maya's portrait for face-lock
  if (portrait) {
    console.log("\n=== Kling 3.0 i2v (with Maya portrait) ===");
    try {
      const res = await fetch("https://platform.higgsfield.ai/kling-video/v3.0/pro/image-to-video", {
        method: "POST",
        headers: { Authorization: AUTH, "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, duration: 15, aspect_ratio: "16:9", image_url: portrait, seed: 202 }),
      });
      const d: any = await res.json();
      if (d.request_id) {
        console.log(`✓ i2v submitted: ${d.request_id}`);
      } else {
        console.log(`✗ i2v failed: ${JSON.stringify(d).slice(0, 300)}`);
      }
    } catch (e: any) { console.log(`✗ i2v error: ${e.message}`); }
  }

  // Also submit TEXT-TO-VIDEO for comparison
  console.log("\n=== Kling 3.0 t2v ===");
  let t2vId = "";
  try {
    const res = await fetch("https://platform.higgsfield.ai/kling-video/v3.0/pro/text-to-video", {
      method: "POST",
      headers: { Authorization: AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: prompt.slice(0, 2000), duration: 15, aspect_ratio: "16:9", seed: 202 }),
    });
    const d: any = await res.json();
    t2vId = d.request_id ?? "";
    console.log(`✓ t2v submitted: ${t2vId}`);
  } catch (e: any) { console.log(`✗ t2v error: ${e.message}`); }

  // Poll both
  const jobs = [
    ...(portrait ? [{ label: "Kling i2v (face-lock)", id: "" }] : []),
    { label: "Kling t2v", id: t2vId },
  ];
  // Get i2v id if submitted
  if (portrait && jobs[0]) {
    // Re-read from earlier
  }

  console.log("\nPolling t2v...");
  const start = Date.now();
  while (Date.now() - start < 10 * 60 * 1000) {
    await new Promise((r) => setTimeout(r, 20_000));
    const elapsed = Math.round((Date.now() - start) / 1000);
    if (!t2vId) break;
    try {
      const r = await fetch(`https://platform.higgsfield.ai/requests/${t2vId}/status`, { headers: { Authorization: AUTH } });
      const d: any = await r.json();
      if (d.status === "completed") {
        console.log(`[${elapsed}s] ✅ Kling t2v: ${d.video?.url ?? "(no url)"}`);
        break;
      } else if (d.status === "failed" || d.status === "nsfw") {
        console.log(`[${elapsed}s] ❌ Kling t2v: ${d.status}`);
        break;
      } else {
        console.log(`[${elapsed}s] ⏳ ${d.status}`);
      }
    } catch {}
  }

  await p.$disconnect();
})();
