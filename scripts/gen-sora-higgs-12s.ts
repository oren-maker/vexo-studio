import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const AUTH = "Key e2ca9f1f-a58e-40ce-b07e-79685643ae8c:80567f1f8feaf739754d3c122ded287ac791acb9f5164514d9b0ec091480fa2a";

(async () => {
  const maya = await p.character.findFirst({
    where: { name: { contains: "Maya" } },
    include: { media: { orderBy: { createdAt: "asc" }, take: 1 } },
  });
  const portraitUrl = maya?.media?.[0]?.fileUrl;
  console.log("Maya portrait:", portraitUrl ? portraitUrl.slice(0, 80) : "NONE");

  const prompt = `The reference image shows Maya Ellis — keep her face and appearance EXACTLY as shown throughout the entire video.

00:00-00:03: Aerial shot descending from sky toward a quiet suburban house at golden dawn. Large white text "SEASON 1 · EPISODE 1" centered on screen. Narrator reads it aloud.

00:03-00:06: Camera pushes through the front door into a sunlit hallway. Morning light, wooden floors, family photos on walls. Clock ticking, birds chirping.

00:06-00:09: Camera enters the bathroom. Maya stands at a marble sink looking into the mirror. Water drips from the faucet. Soft piano score building tension.

00:09-00:12: Close-up on Maya's face in the mirror. Her reflection blinks out of sync. Her expression shifts to confusion. Last 1 second fades to black, audio ducks to silence.

Photorealistic live-action, 35mm film grain, natural warm lighting.`;

  console.log("Prompt:", prompt.length, "chars");

  const body: any = {
    prompt,
    duration: 12,
    aspect_ratio: "16:9",
  };
  if (portraitUrl) body.image_url = portraitUrl;

  console.log("\nSubmitting Sora i2v 12s via Higgsfield...");
  const res = await fetch("https://platform.higgsfield.ai/sora-2/image-to-video", {
    method: "POST",
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data: any = await res.json();
  if (!data.request_id) {
    console.error("Failed:", JSON.stringify(data).slice(0, 300));
    await p.$disconnect();
    return;
  }
  console.log("✓ Submitted:", data.request_id);

  // Poll
  const start = Date.now();
  while (Date.now() - start < 10 * 60 * 1000) {
    await new Promise((r) => setTimeout(r, 20_000));
    const elapsed = Math.round((Date.now() - start) / 1000);
    try {
      const r = await fetch(`https://platform.higgsfield.ai/requests/${data.request_id}/status`, {
        headers: { Authorization: AUTH },
      });
      const d: any = await r.json();
      if (d.status === "completed") {
        console.log(`[${elapsed}s] ✅ DONE: ${d.video?.url ?? "(no url)"}`);
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
