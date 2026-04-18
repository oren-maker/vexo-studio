/**
 * Probe: send the current saved opening prompt to Sora and capture the EXACT
 * moderation rejection so we can see what tripped the filter.
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const KEY = process.env.OPENAI_API_KEY?.replace(/\\n$/, "");
if (!KEY) { console.error("OPENAI_API_KEY required"); process.exit(1); }

(async () => {
  const o = await p.seasonOpening.findFirst({
    where: { season: { series: { title: "Echoes of Tomorrow" } } },
  });
  if (!o) return;
  console.log("prompt:\n" + o.currentPrompt + "\n");
  const r = await fetch("https://api.openai.com/v1/videos", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "sora-2",
      prompt: o.currentPrompt,
      seconds: "20",
      size: "1280x720",
    }),
  });
  const d: any = await r.json();
  console.log("status=" + r.status);
  console.log("response=" + JSON.stringify(d, null, 2));
  await p.$disconnect();
})();
