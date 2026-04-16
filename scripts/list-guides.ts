import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const guides = await p.guide.findMany({
    select: { slug: true, translations: { select: { title: true, lang: true } } },
    orderBy: { createdAt: "desc" },
  });
  console.log(`Total: ${guides.length}`);
  for (const g of guides) {
    const t = g.translations.find((x) => x.lang === "he") || g.translations[0];
    console.log(`${g.slug} :: ${t?.title ?? "(untitled)"}`);
  }
  await p.$disconnect();
})();
