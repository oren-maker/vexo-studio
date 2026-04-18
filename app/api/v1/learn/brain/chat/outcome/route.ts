import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";

export const runtime = "nodejs";

// Tiny telemetry endpoint — the chat UI pings this when Oren clicks Cancel on
// an action, so the calibration dataset (ActionOutcome) records rejections
// with the same confidence the brain assigned. Without this, we'd only see
// accepts + system errors, which biases ECE toward looking overconfident.
export async function POST(req: NextRequest) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;
  try {
    const { chatId, actionType, confidence, outcome, meta } = await req.json();
    if (!actionType || !outcome) {
      return NextResponse.json({ error: "actionType and outcome required" }, { status: 400 });
    }
    if (!["rejected", "undone"].includes(outcome)) {
      return NextResponse.json({ error: "outcome must be 'rejected' or 'undone'" }, { status: 400 });
    }
    await (prisma as any).actionOutcome.create({
      data: {
        chatId: chatId ?? null,
        actionType,
        confidence: typeof confidence === "number" ? confidence : null,
        outcome,
        meta: meta ?? null,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e).slice(0, 300) }, { status: 500 });
  }
}
