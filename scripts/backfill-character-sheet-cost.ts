/**
 * The migration script created CharacterMedia sheet rows but forgot to write
 * CostEntry rows — so the UI (which joins to CostEntry) shows $0.0000 for
 * every sheet. Backfill one CostEntry per existing sheet at the real
 * nano-banana price.
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const NANO_BANANA_USD = 0.04;

(async () => {
  const sheets = await p.characterMedia.findMany({
    where: { metadata: { path: ["angle"], equals: "sheet" } as any },
    include: { character: { select: { id: true, name: true, projectId: true, project: { select: { organizationId: true } } } } },
  });
  console.log(`Found ${sheets.length} sheets`);
  const falProvider = await p.provider.findFirst({ where: { name: { contains: "fal", mode: "insensitive" } } });
  let added = 0;
  for (const m of sheets) {
    const existing = await p.costEntry.findFirst({ where: { entityType: "CHARACTER_MEDIA", entityId: m.id } });
    if (existing) { console.log(`skip ${m.character.name} — already has CostEntry`); continue; }
    await p.costEntry.create({
      data: {
        entityType: "CHARACTER_MEDIA",
        entityId: m.id,
        costCategory: "GENERATION",
        description: `Character sheet: ${m.character.name}`,
        unitCost: NANO_BANANA_USD,
        quantity: 1,
        totalCost: NANO_BANANA_USD,
        sourceType: "BACKFILL",
        projectId: m.character.projectId,
        providerId: falProvider?.id ?? null,
        createdAt: m.createdAt,
      },
    });
    added++;
    console.log(`add  ${m.character.name} — $${NANO_BANANA_USD}`);
  }
  console.log(`\nDone. Added ${added} CostEntry rows (${(added * NANO_BANANA_USD).toFixed(2)} USD).`);
  await p.$disconnect();
})();
