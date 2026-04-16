import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

function inferEngine(model: string): string {
  const m = (model || "").toLowerCase();
  if (m.includes("veo") || m.includes("imagen-video")) return "gemini-video";
  if (m.includes("image") || m.includes("imagen") || m.includes("nano-banana")) return "gemini-image";
  if (m.includes("gemini") || m.includes("bison") || m.includes("flash")) return "gemini";
  if (m.includes("claude") || m.includes("haiku") || m.includes("sonnet") || m.includes("opus")) return "claude";
  if (m.includes("gpt") || m.includes("o1") || m.includes("sora")) return "openai";
  if (m.includes("elevenlabs") || m.includes("eleven")) return "elevenlabs";
  if (m.includes("luma") || m.includes("ray")) return "luma";
  if (m.includes("fal") || m.includes("seedance")) return "fal";
  return "other"; // named but unrecognised — better than "unknown"
}

(async () => {
  const unknown = await p.apiUsage.findMany({
    where: { OR: [{ engine: "unknown" }, { engine: null as any }, { engine: "" }] },
    select: { id: true, model: true },
  });
  console.log(`Found ${unknown.length} rows with engine=unknown`);
  const byNew: Record<string, number> = {};
  let updated = 0;
  for (const row of unknown) {
    const newEngine = inferEngine(row.model);
    byNew[newEngine] = (byNew[newEngine] || 0) + 1;
    await p.apiUsage.update({ where: { id: row.id }, data: { engine: newEngine } });
    updated++;
  }
  console.log(`Updated ${updated} rows. Breakdown:`);
  for (const [k, v] of Object.entries(byNew)) console.log(`  ${k}: ${v}`);
  await p.$disconnect();
})();
