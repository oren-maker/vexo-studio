import { NextRequest, NextResponse } from "next/server";
import { computeCorpusInsights } from "@/lib/learn/corpus-insights";

// VEXO Director can pull these rules to inject into its own system prompt.
// They are data-derived insights about what makes a prompt work, learned from
// cross-corpus analysis of 200+ curated examples.

function checkAuth(req: NextRequest) {
  const key = req.headers.get("x-internal-key");
  return key && key === process.env.INTERNAL_API_KEY;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const insights = await computeCorpusInsights();
  return NextResponse.json({
    rules: insights.derivedRules,
    cooccurrences: insights.cooccurrencePairs.slice(0, 8).map((p) => ({ pair: [p.a, p.b], lift: p.lift })),
    styleProfiles: insights.styleProfiles.map((s) => ({
      style: s.style,
      signaturePhrases: s.signaturePhrases,
      topTechniques: s.topTechniques.map((t) => t.name),
    })),
    stats: insights.totals,
  });
}
