/**
 * Daily brain-proposals cron.
 *
 * Every morning, scans the live corpus and emits up to 3 concrete upgrade
 * proposals into BrainUpgradeRequest with context="daily-proposal", waiting
 * for the user's approval before any implementation.
 *
 * Ported from vexo-learn after Oren asked (BrainUpgradeRequest #xbepcw) for a
 * "daily proposals mode" so the brain shifts from reactive to proactive.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const proposals: Array<{ instruction: string; priority: number }> = [];

    // Proposal 1 — short prompts that need enrichment.
    const shortPrompts = await prisma.learnSource.findMany({
      where: { status: "complete", prompt: { not: "" } },
      select: { id: true, title: true, prompt: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const tooShort = shortPrompts.filter((s) => s.prompt.split(/\s+/).length < 300);
    if (tooShort.length >= 3) {
      proposals.push({
        instruction: `זוהו ${tooShort.length} פרומפטים קצרים (<300 מילים) שחסרות בהם טכניקות קולנועיות. כדאי להריץ job שמעשיר כל אחד ל-400-900 מילים עם 8 הסעיפים המלאים.\n\nדוגמאות: ${tooShort.slice(0, 3).map((s) => s.title || s.id.slice(-8)).join(", ")}.`,
        priority: 2,
      });
    }

    // Proposal 2 — potential duplicates by first-100-char similarity.
    const allPrompts = await prisma.learnSource.findMany({
      where: { status: "complete", prompt: { not: "" } },
      select: { id: true, title: true, prompt: true },
      take: 400,
    });
    const seen = new Map<string, string[]>();
    for (const p of allPrompts) {
      const key = p.prompt.slice(0, 100).toLowerCase().replace(/\s+/g, " ").trim();
      if (!seen.has(key)) seen.set(key, []);
      seen.get(key)!.push(p.id);
    }
    const dupeGroups = Array.from(seen.values()).filter((ids) => ids.length > 1);
    if (dupeGroups.length > 0) {
      const totalDupes = dupeGroups.reduce((sum, g) => sum + g.length - 1, 0);
      proposals.push({
        instruction: `זוהו ${dupeGroups.length} קבוצות של פרומפטים דומים (${totalDupes} כפילויות פוטנציאליות) לפי תחילית טקסט זהה. כדאי לסקור ידנית או דרך embedding similarity ולמזג.\n\nדוגמה: ${dupeGroups[0].slice(0, 3).map((id) => id.slice(-8)).join(", ")}.`,
        priority: 2,
      });
    }

    // Proposal 3 — knowledge node coverage too low.
    const [nodeCount, sourceCount] = await Promise.all([
      prisma.knowledgeNode.count(),
      prisma.learnSource.count({ where: { status: "complete" } }),
    ]);
    const ratio = sourceCount > 0 ? nodeCount / sourceCount : 0;
    if (ratio < 10) {
      proposals.push({
        instruction: `יחס Knowledge Nodes לפרומפטים נמוך (${ratio.toFixed(1)} nodes/prompt). ממוצע מומלץ הוא >15. כדאי להריץ pattern-extract מחדש על פרומפטים שלא נוצרו להם עדיין nodes.`,
        priority: 3,
      });
    }

    // Save — dedup against last 7 days so we don't spam the same proposal.
    const created: string[] = [];
    for (const p of proposals) {
      const recent = await prisma.brainUpgradeRequest.findFirst({
        where: {
          context: "daily-proposal",
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) },
          instruction: { startsWith: p.instruction.slice(0, 40) },
        },
      });
      if (recent) continue;
      const row = await prisma.brainUpgradeRequest.create({
        data: { instruction: p.instruction, context: "daily-proposal", status: "pending", priority: p.priority },
      });
      created.push(row.id);
    }

    return NextResponse.json({ ok: true, generated: created.length, totalProposals: proposals.length });
  } catch (e: any) {
    console.error("[brain-proposals]", e);
    return NextResponse.json({ error: String(e?.message || e).slice(0, 400) }, { status: 500 });
  }
}
