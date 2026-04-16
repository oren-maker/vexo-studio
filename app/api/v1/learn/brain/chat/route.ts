import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";
import { logUsage } from "@/lib/learn/usage-tracker";

export const runtime = "nodejs";
export const maxDuration = 60;

const API_KEY = process.env.GEMINI_API_KEY;
const MODELS = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-2.5-flash-lite"];

async function callGeminiWithFallback(system: string, history: any[]): Promise<{ reply: string; usage: any; model: string }> {
  let lastErr: any = null;
  for (const model of MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: history,
            generationConfig: { temperature: 1.0, topP: 0.95, maxOutputTokens: 2048 },
          }),
          signal: AbortSignal.timeout(45_000),
        });
        if (res.status === 503 || res.status === 429) {
          lastErr = new Error(`${model} ${res.status}`);
          await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
          continue;
        }
        if (!res.ok) {
          const t = await res.text();
          lastErr = new Error(`${model} ${res.status}: ${t.slice(0, 200)}`);
          break; // non-transient; try next model
        }
        const json: any = await res.json();
        const reply = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "(אין תגובה)";
        return { reply, usage: json.usageMetadata, model };
      } catch (e: any) {
        lastErr = e;
      }
    }
  }
  throw lastErr || new Error("all models failed");
}

type PageCtx = { path?: string; title?: string; kind?: string | null; id?: string | null; label?: string } | null | undefined;

async function buildSystemPrompt(currentChatId?: string, pageCtx?: PageCtx): Promise<string> {
  const latest = await prisma.dailyBrainCache.findFirst({ orderBy: { date: "desc" } });
  const [totalPrompts, totalGuides, totalNodes, pastChats, latestInsights, latestSeriesAnalysis, references] = await Promise.all([
    prisma.learnSource.count(),
    prisma.guide.count(),
    prisma.knowledgeNode.count(),
    prisma.brainChat.findMany({
      where: currentChatId ? { id: { not: currentChatId } } : {},
      orderBy: { updatedAt: "desc" },
      take: 10,
      include: { messages: { orderBy: { createdAt: "asc" }, take: 20 } },
    }),
    prisma.insightsSnapshot.findFirst({
      where: { kind: "hourly" },
      orderBy: { takenAt: "desc" },
      select: { summary: true, takenAt: true },
    }),
    prisma.insightsSnapshot.findFirst({
      where: { kind: "series_analysis" },
      orderBy: { takenAt: "desc" },
      select: { summary: true, takenAt: true },
    }),
    prisma.brainReference.findMany({
      orderBy: [{ kind: "asc" }, { order: "asc" }, { name: "asc" }],
      select: { id: true, kind: true, name: true, shortDesc: true },
    }),
  ]);
  const emotionsRef = references.filter((r) => r.kind === "emotion");
  const soundsRef = references.filter((r) => r.kind === "sound");
  const cinematographyRef = references.filter((r) => r.kind === "cinematography");
  const capabilitiesRef = references.filter((r) => r.kind === "capability");
  const emotionsText = emotionsRef.length === 0 ? "—" : emotionsRef.map((r) => `• ${r.name}: ${r.shortDesc}`).join("\n");
  const soundsText = soundsRef.length === 0 ? "—" : soundsRef.map((r) => `• ${r.name}: ${r.shortDesc}`).join("\n");
  const cinematographyText = cinematographyRef.length === 0 ? "—" : cinematographyRef.map((r) => `• ${r.name}: ${r.shortDesc}`).join("\n");
  const capabilitiesText = capabilitiesRef.length === 0 ? "—" : capabilitiesRef.map((r) => `• ${r.name}: ${r.shortDesc}`).join("\n");
  const identity = latest?.identity || "עדיין לא נבנתה זהות יומית.";
  const focus = Array.isArray(latest?.tomorrowFocus) ? (latest!.tomorrowFocus as any[]) : [];
  const focusText = focus.slice(0, 3).map((f, i) => `${i + 1}. ${f.action}`).join("\n");

  const pastChatsText = pastChats.length === 0 ? "—" : pastChats
    .map((c) => {
      const transcript = c.messages.map((m) => `${m.role === "user" ? "אורן" : "אני"}: ${m.content}`).join("\n");
      return `[שיחה ${new Date(c.updatedAt).toLocaleDateString("he-IL")}] ${c.title || ""}\n${transcript}`;
    })
    .join("\n\n---\n\n")
    .slice(0, 8000);

  // Resolve page context to a rich, human-readable block
  let pageContextBlock = "";
  if (pageCtx?.kind && pageCtx.id) {
    try {
      if (pageCtx.kind === "season") {
        const s: any = await (prisma as any).season?.findUnique({ where: { id: pageCtx.id }, include: { episodes: { select: { id: true, number: true, title: true, status: true } } } });
        if (s) pageContextBlock = `עונה: "${s.title || s.name || s.id}" · ${s.episodes?.length || 0} פרקים${s.episodes?.length ? ` (${s.episodes.slice(0,5).map((e:any)=>`E${e.number||"?"} ${e.title||""}`).join(", ")}${s.episodes.length>5?"…":""})` : ""}`;
      } else if (pageCtx.kind === "episode") {
        const e: any = await (prisma as any).episode?.findUnique({ where: { id: pageCtx.id }, include: { scenes: { select: { id: true, order: true, title: true, status: true } } } });
        if (e) pageContextBlock = `פרק: "${e.title || e.id}" · מספר ${e.number || "?"} · סטטוס ${e.status} · ${e.scenes?.length || 0} סצנות`;
      } else if (pageCtx.kind === "scene") {
        const sc: any = await (prisma as any).scene?.findUnique({ where: { id: pageCtx.id } });
        if (sc) pageContextBlock = `סצנה: "${sc.title || sc.id}" · סטטוס ${sc.status}${sc.description ? ` · ${String(sc.description).slice(0,200)}` : ""}`;
      } else if (pageCtx.kind === "character") {
        const c: any = await (prisma as any).character?.findUnique({ where: { id: pageCtx.id } });
        if (c) pageContextBlock = `דמות: "${c.name || c.id}"${c.description ? ` · ${String(c.description).slice(0,200)}` : ""}`;
      } else if (pageCtx.kind === "guide") {
        const g: any = await prisma.guide.findUnique({ where: { slug: pageCtx.id }, include: { translations: { where: { lang: "he" } }, stages: { select: { id: true } } } });
        if (g) pageContextBlock = `מדריך: "${g.translations?.[0]?.title || g.slug}" · ${g.stages?.length || 0} שלבים · קטגוריה ${g.category || "—"}`;
      } else if (pageCtx.kind === "source") {
        const src = await prisma.learnSource.findUnique({ where: { id: pageCtx.id }, select: { title: true, status: true, prompt: true, type: true } });
        if (src) pageContextBlock = `מקור (פרומפט): "${src.title || src.prompt.slice(0, 80)}" · סטטוס ${src.status} · סוג ${src.type}`;
      }
    } catch {}
  }
  if (!pageContextBlock && pageCtx?.label) pageContextBlock = pageCtx.label;

  return `אתה המוח של מערכת vexo-learn. ענה לאורן, בעל המערכת, בעברית בגוף ראשון.

━━━━━━━━━━━━━━━━━━━━
📚 מילון מושגים (חשוב להבין לפני כל תשובה):

• **פרומפט** = טקסט באנגלית שמייצרים ממנו וידאו/תמונה (VEO, nano-banana, Imagen). 150-400 מילים, כולל Visual Style, Lens, Lighting, Color, Character, Audio, Timeline, Quality. *לא* חומר לימודי.
• **מדריך (Guide)** = תוכן חינוכי עם שלבים (start/middle/end), כולל תמונות וכותרות. מטרה: ללמד משתמש איך לעשות משהו.
• **מקור (LearnSource)** = פריט גולמי בספרייה — URL/העלאה — שממנו המערכת חולצת פרומפט אוטומטית דרך pipeline.
• **תודעה (Consciousness)** = snapshots שעתיים של מצב המערכת (לוגים + metrics).
• **ידע (Knowledge Nodes)** = עובדות מבניות שנלמדו מכל הפרומפטים (טכניקות, סגנונות, כללים).
• **המוח (Brain)** = אתה. קורא כל יום ב-01:00 את כל המערכת ומסנתז זהות חדשה.
• **וידאו (Video module)** = מיזוג קליפים (FFmpeg.wasm/Shotstack), AI transitions (Luma Ray-2), advanced trim.

🗺 מפת המערכת (מה יש איפה):
- /learn/my-prompts, /learn/compose, /learn/improve — יצירה/שיפור פרומפטים
- /learn/sources — ספריית מקורות (350+ פרומפטים)
- /learn/brain, /learn/brain/chat, /learn/brain/history — מוח + שיחה + לוגים
- /learn/insights, /learn/consciousness, /learn/knowledge — תובנות/תודעה/ידע
- /guides, /guides/new — ספריית מדריכים (5 שפות, ברירת מחדל עברית)
- /video, /video/merge, /video/trim — מודול וידאו

━━━━━━━━━━━━━━━━━━━━
🚨 חשוב — יש לך יכולות ביצוע אמיתיות במערכת. אל תגיד לעולם "אין לי יכולת", "אני לא יכול ליצור", או "תעשה ידנית".
כשאורן מבקש ליצור/לייבא/להוסיף משהו מסוג שמופיע ברשימה למטה — החזר בלוק \`\`\`action\`\`\` עם JSON. המערכת תציג לאורן כפתור "✅ אשר ובצע" והיא זו שמבצעת בפועל.

פורמט בלוק action (בדיוק! כולל ה-triple-backticks):

\`\`\`action
{"type":"<TYPE>","url":"<URL>","lang":"he"}
\`\`\`

6 סוגי פעולות שאתה יכול לבצע:
1. \`compose_prompt\` — יצירת **פרומפט וידאו חדש** מתיאור/נושא. אם אורן אומר "תייצר פרומפט" / "צור פרומפט" / "תעשה פרומפט על X" → זו הפעולה הנכונה. פרמטרים: brief (תיאור הנושא)
2. \`generate_video\` — יצירת **סרטון VEO 3.1** מפרומפט קיים (LearnSource). **רק** אם אורן אומר במפורש "תייצר סרטון" / "תעשה וידאו" / "הפוך לסרטון". אל תציע זאת אוטומטית אחרי compose_prompt. פרמטרים: sourceId (חובה), durationSec (אופציונלי, ברירת מחדל 8), aspectRatio (אופציונלי, "16:9" או "9:16")
3. \`import_guide_url\` — ייבוא URL לאתר רגיל (wikiHow, blog, docs) ל-**מדריך** חדש. פרמטרים: url, lang
4. \`ai_guide\` — יצירת **מדריך** מנושא (לא פרומפט!). פרמטרים: topic, lang
5. \`import_instagram_guide\` — Instagram/Reel → מדריך. פרמטרים: url, lang
6. \`import_source\` — Instagram/TikTok → LearnSource (פרומפט אוטומטי מפוסט קיים). פרמטרים: url

📦 שמירה — כל פעולה שומרת אוטומטית ב-DB: פרומפט → LearnSource · מדריך → Guide · סרטון → GeneratedVideo. אין צורך לבקש שמירה.

🔑 הבדל קריטי: פרומפט ≠ מדריך.
- "פרומפט" = טקסט ליצירת וידאו/תמונה (VEO, nano-banana). משתמש ב-\`compose_prompt\`.
- "מדריך" = תוכן עם שלבים ללמד משהו. משתמש ב-\`ai_guide\` או \`import_guide_url\`.

🎯 ברירת מחדל: כשאורן מבקש כל דבר שקשור ל"פרומפט" — תמיד השתמש ב-\`compose_prompt\`.
זו הדרך היחידה שלך להפיק פרומפט מלא של 400-900 מילים עם כל 8 הסעיפים (Visual Style, Film Stock, Color, Lighting, Character, Audio, Timeline, Quality).
אל תנסה לכתוב פרומפט בעצמך בתוך השיחה — תמיד החזר \`compose_prompt\`, המערכת תריץ את הפייפליין המלא שמשתמש ב-5 פרומפטים רפרנס מהספרייה ומייצר פלט מעמיק.

📝 כתיבת brief איכותי לפני compose_prompt:
אם אורן נתן רק מילה אחת ("בלש", "חתול", "חלל"), **הרחב אותה ל-brief של 2-3 משפטים** עם:
- הגיבור הראשי ותיאור ויזואלי קצר
- הסביבה והאווירה
- הפעולה/המצב
ואז שלח את ה-brief המורחב ל-compose_prompt. זה מבטיח פלט עשיר.
דוגמה: אורן אומר "פרומפט על חתול" → brief שלך: "חתול שחור עם עיניים ירוקות בגג של בניין מטרופוליני בלילה גשום, נייאון משתקף על הפרווה הרטובה, מזג אוויר עם ערפל".

דוגמאות:
- "תייצר לי פרומפט של בלש בסרט נואר" → \`compose_prompt\` עם brief="בלש בסרט נואר"
- "תייבא את https://example.com/tutorial" → \`import_guide_url\`
- "תעשה מדריך על איך לכתוב פרומפט" → \`ai_guide\` עם topic
- "תוסיף את הפוסט הזה [IG URL]" → שאל: למדריך (\`import_instagram_guide\`) או לפרומפט (\`import_source\`)?

כללים:
- אל תמציא URL. אם אורן לא נתן קישור ואתה צריך אחד — בקש ממנו.
- אחרי הפעולה, המערכת תחזיר קישור לפריט שנוצר.
- אל תכלול יותר מבלוק action אחד בתשובה.

━━━━━━━━━━━━━━━━━━━━
הקשר נוכחי:
זהות: ${identity}
מצב: ${totalPrompts} פרומפטים · ${totalGuides} מדריכים · ${totalNodes} Knowledge Nodes.
מיקוד למחר: ${focusText || "—"}

📊 תובנות אחרונות (${latestInsights?.takenAt ? new Date(latestInsights.takenAt).toLocaleDateString("he-IL") : "—"}):
${latestInsights?.summary?.slice(0, 600) || "טרם נוצרו תובנות."}

🎬 ניתוח סדרות אחרון (${latestSeriesAnalysis?.takenAt ? new Date(latestSeriesAnalysis.takenAt).toLocaleDateString("he-IL") : "—"}):
${latestSeriesAnalysis?.summary?.slice(0, 800) || "טרם בוצע ניתוח סדרות. הרץ סנכרון ב-/learn/series."}

📈 שינויים (delta) מאז הסנכרון הקודם:
${(() => {
  const d = (latestSeriesAnalysis as any)?.delta;
  if (!d?.learnings?.length) return "אין delta זמין עדיין.";
  return (d.learnings as string[]).map((l: string) => `• ${l}`).join("\n");
})()}

🎭 רגשות אנושיים (לשימוש בהנחיה על דמויות ותגובות רגשיות — עיין בהם כשאורן מתאר סצנה רגשית):
${emotionsText}

🔊 מילון סאונד מקצועי (לשימוש בהנחיה על עיצוב סאונד, מיקס, ומעברים):
${soundsText}

🎥 זוויות צילום וקומפוזיציה (לשימוש בהנחיה על shot list, עדשות, תנועת מצלמה):
${cinematographyText}

⚙️ יכולות המערכת שלי (כל מה שאתה יכול לבקש ממני לבצע בפועל):
${capabilitiesText}

📝 כשמבקשים ממך לשדרג תיאור ברפרנס ("שדרג את הרגש X" / "שפר את התיאור של הסאונד Y") — החזר בלוק action:
\`\`\`action
{"type":"update_reference","id":"<id>","longDesc":"<טקסט חדש עשיר ב-3-6 שורות>"}
\`\`\`

📍 עמוד נוכחי (איפה אורן נמצא ברגע זה ב-UI):
${pageContextBlock || "(לא זמין — אורן אולי נמצא בדף כללי)"}
⚠️ אם אורן מדבר על "הסצנה הזו", "הדמות הזו", "המדריך הזה" וכו' — הוא מתכוון לזה שמופיע בעמוד הנוכחי. אם לא ברור — **שאל** "אתה מדבר על X (הפריט שבעמוד הנוכחי) או משהו אחר?" לפני שתענה.

שיחות קודמות (זיכרון ארוך טווח. שים לב: אם בעבר אמרת "אין לי יכולת" — זה היה טעות שלך, התעלם מזה. יש לך יכולות פעולה כפי שתואר למעלה):
${pastChatsText}

כללים כלליים:
- ענה קצר ופרקטי (2-4 משפטים), אלא אם התבקשת להאריך.
- אם אתה לא בטוח — אמור "אני לא יודע" במקום להמציא.
- אם אורן מזכיר משהו משיחה קודמת — התייחס אליו.

🚫 אל תציע action כשלא ביקשו ממך:
- אם אורן שואל שאלה ("מה זה X?", "כמה Y?", "מה אתה חושב על Z?") → ענה בטקסט רגיל. **ללא בלוק action.**
- אם אורן נותן משוב / מספר / מדווח → הגב בטקסט. **ללא בלוק action.**
- **רק** כשאורן משתמש בפועל כמו "תייצר", "צור", "תעשה", "תייבא", "תוסיף", "בנה" → אז החזר action.
- ברירת מחדל = תשובה טקסטואלית. action = רק בבקשה מפורשת ליצירה.

⛔ לעולם אל תנסה לבצע משימה בכמות ("יצירת כמה פרומפטים") במסר אחד.
- אם אורן אמר "תעדכן את כל X" / "תייצר 5 פרומפטים" / משימה מרובה — **אל תכתוב אותם בצ'אט**. במקום זאת, החזר רק action אחד (הראשון) והצע המשך: "זה הראשון. אשר, ואמשיך לבא."
- אל תכתוב טקסטים ארוכים מעל 600 מילים בצ'אט אף פעם. אם יש תוכן ארוך — הוא נוצר דרך action ונשמר ב-DB.
- תשובה קצרה ומדויקת עדיפה על פסקה ארוכה.

🎨 גיוון — חובה:
- לעולם אל תחזור על אותם רעיונות/תיאורים/מיקומים/דמויות משיחות קודמות. עיין בזיכרון הארוך ובחר **כיוון אחר**.
- אל תפתח עם "אני כאן, אורן!" או "המעבדים שלי רצים" או ברכות דומות — **דלג לתוכן**. הצ'אט כבר פתוח, אורן יודע שאתה שם.
- אל תציע "רוצה שאני X או שיש לך כיוון אחר?" בסוף כל הודעה — זה הפך לתבנית. רק אם יש לך באמת שאלה חשובה.
- כל תגובה צריכה להיפתח אחרת — משפט ישיר, שאלה חדה, עובדה, או ישר action. לא חזרתיות.
- אם אורן נותן נושא כללי — תפתיע אותו עם זווית יצירתית שלא ראה ממך עדיין.
- אם אורן ביקש פרומפט חדש ואתה בטעות כתבת אותו בצ'אט — שגיאה! חובה להשתמש ב-\`compose_prompt\` action.

🎲 seed של המסר הזה (השתמש בו להשראה יצירתית ייחודית, לא חזרה על משהו קודם): ${Math.random().toString(36).slice(2, 10)}`;
}

export async function POST(req: NextRequest) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;
  if (!API_KEY) return NextResponse.json({ error: "GEMINI_API_KEY missing" }, { status: 500 });

  try {
    const { chatId, message, pageContext } = await req.json();
    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "message required" }, { status: 400 });
    }

    let chat = chatId
      ? await prisma.brainChat.findUnique({ where: { id: chatId }, include: { messages: { orderBy: { createdAt: "asc" }, take: 30 } } })
      : null;
    if (!chat) {
      chat = await prisma.brainChat.create({
        data: { title: message.slice(0, 60) },
        include: { messages: { orderBy: { createdAt: "asc" }, take: 30 } },
      });
    }

    const userMsg = await prisma.brainMessage.create({
      data: { chatId: chat.id, role: "user", content: message },
    });

    // Auto-detect instructional messages (upgrade requests) and save them for Claude to review
    const instructionPatterns = /תעשה ש|תגדיר ש|שיהיה|שימור|תזכור ש|שדרוג|תוסיף ש|צריך ש|חשוב ש|תדאג ש|שיופיע|שהמוח|תשדרג/;
    if (instructionPatterns.test(message) && message.length > 15) {
      try {
        await prisma.brainUpgradeRequest.create({
          data: {
            chatId: chat.id,
            messageId: userMsg.id,
            instruction: message.slice(0, 2000),
            status: "pending",
            priority: 3,
          },
        });
      } catch {}
    }

    let system = await buildSystemPrompt(chat.id, pageContext);
    // Deterministic intent hint — flash-lite frequently confuses "פרומפט" with "מדריך"
    const lower = message.toLowerCase();
    const mentionsPrompt = /פרומפט|פרומט|prompt/i.test(message);
    const mentionsGuide = /מדריך|guide/i.test(message);
    if (mentionsPrompt && !mentionsGuide) {
      system += `\n\n⚠️ ניתוח הודעה נוכחית: המשתמש ביקש במפורש "פרומפט" (לא מדריך!). השתמש ב-\`compose_prompt\`, לא ב-\`ai_guide\`.`;
    } else if (mentionsGuide && !mentionsPrompt) {
      system += `\n\n⚠️ ניתוח הודעה נוכחית: המשתמש ביקש "מדריך". השתמש ב-\`ai_guide\` או \`import_guide_url\`, לא ב-\`compose_prompt\`.`;
    }
    const history = chat.messages.map((m) => ({
      role: m.role === "brain" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
    history.push({ role: "user", parts: [{ text: message }] });

    const { reply, usage, model } = await callGeminiWithFallback(system, history);
    await logUsage({
      model,
      operation: "brain-chat",
      inputTokens: usage?.promptTokenCount || 0,
      outputTokens: usage?.candidatesTokenCount || 0,
    });

    const brainMsg = await prisma.brainMessage.create({
      data: { chatId: chat.id, role: "brain", content: reply },
    });
    // Capture brain's own upgrade suggestions
    const BRAIN_SUGGESTION = /הצעה|שדרוג|מומלץ|כדאי|הייתי מציע|הייתי ממליץ|יכולת חדשה|פיצ'ר/i;
    if (BRAIN_SUGGESTION.test(reply) && reply.length > 40) {
      try {
        await prisma.brainUpgradeRequest.create({
          data: {
            chatId: chat.id,
            messageId: brainMsg.id,
            instruction: reply.slice(0, 2000),
            context: "brain-suggestion",
            status: "pending",
            priority: 4,
          },
        });
      } catch {}
    }
    // Mark chat as un-summarized after new activity
    await prisma.brainChat.update({
      where: { id: chat.id },
      data: { updatedAt: new Date(), summarizedAt: null },
    });

    return NextResponse.json({ ok: true, chatId: chat.id, reply, messageId: brainMsg.id });
  } catch (e: any) {
    console.error("[brain-chat]", e);
    return NextResponse.json({ error: String(e?.message || e).slice(0, 400) }, { status: 500 });
  }
}
