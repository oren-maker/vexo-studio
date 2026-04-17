/**
 * Backfill metadata.kind = "remix" on the asset rows created today for
 * scene cmo2ayw3d0001d2620skafbia by the remix scripts. Looks up by
 * soraVideoId or by sceneLog action="video_remix" linkage.
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

// The 3 remix soraVideoIds from today's test runs:
const REMIX_SORA_IDS = [
  "video_69e2226fa4d481989f3ade97ce096c8d05f56417f6c5fc0d", // 1st remix (had portrait grid bug)
  "video_69e229276ae08190b16decf1d3b87d350866db7c6f106c02", // 2nd remix (v2, after sanitizer)
];

(async () => {
  let updated = 0;
  for (const soraId of REMIX_SORA_IDS) {
    const rows = await p.asset.findMany({
      where: { assetType: "VIDEO", fileUrl: { contains: soraId } },
      select: { id: true, metadata: true },
    });
    for (const r of rows) {
      const meta = (r.metadata as any) ?? {};
      if (meta.kind === "remix") continue;
      await p.asset.update({
        where: { id: r.id },
        data: {
          metadata: {
            ...meta,
            kind: "remix",
            soraVideoId: meta.soraVideoId ?? soraId,
          } as any,
        },
      });
      console.log(`✓ marked asset ${r.id.slice(-8)} as kind=remix`);
      updated++;
    }
  }
  console.log(`\n${updated} assets updated`);
  await p.$disconnect();
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
