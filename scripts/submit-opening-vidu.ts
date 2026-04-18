/**
 * Submit "Echoes of Tomorrow" opening to Vidu Q1 via fal.
 * Vidu Q1 supports up to 7 reference subjects → all 4 cast portraits go in.
 * Max 8 seconds. Then the brain authors a tight character-led prompt + plot hint.
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const FAL_KEY = process.env.FAL_API_KEY?.replace(/\\n$/, "").replace(/\s+/g, "") ?? "";
const GEM = process.env.GEMINI_API_KEY?.replace(/\\n$/, "").replace(/\s+/g, "") ?? "";

(async () => {
  if (!FAL_KEY) { console.error("FAL_API_KEY required"); return; }
  if (!GEM) { console.error("GEMINI_API_KEY required"); return; }

  const o = await p.seasonOpening.findFirst({
    where: { season: { series: { title: "Echoes of Tomorrow" } } },
    include: { season: { include: { series: { include: { project: true } } } } },
  });
  if (!o) { console.error("opening not found"); return; }

  // Fetch the cast with reference portraits
  const cast = await p.character.findMany({
    where: { id: { in: o.characterIds } },
    include: { media: { orderBy: { createdAt: "asc" } } },
  });
  console.log(`cast (${cast.length}): ${cast.map((c) => `${c.name}[${c.media.length}]`).join(", ")}`);

  const refUrls = cast.map((c) => c.media[0]?.fileUrl).filter((u): u is string => !!u).slice(0, 7);
  if (refUrls.length < cast.length) console.warn(`only ${refUrls.length}/${cast.length} characters have a portrait`);

  // 1) Brain authors the Vidu prompt (no Sora moderation worries — Vidu can render anomaly visuals)
  const refs = await p.brainReference.findMany({
    where: { kind: { in: ["cinematography", "capability"] } },
    select: { kind: true, name: true, shortDesc: true },
    take: 50,
  });
  const cinemaBlock = refs.filter((r) => r.kind === "cinematography").slice(0, 20).map((r) => `- ${r.name}: ${r.shortDesc ?? ""}`).join("\n");
  const capabilityBlock = refs.filter((r) => r.kind === "capability").slice(0, 20).map((r) => `- ${r.name}: ${r.shortDesc ?? ""}`).join("\n");

  const castBlock = cast.map((c, i) => `${i + 1}. ${c.name}${c.roleType ? ` (${c.roleType})` : ""} — ${(c.appearance ?? "").slice(0, 160)}${c.wardrobeRules ? ` | wardrobe: ${c.wardrobeRules.slice(0, 80)}` : ""}`).join("\n");

  const systemPrompt = `You are the AI Director of "Echoes of Tomorrow", a warm character-driven cinematic drama.
Today's task: author the Vidu Q1 opening title sequence prompt — 8 seconds, 16:9, character-led.

Series world: luminous modern villa on an obsidian cliff, mercury-finish mirror walls, polished obsidian floors, tall glass windows, warm amber dawn light. Arri Alexa color science, warm cream/amber palette, natural film grain. Score: piano + soft strings.

Cast (Vidu will receive ${refUrls.length} reference portraits — render each face faithfully from the references):
${castBlock}

Cinematography refs you've authored:
${cinemaBlock}

Production capabilities you've learned:
${capabilityBlock}

CONSTRAINTS for THIS opening:
1. 8 SECONDS TOTAL. Plan tight beats.
2. Show ALL ${cast.length} cast members on screen. Each gets a brief hero moment + a clean white sans-serif name card spelling their name EXACTLY as listed above. Each name card holds ≥1.5 seconds.
3. End with the title 'ECHOES OF TOMORROW' centered, 15% safe margins, clean white sans-serif.
4. The mood is wonder + curiosity, NOT thriller, NOT noir. No dark psychology, no surveillance, no dread.
5. Vidu CAN render mirror anomalies (it doesn't have Sora's post-render moderation), so you MAY include a single subtle plot hint — e.g., one character's reflection moves a beat after they do — but it's optional. Keep it elegant if you include it.
6. Audio: gentle piano + warm strings. A single calm male narrator says "Echoes of Tomorrow" at 00:07. No other dialogue.
7. Photorealistic live-action film. Real human actors, real skin, real eyes. NOT animation, NOT CGI, NOT cartoon.
8. Keep prompt ≤1100 chars. Positive phrasing only.

Respond with ONLY valid JSON:
{
  "prompt": "the 8-second Vidu Q1 prompt as one block of clean prose with [TIME] markers",
  "rationale": "2-3 sentences naming the references you applied",
  "perCharSeconds": "approximate seconds allocated per character"
}`;

  console.log("\n━━━ calling director for Vidu opening ━━━");
  let composed: any = null;
  for (const model of ["gemini-3-flash-preview", "gemini-flash-latest"]) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEM}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.7, maxOutputTokens: 6000, thinkingConfig: { thinkingBudget: 0 } },
        }),
        signal: AbortSignal.timeout(60_000),
      });
      const d: any = await r.json();
      if (!r.ok) { console.log(`  ${model}: ${d?.error?.message}`); continue; }
      const raw = d?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const fb = raw.indexOf("{"); const lb = raw.lastIndexOf("}");
      composed = JSON.parse(raw.slice(fb, lb + 1));
      console.log(`✓ ${model}`);
      break;
    } catch (e: any) { console.log(`  ${model}: ${e.message}`); }
  }
  if (!composed?.prompt) { console.error("brain failed"); return; }
  console.log(`\nprompt (${composed.prompt.length} chars):\n${composed.prompt}\n`);
  console.log(`rationale: ${composed.rationale}`);

  // 2) Update opening row → Vidu Q1, status DRAFT, save new prompt
  await p.seasonOpening.update({
    where: { id: o.id },
    data: {
      model: "vidu-q1",
      provider: "fal",
      duration: 8,
      currentPrompt: composed.prompt,
      status: "DRAFT",
      videoUri: null,
      videoUrl: null,
      falRequestId: null,
      chunkPrompts: undefined as any,
      chunkVideoIds: undefined as any,
      chunkIndex: 0,
    },
  });

  // 3) Submit to fal Vidu Q1 reference-to-video
  console.log("\n━━━ submitting to fal Vidu Q1 ━━━");
  const submitRes = await fetch("https://queue.fal.run/fal-ai/vidu/q1/reference-to-video", {
    method: "POST",
    headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: composed.prompt.slice(0, 1200),
      reference_image_urls: refUrls,
      duration: "8",
      aspect_ratio: "16:9",
    }),
  });
  const submitData: any = await submitRes.json();
  if (!submitRes.ok) { console.error("fal submit:", JSON.stringify(submitData).slice(0, 400)); return; }
  const requestId = submitData.request_id ?? submitData.requestId;
  console.log(`✓ submitted: requestId=${requestId}`);

  await p.seasonOpening.update({
    where: { id: o.id },
    data: { status: "GENERATING", falRequestId: requestId },
  });

  // 4) Poll fal until complete
  console.log("polling fal every 15s...");
  const start = Date.now();
  let videoUrl: string | null = null;
  while (Date.now() - start < 10 * 60 * 1000) {
    await new Promise((r) => setTimeout(r, 15_000));
    const sr = await fetch(`https://queue.fal.run/fal-ai/vidu/q1/requests/${requestId}/status?logs=1`, {
      headers: { Authorization: `Key ${FAL_KEY}` },
    });
    const sd: any = await sr.json();
    const elapsed = Math.round((Date.now() - start) / 1000);
    console.log(`[${elapsed}s] fal status=${sd.status} queue_position=${sd.queue_position ?? "-"}`);
    if (sd.status === "COMPLETED") {
      const rr = await fetch(`https://queue.fal.run/fal-ai/vidu/q1/requests/${requestId}`, {
        headers: { Authorization: `Key ${FAL_KEY}` },
      });
      const rd: any = await rr.json();
      videoUrl = rd?.video?.url ?? rd?.output?.video?.url ?? null;
      console.log(`✓ COMPLETED. videoUrl=${videoUrl}`);
      break;
    }
    if (sd.status === "ERROR" || sd.status === "FAILED") {
      console.error("❌ fal failed:", JSON.stringify(sd).slice(0, 400));
      await p.seasonOpening.update({
        where: { id: o.id },
        data: { status: "FAILED", videoUri: `ERROR:fal Vidu ${sd.status}: ${JSON.stringify(sd.logs ?? "").slice(0, 300)}` },
      });
      return;
    }
  }
  if (!videoUrl) { console.error("timeout"); return; }

  // 5) Save asset + flip opening to READY
  await p.asset.create({
    data: {
      projectId: o.season.series.projectId,
      entityType: "SEASON_OPENING",
      entityId: o.id,
      assetType: "VIDEO",
      fileUrl: videoUrl,
      mimeType: "video/mp4",
      status: "READY",
      durationSeconds: 8,
      metadata: { provider: "fal", model: "vidu-q1", costUsd: 0.64, kind: "vidu-cast-opening", refCount: refUrls.length, falRequestId: requestId } as any,
    },
  });
  await p.seasonOpening.update({
    where: { id: o.id },
    data: { status: "READY", videoUrl, videoUri: requestId },
  });
  console.log("\n✅ READY. videoUrl=" + videoUrl);
  await p.$disconnect();
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
