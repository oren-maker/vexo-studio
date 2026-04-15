import { NextRequest, NextResponse } from "next/server";
import { searchPexels } from "@/lib/learn/pexels";
import { searchYouTube } from "@/lib/learn/youtube";
import { rateLimit, getClientKey } from "@/lib/learn/rate-limit";

export async function GET(req: NextRequest) {
  const rl = rateLimit(`search:${getClientKey(req)}`, 30, 3600_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "rate limit exceeded (30/hour)" }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const source = searchParams.get("source") || "pexels";

  if (!q) return NextResponse.json({ error: "q נדרש" }, { status: 400 });

  try {
    if (source === "pexels") {
      const results = await searchPexels(q, 3);
      return NextResponse.json({ results });
    }
    if (source === "youtube") {
      const results = await searchYouTube(q, 3);
      return NextResponse.json({ results });
    }
    return NextResponse.json({ error: "מקור לא נתמך (pexels / youtube)" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
