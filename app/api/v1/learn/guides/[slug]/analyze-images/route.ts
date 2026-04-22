// Manual image upload → Gemini vision → auto-create stages.
// Use when Instagram embed exposes only the first 3 carousel slides
// (which is always): user downloads or screenshots the remaining slides
// and uploads them here. Each image becomes a new stage appended to
// the guide.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";
import { put } from "@vercel/blob";

export const runtime = "nodejs";
export const maxDuration = 300;

const GEMINI_KEY = process.env.GEMINI_API_KEY?.replace(/\\n$/, "").trim();
const VISION_MODEL = "gemini-3-flash-preview";

async function analyzeImage(base64: string, mimeType: string): Promise<string> {
  if (!GEMINI_KEY) throw new Error("GEMINI_API_KEY missing");
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${VISION_MODEL}:generateContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inlineData: { mimeType, data: base64 } },
            { text: `חלץ את כל הטקסט והמידע שמופיע בתמונה. זהו שלב בתוך מדריך — הוצא ממנו:
1. כותרת (שורה ראשונה קצרה).
2. תוכן מלא: כל טקסט, הסברים, קוד, רשימות, דוגמאות, צעדים.
3. אם יש בלוקי קוד — השאר אותם בדיוק כמו שהם, בתוך \`\`\`code\`\`\` fence.
4. אם יש רשימה ממוספרת או נקודות — שמור את הפורמט.
ענה בעברית (שמור קוד באנגלית). היה יסודי — אל תחסר שום פרט.` },
          ],
        }],
        generationConfig: { temperature: 0.15, maxOutputTokens: 6000 },
      }),
      signal: AbortSignal.timeout(60_000),
    },
  );
  if (!r.ok) throw new Error(`gemini ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j: any = await r.json();
  return j.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "(אין ניתוח)";
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;
  const { slug } = await params;

  const guide = await prisma.guide.findUnique({ where: { slug }, include: { stages: { orderBy: { order: "desc" }, take: 1 } } });
  if (!guide) return NextResponse.json({ error: "guide not found" }, { status: 404 });

  let formData: FormData;
  try { formData = await req.formData(); }
  catch { return NextResponse.json({ error: "multipart/form-data required" }, { status: 400 }); }

  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  const replaceAll = formData.get("replace") === "true";
  if (files.length === 0) return NextResponse.json({ error: "no files uploaded (field name: files[])" }, { status: 400 });

  if (replaceAll) {
    await prisma.guideStage.deleteMany({ where: { guideId: guide.id } });
  }
  const lang = guide.defaultLang || "he";
  const startOrder = replaceAll ? 0 : (guide.stages[0]?.order ?? -1) + 1;

  const results: { index: number; ok: boolean; stageId?: string; error?: string; title?: string; blobUrl?: string }[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      const buf = Buffer.from(await file.arrayBuffer());
      if (buf.length === 0) throw new Error("empty file");
      const mime = file.type && file.type.startsWith("image/") ? file.type : "image/jpeg";
      const base64 = buf.toString("base64");

      // Upload original to Blob so guide can display it
      const blobKey = `guides/${slug}/uploads/${Date.now()}-${i}-${file.name.replace(/[^a-z0-9.]/gi, "_").slice(0, 40)}`;
      const uploaded = await put(blobKey, buf, { access: "public", contentType: mime });

      const text = await analyzeImage(base64, mime);
      const firstLine = text.split("\n")[0]?.trim() ?? "";
      const cleanFirst = firstLine.replace(/^(#+\s*|\*+\s*|כותרת:?\s*)/i, "").replace(/\*/g, "").trim();
      const title = cleanFirst && cleanFirst.length <= 100 ? cleanFirst : `שקופית ${startOrder + i + 1}`;
      const body = cleanFirst.length <= 100
        ? text.split("\n").slice(1).join("\n").replace(/^\s*\n/, "").trim()
        : text;

      const stage = await prisma.guideStage.create({
        data: {
          guideId: guide.id,
          order: startOrder + i,
          type: "middle",
          transitionToNext: "fade",
          translations: { create: { lang, title, content: body || text, isAuto: true } },
          images: { create: [{ blobUrl: uploaded.url, source: "manual-vision-upload", order: 0 }] },
        },
      });
      results.push({ index: i, ok: true, stageId: stage.id, title, blobUrl: uploaded.url });
    } catch (e: any) {
      results.push({ index: i, ok: false, error: String(e?.message || e).slice(0, 200) });
    }
  }

  // Fix status markers: first stage = start, last = end
  const allStages = await prisma.guideStage.findMany({ where: { guideId: guide.id }, orderBy: { order: "asc" } });
  if (allStages.length > 0) {
    await prisma.guideStage.update({ where: { id: allStages[0].id }, data: { type: "start" } });
    if (allStages.length > 1) {
      await prisma.guideStage.update({ where: { id: allStages[allStages.length - 1].id }, data: { type: "end" } });
    }
  }

  return NextResponse.json({
    ok: true,
    uploaded: files.length,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
    editUrl: `/learn/guides/${slug}/edit`,
    viewUrl: `/guides/${slug}`,
  });
}
