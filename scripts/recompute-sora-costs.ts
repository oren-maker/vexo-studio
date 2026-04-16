// Some Sora ApiUsage rows were logged with model="sora-2" but cost=0 because
// the PRICING table didn't have an entry for sora-2 yet. We have meta.seconds
// stored — re-derive cost = $0.10 * seconds and update the row.
// Also flips engine="openai" → "openai-video" so the Wallets card groups them
// under OpenAI Video.

import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

(async () => {
  const rows = await p.apiUsage.findMany({
    where: { OR: [{ model: "sora-2" }, { model: "sora-2-pro" }] },
    select: { id: true, model: true, usdCost: true, meta: true, engine: true, videoSeconds: true },
  });
  console.log(`Found ${rows.length} Sora rows`);
  let updated = 0;
  for (const r of rows) {
    const meta: any = r.meta || {};
    const seconds = Number(meta.seconds ?? r.videoSeconds ?? 0);
    const rate = r.model === "sora-2-pro" ? 0.30 : 0.10;
    const computed = +(seconds * rate).toFixed(4);
    const targetEngine = "openai-video";
    if ((computed > 0 && r.usdCost !== computed) || r.engine !== targetEngine) {
      await p.apiUsage.update({
        where: { id: r.id },
        data: {
          usdCost: computed > 0 ? computed : r.usdCost,
          videoSeconds: seconds || r.videoSeconds,
          engine: targetEngine,
        },
      });
      updated++;
    }
  }
  console.log(`Updated ${updated} rows.`);
  await p.$disconnect();
})();
