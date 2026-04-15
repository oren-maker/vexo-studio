import { NextRequest, NextResponse } from "next/server";
import { generateImageFromPrompt } from "@/lib/learn/gemini-image";
import { requireAdmin } from "@/lib/learn/auth";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(req: NextRequest) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;
  try {
    const { prompt } = await req.json();
    const r = await generateImageFromPrompt(prompt || "A vivid still of a street dancer mid-air at golden hour, photoreal 8K");
    return NextResponse.json({ ok: true, ...r });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e).slice(0, 500) }, { status: 500 });
  }
}
