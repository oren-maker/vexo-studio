import { NextRequest, NextResponse } from "next/server";
import { computeDailyBrainCache } from "@/lib/learn/brain";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const r = await computeDailyBrainCache();
    return NextResponse.json({ ok: true, ...r });
  } catch (e: any) {
    console.error("[cron daily-brain]", e);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
