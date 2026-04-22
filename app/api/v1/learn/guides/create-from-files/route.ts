// Create a Hebrew tutorial-style Guide from uploaded files.
// Files (images, PDFs, Word docs) are sent to Gemini 3 Flash together, in the
// order they were uploaded. Gemini treats them as a sequential tutorial and
// emits a polished multi-stage Hebrew guide in the reference style
// (see /learn/guides/claude-instagram-audit). One Gemini call, one cohesive
// guide — not a slide-by-slide transcription.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";
import { put } from "@vercel/blob";
import { isValidLang, DEFAULT_LANG } from "@/lib/learn/guide-languages";

export const runtime = "nodejs";
export const maxDuration = 300;

const GEMINI_KEY = process.env.GEMINI_API_KEY?.replace(/\\n$/, "").trim();
const MODEL = "gemini-3-flash-preview";

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^\w֐-׿؀-ۿ\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 80);
}

const GUIDE_PROMPT = `אתה מקבל קבוצת קבצים (תמונות, PDF, Word) המסודרים לפי סדר. הם מייצגים מדריך אחד שלם — שקופיות של פוסט, צילומי מסך של טוטוריאל, או דפי תיעוד.

המשימה שלך: לבנות מדריך איכותי בעברית, עם המבנה והסגנון הבאים. שמור על כל המידע שמופיע בקבצים — אל תסכם או תקצר.

**סגנון כתיבה:**
- עברית מקצועית ונגישה. מונחי מפתח באנגלית נשארים באנגלית (עם תרגום בסוגריים כשצריך).
- פסקאות מלאות ולא רשימות יבשות. רק כשיש רשימת צעדים או הוראות מפורשות — השתמש ב-1. 2. 3. או bullets.
- דגש חזותי: **מודגש** למונחים קריטיים, \`code\` ב-backticks, בלוקי קוד ב-\`\`\`code fences\`\`\`.
- כותרות שלבים כמו "שלב 1: ..." או "שיטה א': ...".

**מבנה המדריך:**
- כותרת ראשית + כותרת משנה (מופרדים בנקודתיים) — תיאורית, מדויקת ומושכת.
- description — פסקה אחת או שתיים (250-500 תווים) שמתארת מה יילמד ובשביל מי.
- stage ראשון (type=start): "מדוע X חשוב" או "איך זה עובד" — מוטיבציה + קונטקסט. 300-600 מילים.
- stages אמצעיים (type=middle): שלב אחד לכל רעיון/פעולה עיקרי. 200-500 מילים לכל שלב. כולל code blocks / רשימות / דוגמאות אם היו במקור.
- stage סיום (type=end): סיכום + המלצות יישום + pitfalls להיזהר מהם.
- סה"כ 5-10 stages (תלוי במידע).

**פלט — JSON בלבד, ללא markdown fence מסביב:**
{
  "title": "...",
  "description": "...",
  "category": "...",  // אופציונלי: AI / ML / שיווק / עיצוב / וכו'
  "stages": [
    { "type": "start", "title": "...", "content": "..." },
    { "type": "middle", "title": "שלב 1: ...", "content": "..." },
    ...
    { "type": "end", "title": "...", "content": "..." }
  ]
}
`;

async function extractDocxToText(buf: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const r = await mammoth.extractRawText({ buffer: buf });
  return r.value;
}

type UploadedFile = { blobUrl: string | null; name: string; type: "image" | "pdf" | "docx-text"; mimeType: string; base64?: string; text?: string };

export async function POST(req: NextRequest) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;

  let formData: FormData;
  try { formData = await req.formData(); }
  catch { return NextResponse.json({ error: "multipart/form-data required" }, { status: 400 }); }

  const rawLang = formData.get("lang");
  const lang = typeof rawLang === "string" && isValidLang(rawLang) ? rawLang : DEFAULT_LANG;
  const titleHint = String(formData.get("title") ?? "").trim();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);

  if (files.length === 0) return NextResponse.json({ error: "at least one file required" }, { status: 400 });
  if (!GEMINI_KEY) return NextResponse.json({ error: "GEMINI_API_KEY missing" }, { status: 500 });

  // Step 1 — upload each file to Blob (for images, used as stage cover) and
  // prepare Gemini inline parts. Docx → extract text, don't send to Gemini as binary.
  const tmpSlug = `pending-${Date.now().toString(36)}`;
  const prepared: UploadedFile[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const buf = Buffer.from(await f.arrayBuffer());
    const name = f.name || `file-${i}`;
    const mime = f.type || "";
    try {
      if (mime.startsWith("image/") || /\.(jpg|jpeg|png|webp|gif|heic)$/i.test(name)) {
        const blob = await put(`guides/${tmpSlug}/${Date.now()}-${i}-${name.replace(/[^a-z0-9.]/gi, "_").slice(0, 40)}`, buf, { access: "public", contentType: mime || "image/jpeg" });
        prepared.push({ blobUrl: blob.url, name, type: "image", mimeType: mime || "image/jpeg", base64: buf.toString("base64") });
      } else if (mime === "application/pdf" || /\.pdf$/i.test(name)) {
        prepared.push({ blobUrl: null, name, type: "pdf", mimeType: "application/pdf", base64: buf.toString("base64") });
      } else if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || /\.docx$/i.test(name)) {
        const text = await extractDocxToText(buf);
        prepared.push({ blobUrl: null, name, type: "docx-text", mimeType: "text/plain", text });
      }
    } catch (e: any) {
      console.warn(`[create-from-files] skip ${name}: ${e?.message ?? e}`);
    }
  }

  if (prepared.length === 0) {
    return NextResponse.json({ error: "no supported files (images/PDF/Word only)" }, { status: 400 });
  }

  // Step 2 — build a single Gemini request that sees every file in order.
  const parts: unknown[] = [];
  prepared.forEach((p, i) => {
    parts.push({ text: `קובץ ${i + 1}: ${p.name}` });
    if (p.type === "image" || p.type === "pdf") {
      parts.push({ inlineData: { mimeType: p.mimeType, data: p.base64 } });
    } else if (p.type === "docx-text") {
      parts.push({ text: p.text ?? "" });
    }
  });
  parts.push({
    text: titleHint
      ? `${GUIDE_PROMPT}\n\nרמז לכותרת/נושא: "${titleHint}"`
      : GUIDE_PROMPT,
  });

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 20000, responseMimeType: "application/json" },
      }),
      signal: AbortSignal.timeout(240_000),
    },
  );
  if (!geminiRes.ok) {
    const err = await geminiRes.text();
    return NextResponse.json({ error: `gemini ${geminiRes.status}: ${err.slice(0, 300)}` }, { status: 502 });
  }
  const gj: any = await geminiRes.json();
  const raw = gj.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!raw) return NextResponse.json({ error: "gemini returned empty response" }, { status: 502 });

  let parsed: { title?: string; description?: string; category?: string; stages?: { type?: string; title: string; content: string }[] };
  try { parsed = JSON.parse(raw); }
  catch { return NextResponse.json({ error: "gemini returned non-JSON", preview: raw.slice(0, 400) }, { status: 502 }); }

  const finalTitle = (parsed.title ?? titleHint ?? "מדריך חדש").slice(0, 200);
  const finalDesc = parsed.description?.slice(0, 2000) ?? null;
  const finalCategory = parsed.category?.slice(0, 80) ?? null;
  const stageList = (parsed.stages ?? []).filter((s) => s?.title && s?.content);
  if (stageList.length === 0) return NextResponse.json({ error: "gemini returned no stages", preview: raw.slice(0, 400) }, { status: 502 });

  const slug = `${slugify(finalTitle) || "guide"}-${Date.now().toString(36).slice(-4)}`;

  // Map images to stages in order so the guide has visual anchors per slide.
  // If Gemini produced more stages than images, extra stages render without images.
  // If Gemini produced fewer stages than images, extra images are listed on the
  // last stage.
  const imageSpecs = prepared.filter((p) => p.type === "image" && p.blobUrl);
  type StagePlan = { type: "start" | "middle" | "end"; title: string; content: string; images: string[] };
  const stagePlans: StagePlan[] = stageList.map((s, i) => ({
    type: (s.type === "start" ? "start" : s.type === "end" ? "end" : i === 0 ? "start" : i === stageList.length - 1 ? "end" : "middle"),
    title: String(s.title).slice(0, 120),
    content: String(s.content),
    images: [],
  }));
  imageSpecs.forEach((img, i) => {
    const target = stagePlans[Math.min(i, stagePlans.length - 1)];
    target.images.push(img.blobUrl!);
  });

  const guide = await prisma.guide.create({
    data: {
      slug, defaultLang: lang, status: "draft", isPublic: true, source: "files-upload",
      category: finalCategory,
      coverImageUrl: imageSpecs[0]?.blobUrl ?? null,
      translations: { create: { lang, title: finalTitle, description: finalDesc, isAuto: true } },
      stages: {
        create: stagePlans.map((s, i) => ({
          order: i,
          type: s.type,
          transitionToNext: "fade",
          translations: { create: { lang, title: s.title, content: s.content, isAuto: true } },
          images: s.images.length > 0 ? { create: s.images.map((u, j) => ({ blobUrl: u, source: "file-upload", order: j })) } : undefined,
        })),
      },
    },
  });

  return NextResponse.json({
    ok: true,
    guide: { id: guide.id, slug: guide.slug, title: finalTitle },
    stages: stagePlans.length,
    filesProcessed: prepared.length,
    editUrl: `/learn/guides/${guide.slug}/edit`,
    viewUrl: `/guides/${guide.slug}?lang=${lang}`,
  });
}
