import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const [episodes, scenes, chars, guides, sources, nodes, chats, msgs, openings] = await Promise.all([
    p.episode.count(),
    p.scene.count(),
    p.character.count(),
    p.guide.count(),
    p.learnSource.count(),
    p.knowledgeNode.count(),
    p.brainChat.count(),
    p.brainMessage.count(),
    p.seasonOpening.count(),
  ]);
  const videos = await p.asset.count({ where: { assetType: "VIDEO" } });
  const images = await p.asset.count({ where: { assetType: "IMAGE" } });
  const apiUsage = await p.apiUsage.aggregate({ _sum: { usdCost: true }, _count: true });
  const costEntries = await p.costEntry.aggregate({ _sum: { totalCost: true }, _count: true });
  const providers = await p.provider.findMany({ include: { wallet: true } });

  console.log("=== VEXO STUDIO METRICS ===\n");
  console.log("📊 תוכן:");
  console.log(`  פרקים: ${episodes}`);
  console.log(`  סצנות: ${scenes}`);
  console.log(`  דמויות: ${chars}`);
  console.log(`  פתיחות עונה: ${openings}`);
  console.log(`  סרטונים: ${videos}`);
  console.log(`  תמונות: ${images}`);
  console.log("\n🧠 מוח:");
  console.log(`  שיחות: ${chats}`);
  console.log(`  הודעות: ${msgs}`);
  console.log(`  מדריכים: ${guides}`);
  console.log(`  מקורות: ${sources}`);
  console.log(`  Knowledge Nodes: ${nodes}`);
  console.log("\n💰 ארנקות:");
  for (const pr of providers) {
    if (!pr.wallet) continue;
    const spent = pr.wallet.totalCreditsAdded - pr.wallet.availableCredits;
    console.log(`  ${pr.name}: $${pr.wallet.availableCredits.toFixed(2)} זמין · $${spent.toFixed(2)} נוצל · $${pr.wallet.totalCreditsAdded.toFixed(2)} הוטען`);
  }
  console.log("\n📈 סיכום הוצאות:");
  console.log(`  ApiUsage: $${(apiUsage._sum.usdCost ?? 0).toFixed(2)} (${apiUsage._count} רשומות)`);
  console.log(`  CostEntry: $${(costEntries._sum.totalCost ?? 0).toFixed(2)} (${costEntries._count} רשומות)`);
  await p.$disconnect();
})();
