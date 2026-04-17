/**
 * Final session reconciliation — update all wallets + log all costs
 * from this entire Claude Code session (Apr 16-17, 2026).
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

(async () => {
  console.log("═══════════════════════════════════════");
  console.log("  SESSION COST RECONCILIATION");
  console.log("═══════════════════════════════════════\n");

  // ─── HIGGSFIELD ───
  // Real from dashboard: $37.50 total spent
  const higgs = await p.provider.findFirst({ where: { name: { contains: "Higgsfield", mode: "insensitive" } }, include: { wallet: true } });
  if (higgs?.wallet) {
    await p.creditWallet.update({ where: { id: higgs.wallet.id }, data: { availableCredits: 62.50 } });
    console.log("Higgsfield: $62.50 avail ($37.50 spent of $100)");
  }

  // ─── OPENAI ───
  // Previous: $134.80. Sora scene videos via UI: ~$8 (4 × $2). Sora script jobs: ~$10 (5 × $2). Total extra: ~$18
  const openai = await p.provider.findFirst({ where: { name: { contains: "OpenAI", mode: "insensitive" } }, include: { wallet: true } });
  if (openai?.wallet) {
    const newAvail = 134.80 - 18;
    await p.creditWallet.update({ where: { id: openai.wallet.id }, data: { availableCredits: Math.max(0, newAvail) } });
    console.log(`OpenAI: $${newAvail.toFixed(2)} avail ($${(200 - newAvail).toFixed(2)} spent of $200)`);
  }

  // ─── GOOGLE GEMINI ───
  // Brain chats + EP01 rebuilds (3 × Gemini scene gen) + director sheets (30+) + sound notes (30+) + critics (30+)
  // These go through Groq mostly, but some brain chats use Gemini directly
  // Estimate: ~50 Gemini calls × $0.003 = $0.15
  const gemini = await p.provider.findFirst({ where: { name: { contains: "Gemini", mode: "insensitive" } }, include: { wallet: true } });
  if (gemini?.wallet) {
    const newAvail = 160 - 14.30; // $14.30 total spent
    await p.creditWallet.update({ where: { id: gemini.wallet.id }, data: { availableCredits: newAvail } });
    console.log(`Gemini: $${newAvail.toFixed(2)} avail ($14.30 spent of $160)`);
  }

  // ─── SESSION COST SUMMARY ───
  console.log("\n═══════════════════════════════════════");
  console.log("  SESSION COST BREAKDOWN");
  console.log("═══════════════════════════════════════\n");

  const costs = {
    "Sora scene videos (UI)": { provider: "OpenAI", amount: 8.00, detail: "4 × $2 (20s each)" },
    "Sora script test jobs": { provider: "OpenAI", amount: 10.00, detail: "~5 direct API calls from scripts" },
    "Higgsfield Kling 3.0": { provider: "Higgsfield", amount: 32.88, detail: "8 calls × $4.11 avg" },
    "Higgsfield Seedance 1.5": { provider: "Higgsfield", amount: 3.94, detail: "7 calls × $0.56 avg" },
    "Higgsfield Soul": { provider: "Higgsfield", amount: 0.68, detail: "11 calls × $0.06 avg" },
    "EP01 rebuild #1 (Gemini)": { provider: "Gemini", amount: 0.01, detail: "1 scene-gen call" },
    "EP01 rebuild #2 (Gemini)": { provider: "Gemini", amount: 0.01, detail: "1 scene-gen call" },
    "EP01 director rebuild (Gemini)": { provider: "Gemini", amount: 0.02, detail: "1 long planning call" },
    "Director Sheets × 30": { provider: "Groq", amount: 0.09, detail: "30 calls × $0.003" },
    "Sound Notes × 30": { provider: "Groq", amount: 0.09, detail: "30 calls × $0.003" },
    "AI Critic × 30": { provider: "Groq", amount: 0.09, detail: "30 calls × $0.003" },
    "Brain chats": { provider: "Gemini", amount: 0.05, detail: "~15 chat messages" },
    "Character sheets (nano-banana)": { provider: "fal.ai", amount: 0.32, detail: "8 × $0.04" },
    "Remix suggest calls": { provider: "Groq", amount: 0.02, detail: "~4 calls" },
  };

  let total = 0;
  for (const [name, c] of Object.entries(costs)) {
    console.log(`  $${c.amount.toFixed(2).padStart(6)}  ${c.provider.padEnd(12)} ${name} — ${c.detail}`);
    total += c.amount;
  }
  console.log(`\n  ${"─".repeat(40)}`);
  console.log(`  $${total.toFixed(2).padStart(6)}  TOTAL SESSION COST`);

  console.log("\n═══════════════════════════════════════");
  console.log("  FINAL WALLET STATE");
  console.log("═══════════════════════════════════════\n");

  const all = await p.provider.findMany({ include: { wallet: true } });
  for (const pr of all) {
    if (!pr.wallet) continue;
    const spent = pr.wallet.totalCreditsAdded > 0 ? pr.wallet.totalCreditsAdded - pr.wallet.availableCredits : 0;
    console.log(`  ${pr.name.padEnd(15)} $${pr.wallet.availableCredits.toFixed(2).padStart(7)} avail · $${spent.toFixed(2).padStart(7)} spent · $${pr.wallet.totalCreditsAdded.toFixed(2).padStart(7)} topped`);
  }

  await p.$disconnect();
})();
