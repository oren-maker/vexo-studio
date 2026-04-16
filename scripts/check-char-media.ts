import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const chars = await p.character.findMany({ include: { media: true } });
  for (const c of chars) {
    const sheet = c.media.filter((m: any) => m.metadata?.angle === "sheet").length;
    const other = c.media.length - sheet;
    console.log(`${c.name}: total=${c.media.length} sheet=${sheet} legacy=${other}`);
  }
  await p.$disconnect();
})();
