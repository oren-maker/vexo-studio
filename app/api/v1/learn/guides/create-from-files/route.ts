// Create a Hebrew tutorial-style Guide from uploaded files.
// Files (images, PDFs, Word docs) are sent to Gemini 3 Flash together, in the
// order they were uploaded. Gemini treats them as a sequential tutorial and
// emits a polished multi-stage Hebrew guide as STANDALONE TEXT — no images
// are attached to the guide; the source images live only in the Gemini call.
// All diagrams are reconstructed as ASCII art inside content, all code is
// copied verbatim.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";
import { isValidLang, DEFAULT_LANG } from "@/lib/learn/guide-languages";

export const runtime = "nodejs";
export const maxDuration = 300;

const GEMINI_KEY = process.env.GEMINI_API_KEY?.replace(/\\n$/, "").trim();
const MODEL = "gemini-3-flash-preview";

// English-only slug. Strips Hebrew/Arabic/CJK. If nothing ASCII survives,
// returns "" so the caller can fall back to a timestamp-based slug.
function slugifyEnglish(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

function buildGuidePrompt(fileCount: number, titleHint: string): string {
  return `אתה מקבל ${fileCount} קבצים (תמונות, PDF, Word) המסודרים לפי סדר. הם מייצגים מדריך שלם — שקופיות של פוסט, צילומי מסך של טוטוריאל, או דפי תיעוד.

**⚠️ זה מדריך טקסטואלי עצמאי. המשתמש לא יראה את התמונות המקוריות. כל המידע חייב להיות בתוך ה-content של ה-stages.**

המשימה שלך: להעתיק את כל התוכן מהקבצים למדריך טקסטואלי בעברית — לא לתמצת, לא לנסח מחדש, לא לקצר.

═══════════════════════════════════════════════════════════════════
⛔ חוקים מוחלטים — הפרה שלהם = פלט פסול:
═══════════════════════════════════════════════════════════════════

1. **לפחות stage אחד לכל קובץ** — ${fileCount} קבצים ⇒ לפחות ${fileCount} stages. אל תמזג שקופיות. אל תדלג.

2. **קוד — העתקה מילה-במילה, אות-באות**: כל שורת קוד שמופיעה בתמונה/PDF חייבת להופיע בתוך \`\`\`language
...
\`\`\` בדיוק כמו שהיא — כולל הזחה, רווחים, שורות ריקות, comments (# / //), שמות משתנים, נקודות-פסיק, סוגריים. אם בשקופית יש 40 שורות קוד — ב-content יהיו 40 שורות קוד. **אסור לכתוב "הקוד הבא..." או "דוגמה לקוד:" ולהשמיט אותו. אסור לסכם קוד. אסור להחסיר שורות "לא חשובות".**

3. **טקסט רץ — העתקה מלאה**: כל משפט, כל הערה, כל אזהרה, כל דוגמה שמופיעה בתמונה — מופיעה ב-content. מותר לנסח מחדש בעברית שוטפת **רק אם השמירה על כל הפרטים**. אסור לדלג על משפט בנימוק "מיותר".

4. **דיאגרמות / flowcharts / סכמות ארכיטקטורה**: שחזר כ-ASCII art מלא בתוך \`\`\`
...
\`\`\`. כל node, כל חץ, כל תווית. בנוסף, תאר במילים את הזרימה מתחת.

5. **טבלאות**: שחזר כ-markdown table מלא (\`| col1 | col2 |\`). כל שורה, כל עמודה, ללא חיתוך.

6. **רשימות ממוספרות/נקודות**: שמור את הפורמט והמספור המקוריים.

7. **טקסט שאי-אפשר להעתיק במדויק (למשל הסבר ארוך שנאמר בשקופית)** — תרגם לעברית מלאה ומפורטת. אל תקצר ל-bullet. כתוב פסקה מלאה.

═══════════════════════════════════════════════════════════════════

**סגנון:**
- עברית מקצועית. מונחי מפתח באנגלית נשארים באנגלית.
- **מודגש** למונחים קריטיים. \`inline code\` בבקטיקים. \`\`\`fences\`\`\` לבלוקי קוד.
- כותרות stages תיאוריות.

**מבנה:**
- title: כותרת + משנה (נקודתיים).
- description: 250-500 תווים.
- stage ראשון (type=start): הקדמה לנושא (הכל מהשקופית הראשונה + קונטקסט, 400-1000 מילים).
- stages אמצעיים (type=middle): אחד לכל שקופית. **אין תקרת אורך** — stage יכול להיות 2000+ מילים אם השקופית מכילה קוד ארוך.
- stage אחרון (type=end): סיכום + המלצות.

**פלט — JSON תקין בלבד (responseMimeType=application/json):**
{
  "title": "...",            // עברית
  "slug": "...",             // באנגלית בלבד, 3-6 מילים kebab-case, אסורים תווים לא-ASCII
  "description": "...",
  "category": "...",
  "stages": [
    { "type": "start", "title": "...", "content": "..." },
    { "type": "middle", "title": "...", "content": "..." },
    ...
    { "type": "end", "title": "...", "content": "..." }
  ]
}${titleHint ? `\n\nרמז לכותרת/נושא: "${titleHint}"` : ""}
`;
}

async function extractDocxToText(buf: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const r = await mammoth.extractRawText({ buffer: buf });
  return r.value;
}

type UploadedFile = { name: string; type: "image" | "pdf" | "docx-text"; mimeType: string; base64?: string; text?: string };

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

  // Step 1 — prepare Gemini inline parts. Files never hit Blob — the guide
  // is standalone text, source files are disposable after the Gemini call.
  // Docx → extract text, don't send to Gemini as binary.
  const prepared: UploadedFile[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const buf = Buffer.from(await f.arrayBuffer());
    const name = f.name || `file-${i}`;
    const mime = f.type || "";
    try {
      if (mime.startsWith("image/") || /\.(jpg|jpeg|png|webp|gif|heic)$/i.test(name)) {
        prepared.push({ name, type: "image", mimeType: mime || "image/jpeg", base64: buf.toString("base64") });
      } else if (mime === "application/pdf" || /\.pdf$/i.test(name)) {
        prepared.push({ name, type: "pdf", mimeType: "application/pdf", base64: buf.toString("base64") });
      } else if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || /\.docx$/i.test(name)) {
        const text = await extractDocxToText(buf);
        prepared.push({ name, type: "docx-text", mimeType: "text/plain", text });
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
  parts.push({ text: buildGuidePrompt(prepared.length, titleHint) });

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 48000, responseMimeType: "application/json" },
      }),
      signal: AbortSignal.timeout(260_000),
    },
  );
  if (!geminiRes.ok) {
    const err = await geminiRes.text();
    return NextResponse.json({ error: `gemini ${geminiRes.status}: ${err.slice(0, 300)}` }, { status: 502 });
  }
  const gj: any = await geminiRes.json();
  const cand = gj.candidates?.[0];
  const raw = cand?.content?.parts?.[0]?.text?.trim();
  const finishReason = cand?.finishReason;
  if (!raw) return NextResponse.json({ error: "gemini returned empty response", finishReason, gj }, { status: 502 });
  const truncated = finishReason === "MAX_TOKENS" || finishReason === "LENGTH";

  let parsed: { title?: string; slug?: string; description?: string; category?: string; stages?: { type?: string; title: string; content: string }[] };
  try { parsed = JSON.parse(raw); }
  catch {
    return NextResponse.json({
      error: truncated ? "gemini hit MAX_TOKENS — output was truncated mid-JSON" : "gemini returned non-JSON",
      finishReason,
      preview: raw.slice(0, 400),
    }, { status: 502 });
  }

  const finalTitle = (parsed.title ?? titleHint ?? "מדריך חדש").slice(0, 200);
  const finalDesc = parsed.description?.slice(0, 2000) ?? null;
  const finalCategory = parsed.category?.slice(0, 80) ?? null;
  const stageList = (parsed.stages ?? []).filter((s) => s?.title && s?.content);
  if (stageList.length === 0) return NextResponse.json({ error: "gemini returned no stages", preview: raw.slice(0, 400) }, { status: 502 });

  // Prefer Gemini's explicit slug field, fall back to extracting ASCII tokens
  // from title, and finally "guide" if the title is fully non-Latin.
  const candidateSlug = slugifyEnglish(parsed.slug ?? "") || slugifyEnglish(finalTitle) || "guide";
  const slug = `${candidateSlug}-${Date.now().toString(36).slice(-4)}`;

  type StagePlan = { type: "start" | "middle" | "end"; title: string; content: string };
  const stagePlans: StagePlan[] = stageList.map((s, i) => ({
    type: (s.type === "start" ? "start" : s.type === "end" ? "end" : i === 0 ? "start" : i === stageList.length - 1 ? "end" : "middle"),
    title: String(s.title).slice(0, 120),
    content: String(s.content),
  }));

  const guide = await prisma.guide.create({
    data: {
      slug, defaultLang: lang, status: "draft", isPublic: true, source: "files-upload",
      category: finalCategory,
      translations: { create: { lang, title: finalTitle, description: finalDesc, isAuto: true } },
      stages: {
        create: stagePlans.map((s, i) => ({
          order: i,
          type: s.type,
          transitionToNext: "fade",
          translations: { create: { lang, title: s.title, content: s.content, isAuto: true } },
        })),
      },
    },
  });

  return NextResponse.json({
    ok: true,
    guide: { id: guide.id, slug: guide.slug, title: finalTitle },
    stages: stagePlans.length,
    filesProcessed: prepared.length,
    warning: truncated
      ? "gemini output was truncated (MAX_TOKENS) — last stage may be incomplete"
      : stagePlans.length < prepared.length
      ? `gemini returned ${stagePlans.length} stages but ${prepared.length} files were uploaded — some slides may be merged`
      : undefined,
    editUrl: `/learn/guides/${guide.slug}/edit`,
    viewUrl: `/learn/guides/${guide.slug}?lang=${lang}`,
  });
}
