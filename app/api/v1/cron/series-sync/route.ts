/**
 * GET /api/v1/cron/series-sync
 * Daily cron (6 AM UTC) that triggers the series analysis sync.
 * Vercel cron calls this GET → we forward to the series-sync POST handler.
 */
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";

export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Verify cron secret
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Call the series-sync endpoint internally
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? `https://${req.headers.get("host")}`;
  try {
    const res = await fetch(`${baseUrl}/api/v1/learn/series-sync`, {
      method: "POST",
      headers: {
        "x-admin-key": process.env.ADMIN_API_KEY ?? "",
        "Content-Type": "application/json",
      },
    });
    const data = await res.json();
    return NextResponse.json({ ok: true, ...data });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
