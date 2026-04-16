import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "@/lib/learn/db";

export const runtime = "nodejs";
export const maxDuration = 60;

// Debug: return Gemini's RAW response so we can see why JSON parsing fails.
export async function POST(req: NextRequest) {
  const { sourceId } = await req.json();
  const source = await prisma.learnSource.findUnique({ where: { id: sourceId } });
  if (!source) return NextResponse.json({ error: "source not found" }, { status: 404 });

  const brief = `Create 1 distinct variation inspired by this prompt (different subject or scene, same style/structure):\n\n${source.prompt.slice(0, 800)}`;

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({
    model: "gemini-3-flash-preview",
    systemInstruction: `You output JSON only. Schema: { "prompt": "string", "rationale": "string" }`,
    generationConfig: { responseMimeType: "application/json", temperature: 0.8, maxOutputTokens: 4096 },
  });

  const result = await model.generateContent(brief);
  const raw = result.response.text();

  let parsed: any = null;
  let parseErr: string | null = null;
  try {
    parsed = JSON.parse(raw);
  } catch (e: any) {
    parseErr = String(e.message);
  }

  return NextResponse.json({
    rawLength: raw.length,
    rawHead: raw.slice(0, 800),
    rawTail: raw.slice(-300),
    parseError: parseErr,
    hasPromptField: parsed ? Object.keys(parsed) : null,
  });
}
