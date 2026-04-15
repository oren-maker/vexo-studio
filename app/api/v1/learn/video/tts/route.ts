import { NextRequest, NextResponse } from "next/server";
import { synthesizeSpeech, type TtsVoice } from "@/lib/learn/gemini-tts";
import { requireAdmin } from "@/lib/learn/auth";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(req: NextRequest) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;
  try {
    const { text, voice } = await req.json();
    if (!text || typeof text !== "string") return NextResponse.json({ error: "text required" }, { status: 400 });
    const r = await synthesizeSpeech({ text, voice: (voice as TtsVoice) || "Aoede" });
    return NextResponse.json({ ok: true, ...r });
  } catch (e: any) {
    console.error("[tts]", e);
    return NextResponse.json({ ok: false, error: String(e?.message || e).slice(0, 500) }, { status: 500 });
  }
}
