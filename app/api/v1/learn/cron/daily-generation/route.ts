import { NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";
import { composePrompt } from "@/lib/learn/gemini-compose";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const API_KEY = process.env.GEMINI_API_KEY;

async function pickDailyTopic(): Promise<string> {
  // Use Gemini to pick a novel topic based on recent knowledge nodes + latest brain identity
  const [latestBrain, recentNodes, recentSources] = await Promise.all([
    prisma.dailyBrainCache.findFirst({ orderBy: { date: "desc" } }),
    prisma.knowledgeNode.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.learnSource.findMany({ where: { addedBy: "daily-generation" }, orderBy: { createdAt: "desc" }, take: 10, select: { title: true } }),
  ]);
  const identity = latestBrain?.identity?.slice(0, 400) || "מערכת חדשה";
  const nodes = recentNodes.map((n) => `${n.title}: ${n.body?.slice(0, 60) || ""}`).slice(0, 15).join(" | ");
  const recent = recentSources.map((s) => s.title).filter(Boolean).join(" | ");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: `אתה מוח של מערכת וידאו-פרומפטים.

זהות: ${identity}

Knowledge Nodes אחרונים: ${nodes}

נושאים שכבר יצרת ב-10 הימים האחרונים (אל תחזור!): ${recent}

החזר JSON בודד: {"brief": "תיאור מפורט של סצנה חדשה ויצירתית ליצירת פרומפט וידאו, 2-3 משפטים, בעברית, עם גיבור + סביבה + אווירה. לא דומה לנושאים הקודמים."}` }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 1.1, maxOutputTokens: 512 },
    }),
  });
  const data: any = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  const parsed = JSON.parse(text.replace(/^```json\s*/, "").replace(/```$/, "").trim());
  return parsed.brief || "סצנה דרמטית";
}

function slugify(text: string): string {
  const HE_TO_LAT: Record<string, string> = { א:"a",ב:"b",ג:"g",ד:"d",ה:"h",ו:"v",ז:"z",ח:"ch",ט:"t",י:"y",כ:"k",ך:"k",ל:"l",מ:"m",ם:"m",נ:"n",ן:"n",ס:"s",ע:"a",פ:"p",ף:"p",צ:"tz",ץ:"tz",ק:"k",ר:"r",ש:"sh",ת:"t" };
  return text.split("").map((c) => HE_TO_LAT[c] ?? c).join("").toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "daily";
}

export async function GET() {
  if (!API_KEY) return NextResponse.json({ error: "GEMINI_API_KEY missing" }, { status: 500 });
  try {
    const brief = await pickDailyTopic();
    const composed = await composePrompt(brief);
    const source = await prisma.learnSource.create({
      data: {
        type: "upload",
        prompt: composed.prompt,
        title: `🌅 ${brief.slice(0, 100)}`,
        status: "complete",
        addedBy: "daily-generation",
      },
    });
    return NextResponse.json({ ok: true, sourceId: source.id, brief, wordCount: composed.prompt.split(/\s+/).length });
  } catch (e: any) {
    console.error("[daily-generation]", e);
    return NextResponse.json({ error: String(e?.message || e).slice(0, 400) }, { status: 500 });
  }
}
