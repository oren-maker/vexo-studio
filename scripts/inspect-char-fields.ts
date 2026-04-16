import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const chars = await p.character.findMany({ include: { media: true } });
  for (const c of chars) {
    console.log(`--- ${c.name} ---`);
    console.log(`  appearance: ${c.appearance?.slice(0, 100) ?? ""}`);
    console.log(`  personality: ${c.personality?.slice(0, 100) ?? ""}`);
    console.log(`  wardrobeRules: ${c.wardrobeRules?.slice(0, 100) ?? ""}`);
    console.log(`  roleType: ${c.roleType ?? ""}`);
    for (const m of c.media) {
      const md: any = m.metadata;
      console.log(`  media: angle=${md?.angle} provider=${md?.provider} url=${m.fileUrl.slice(-50)}`);
    }
  }
  await p.$disconnect();
})();
