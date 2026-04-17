import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const AUTH = "Key e2ca9f1f-a58e-40ce-b07e-79685643ae8c:80567f1f8feaf739754d3c122ded287ac791acb9f5164514d9b0ec091480fa2a";

(async () => {
  const maya = await p.character.findFirst({
    where: { name: { contains: "Maya" } },
    include: { media: { orderBy: { createdAt: "asc" }, take: 1 } },
  });
  const portraitUrl = maya?.media?.[0]?.fileUrl;
  console.log("Maya portrait:", portraitUrl?.slice(0, 80));

  const prompt = `The reference image shows Maya Ellis, the protagonist — keep her face, hair, and wardrobe EXACTLY as shown throughout the entire video. Do not change her identity.

00:00-00:03: AERIAL ESTABLISHING SHOT. Camera descends from the sky toward a quiet suburban neighborhood at golden dawn light. Large clean white text "SEASON 1 · EPISODE 1" appears centered on screen. A warm narrator voice reads "Season One, Episode One" aloud.

00:03-00:08: Camera swoops down to a specific two-story house with a small garden. Continues descending and pushes smoothly through the front door into a sunlit hallway. Morning light streams through windows.

00:08-00:15: TRACKING SHOT through the hallway. Camera glides past a coat rack, framed family photos on walls, toward a half-open bathroom door. Sound: clock ticking, distant birds chirping, soft piano score building.

00:15-00:25: Camera enters the bathroom. Maya Ellis stands at a marble sink looking into the mirror. She wears a charcoal oversized silk robe. Water drips from the faucet. Close-up of her face — olive skin, dark brown wavy hair in a messy bun, subtle freckles. Her expression is calm but gradually shifts to confusion.

00:25-00:40: MIRROR SEQUENCE. Maya's reflection in the mirror begins behaving independently — it blinks when she doesn't, tilts its head slightly out of sync. Maya notices and freezes. Her breathing becomes audible and shallow. Camera slowly pushes in on the mirror. The piano score intensifies with low cello undertones.

00:40-00:55: REACTION. Maya steps back from the mirror, her hand trembling slightly as she touches her own face to verify reality. She looks down at the running water, then back at the mirror — the reflection is normal again. She exhales shakily. The tension in the music releases slightly but doesn't resolve.

00:55-00:60: Maya stares at herself one last time, uncertainty in her eyes. Camera slowly pulls back through the bathroom doorway. Smooth fade to black over 2 seconds. Audio ducks to complete silence.

AUDIO THROUGHOUT: Continuous cinematic score — solo piano with ambient cello pad, 70 BPM, building from gentle to tense and back. Foley: birds chirping (exterior), footsteps on wood, clock ticking, water dripping on porcelain, fabric rustling, breathing.

STYLE: Photorealistic live-action, 35mm film grain, natural warm lighting, shallow depth of field.`;

  console.log(`Prompt: ${prompt.length} chars`);

  // Submit Sora i2v via Higgsfield with seconds=60
  console.log("\nSubmitting Sora i2v 60s via Higgsfield...");
  const body: Record<string, unknown> = {
    prompt: prompt.slice(0, 2000),
    seconds: 60,
    aspect_ratio: "16:9",
  };
  if (portraitUrl) body.image_url = portraitUrl;

  const res = await fetch("https://platform.higgsfield.ai/sora-2/image-to-video", {
    method: "POST",
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data: any = await res.json();
  if (!data.request_id) {
    console.error("Submit failed:", JSON.stringify(data).slice(0, 300));
    await p.$disconnect();
    return;
  }
  console.log(`✓ Submitted: ${data.request_id}`);
  console.log(`   Cost estimate: $${(0.10 * 60).toFixed(2)}`);

  // Poll
  console.log("\nPolling...");
  const start = Date.now();
  while (Date.now() - start < 15 * 60 * 1000) {
    await new Promise((r) => setTimeout(r, 30_000));
    const elapsed = Math.round((Date.now() - start) / 1000);
    try {
      const r = await fetch(`https://platform.higgsfield.ai/requests/${data.request_id}/status`, {
        headers: { Authorization: AUTH },
      });
      const d: any = await r.json();
      if (d.status === "completed") {
        const url = d.video?.url ?? d.images?.[0]?.url ?? "(no url)";
        console.log(`[${elapsed}s] ✅ DONE: ${url}`);
        break;
      } else if (d.status === "failed" || d.status === "nsfw") {
        console.log(`[${elapsed}s] ❌ ${d.status}`);
        break;
      } else {
        console.log(`[${elapsed}s] ⏳ ${d.status}`);
      }
    } catch {}
  }
  await p.$disconnect();
})();
