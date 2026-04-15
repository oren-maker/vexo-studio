import { NextRequest, NextResponse } from "next/server";
import { improvePrompt } from "@/lib/learn/gemini-improve";

// VEXO Studio calls this before handing a prompt to FAL. Returns the full critique
// plus an improved version. VEXO's Director can use improvedPrompt automatically
// or surface the scores/suggestions to a human reviewer.
//
// POST /api/internal/improve-prompt
// Body: { prompt: string }
// Auth: x-internal-key

export const maxDuration = 60;

function checkAuth(req: NextRequest) {
  const key = req.headers.get("x-internal-key");
  return key && key === process.env.INTERNAL_API_KEY;
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { prompt } = await req.json().catch(() => ({}));
  if (!prompt || typeof prompt !== "string") {
    return NextResponse.json({ error: "prompt string required" }, { status: 400 });
  }
  try {
    const result = await improvePrompt(prompt);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
