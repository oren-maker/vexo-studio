import { NextRequest, NextResponse } from "next/server";
import { generatePromptWithClaude } from "@/lib/learn/claude-prompt";
import { requireAdmin } from "@/lib/learn/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;
  const { caption, thumbnailUrl } = await req.json();
  try {
    const r = await generatePromptWithClaude(caption, thumbnailUrl || null);
    return NextResponse.json({ ok: true, ...r });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e).slice(0, 500) }, { status: 500 });
  }
}
