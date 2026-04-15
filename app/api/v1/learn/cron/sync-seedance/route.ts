import { NextRequest, NextResponse } from "next/server";
import { syncSeedanceRepo } from "@/lib/learn/seedance-parser";

// Vercel Cron daily at 03:00 UTC.
// Protected by CRON_SECRET (auto-set by Vercel on crons, checked via Authorization header).

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const result = await syncSeedanceRepo();
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    console.error("[cron sync-seedance]", e);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
