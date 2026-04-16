/**
 * Scene video assets that came from Sora/VEO don't have costUsd in their
 * metadata — the UI reads v.metadata.costUsd, so the scene "סה"כ" shows $0.
 * Infer cost from provider+model+durationSeconds and patch.
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const RATES: Record<string, number> = { "sora-2": 0.10, "sora-2-pro": 0.30 };
(async () => {
  const assets = await p.asset.findMany({
    where: { entityType: "SCENE", assetType: "VIDEO", status: "READY" },
  });
  let patched = 0;
  for (const a of assets) {
    const m: any = a.metadata ?? {};
    if (typeof m.costUsd === "number" && m.costUsd > 0) continue;
    if (m.provider !== "openai" && m.provider !== "openai-sora") continue;
    const rate = RATES[m.model as string] ?? 0.10;
    const dur = Number(m.durationSeconds ?? 0);
    if (!dur) continue;
    const costUsd = +(rate * dur).toFixed(4);
    await p.asset.update({
      where: { id: a.id },
      data: { metadata: { ...m, costUsd } as object },
    });
    console.log(`${a.id.slice(-8)} · ${m.model} · ${dur}s → $${costUsd}`);
    patched++;
  }
  console.log(`\n✅ patched ${patched} scene-video assets`);
  await p.$disconnect();
})();
