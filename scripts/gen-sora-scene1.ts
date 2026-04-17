import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

(async () => {
  const maya = await p.character.findFirst({
    where: { name: { contains: "Maya" } },
    include: { media: { orderBy: { createdAt: "asc" } } },
  });
  if (!maya) { console.error("no Maya"); return; }
  const sheet = maya.media.find((m: any) => (m.metadata as any)?.angle === "sheet");
  const portrait = sheet ?? maya.media[0];
  console.log("Maya portrait:", portrait?.fileUrl?.slice(0, 100));
  if (!portrait?.fileUrl) { console.error("no portrait"); return; }

  // Sora prompt — Maya close-up start, camera pulls back into scene
  const prompt = `The reference image shows Maya Ellis, the protagonist. Start from a close-up of her face exactly as shown in the reference — olive skin, dark brown wavy hair in a messy bun, charcoal silk robe. She stands in a modern bathroom at a marble sink, morning light through frosted glass window. Camera slowly pulls back revealing the bathroom. Her reflection in the mirror blinks slightly out of sync with her. Large white text "SEASON 1 · EPISODE 1" appears centered on screen during the first 3 seconds, then fades. Soft piano score and ambient sounds throughout — clock ticking, water dripping, birds outside. Photorealistic live-action, 35mm film grain, natural warm lighting. Last 1.5 seconds fade smoothly to black.`;

  console.log(`Prompt: ${prompt.length} chars`);

  // Submit to Sora
  const KEY = (process.env.OPENAI_API_KEY ?? "").trim() ||
    require("fs").readFileSync(".env.prod", "utf8").match(/OPENAI_API_KEY="([^"\\]+)/)?.[1]?.trim();
  if (!KEY) { console.error("no OPENAI_API_KEY"); return; }

  // Resize Maya's portrait for Sora (must match 1280x720)
  const imgRes = await fetch(portrait.fileUrl);
  const imgBuf = Buffer.from(await imgRes.arrayBuffer());
  const sharp = (await import("sharp")).default;
  const resized = await sharp(imgBuf).resize(1280, 720, { fit: "cover" }).jpeg().toBuffer();

  const FormData = (await import("form-data")).default;
  const form = new FormData();
  form.append("model", "sora-2");
  form.append("prompt", prompt);
  form.append("seconds", "20");
  form.append("size", "1280x720");
  form.append("image", resized, { filename: "maya.jpg", contentType: "image/jpeg" });

  console.log("Submitting to Sora i2v...");
  const res = await fetch("https://api.openai.com/v1/videos", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, ...form.getHeaders() },
    body: form.getBuffer(),
  });
  if (!res.ok) {
    console.error(`Sora ${res.status}: ${(await res.text()).slice(0, 400)}`);
    return;
  }
  const data: any = await res.json();
  console.log(`✓ Sora submitted: ${data.id}`);

  // Poll
  const start = Date.now();
  while (Date.now() - start < 10 * 60 * 1000) {
    await new Promise((r) => setTimeout(r, 20_000));
    const elapsed = Math.round((Date.now() - start) / 1000);
    const poll = await fetch(`https://api.openai.com/v1/videos/${data.id}`, {
      headers: { Authorization: `Bearer ${KEY}` },
    });
    const pd: any = await poll.json();
    if (pd.status === "completed") {
      const proxyUrl = `https://vexo-studio.vercel.app/api/v1/videos/sora-proxy?id=${data.id}`;
      console.log(`[${elapsed}s] ✅ DONE`);
      console.log(`   Proxy: ${proxyUrl}`);
      console.log(`   Direct download: https://api.openai.com/v1/videos/${data.id}/content`);
      break;
    } else if (pd.status === "failed") {
      console.log(`[${elapsed}s] ❌ FAILED`);
      break;
    } else {
      console.log(`[${elapsed}s] ⏳ ${pd.status} ${pd.progress ?? ""}%`);
    }
  }
  await p.$disconnect();
})();
