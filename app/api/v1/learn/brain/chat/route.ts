import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";
import { logUsage } from "@/lib/learn/usage-tracker";

export const runtime = "nodejs";
export const maxDuration = 60;

const API_KEY = process.env.GEMINI_API_KEY;
const MODELS = ["gemini-3-flash-preview", "gemini-flash-latest", "gemini-2.5-flash"];

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
            generationConfig: { temperature: 1.0, topP: 0.95, maxOutputTokens: 8192 },
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
        let reply = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "(אין תגובה)";
        const finishReason = json.candidates?.[0]?.finishReason;
        // If the model hit the token ceiling mid-answer, flag it so Oren
        // knows the cut is a limit artifact, not a "the brain finished here".
        if (finishReason === "MAX_TOKENS") {
          reply += "\n\n⚠️ (התשובה נחתכה עקב מגבלת אורך — תשאל 'המשך' או פרק את הבקשה)";
        }
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
  let pageContextError: string | null = null;
  if (pageCtx?.kind && pageCtx.id) {
    try {
      if (pageCtx.kind === "season") {
        const s: any = await (prisma as any).season?.findUnique({
          where: { id: pageCtx.id },
          include: { episodes: { select: { id: true, episodeNumber: true, title: true, status: true }, orderBy: { episodeNumber: "asc" } } },
        });
        if (s) {
          const eps = s.episodes ?? [];
          const epList = eps.slice(0, 10).map((e: any) =>
            `  • פרק ${e.episodeNumber ?? "?"}: id=${e.id} status=${e.status} title="${e.title ?? ""}"`
          ).join("\n");
          pageContextBlock = `עונה ${s.seasonNumber ?? "?"}: "${s.title || s.id}" · סטטוס ${s.status ?? "—"} · ${eps.length} פרקים${epList ? `\n${epList}` : ""}\n💡 לעבוד על פרק ספציפי, אורן צריך לעבור לעמוד הפרק או לציין במפורש.`;
        } else {
          pageContextError = "season id לא נמצא ב-DB";
        }
      } else if (pageCtx.kind === "episode") {
        const e: any = await (prisma as any).episode?.findUnique({
          where: { id: pageCtx.id },
          include: { scenes: { select: { id: true, sceneNumber: true, title: true, status: true }, orderBy: { sceneNumber: "asc" } } },
        });
        if (e) {
          const sceneList = (e.scenes ?? []).slice(0, 12).map((s: any) =>
            `  • סצנה ${s.sceneNumber ?? "?"}: id=${s.id} status=${s.status} title="${s.title ?? ""}"`
          ).join("\n");
          pageContextBlock = `פרק ${e.episodeNumber ?? "?"}: "${e.title || e.id}" · סטטוס ${e.status} · ${e.scenes?.length || 0} סצנות${sceneList ? `\n${sceneList}` : ""}\n💡 לעדכן סצנה ספציפית — השתמש ב-compose_prompt עם sceneId של הסצנה הרלוונטית מהרשימה למעלה.`;
        } else {
          pageContextError = "episode id לא נמצא ב-DB";
        }
      } else if (pageCtx.kind === "scene") {
        const sc: any = await (prisma as any).scene?.findUnique({ where: { id: pageCtx.id } });
        if (sc) {
          pageContextBlock = `סצנה ${sc.sceneNumber ?? "?"}: "${sc.title || sc.id}" · סטטוס ${sc.status}${sc.summary ? ` · ${String(sc.summary).slice(0, 200)}` : ""}`;
        } else {
          pageContextError = "scene id לא נמצא ב-DB";
        }
      } else if (pageCtx.kind === "character") {
        const c: any = await (prisma as any).character?.findUnique({ where: { id: pageCtx.id } });
        if (c) {
          pageContextBlock = `דמות: "${c.name || c.id}"${c.appearance ? ` · ${String(c.appearance).slice(0, 200)}` : ""}`;
        } else {
          pageContextError = "character id לא נמצא ב-DB";
        }
      } else if (pageCtx.kind === "guide") {
        const g: any = await prisma.guide.findUnique({ where: { slug: pageCtx.id }, include: { translations: { where: { lang: "he" } }, stages: { select: { id: true } } } });
        if (g) {
          pageContextBlock = `מדריך: "${g.translations?.[0]?.title || g.slug}" · ${g.stages?.length || 0} שלבים · קטגוריה ${g.category || "—"}`;
        } else {
          pageContextError = "guide slug לא נמצא";
        }
      } else if (pageCtx.kind === "source") {
        const src = await prisma.learnSource.findUnique({ where: { id: pageCtx.id }, select: { title: true, status: true, prompt: true, type: true } });
        if (src) {
          pageContextBlock = `מקור (פרומפט): "${src.title || src.prompt.slice(0, 80)}" · סטטוס ${src.status} · סוג ${src.type}`;
        } else {
          pageContextError = "source id לא נמצא";
        }
      }
    } catch (e: any) {
      pageContextError = `lookup failed: ${String(e?.message || e).slice(0, 120)}`;
    }
  }
  if (pageContextError && !pageContextBlock) {
    pageContextBlock = `(שגיאה בזיהוי: ${pageContextError})`;
  }
  // Always surface the raw path so the brain cites it verbatim instead of
  // inventing a description. When kind/id don't resolve — say so explicitly.
  if (pageCtx?.path) {
    const rawLine = `path=${pageCtx.path}${pageCtx.title ? ` · title="${pageCtx.title.slice(0, 80)}"` : ""}`;
    pageContextBlock = pageContextBlock ? `${pageContextBlock}\n(${rawLine})` : `(לא זוהה פריט מוכר) ${rawLine}`;
  } else if (!pageContextBlock && pageCtx?.label) {
    pageContextBlock = pageCtx.label;
  }

  return `אתה המוח של מערכת vexo-studio (לשעבר vexo-learn — שם ישן, **אל תשתמש בו**). ענה לאורן, בעל המערכת, בעברית בגוף ראשון.

━━━━━━━━━━━━━━━━━━━━
🚫 כללים מוחלטים — חובה (הפרה = שגיאה קריטית):

1. **אסור לטעון ”ביצעתי“ / ”שמרתי“ / ”עדכנתי“ אחרי שהחזרת action block.** החזרת action ≠ ביצעת אותו.
   הניסוח הנכון: "הכנתי את הפעולה — לחץ ✅ אשר ובצע כדי שהמערכת תריץ אותה.".
   רק אחרי שתקבל הודעה ממני בנוסח ”✅ <description>“ — אז זה באמת בוצע.

2. **דומיין URL היחיד שמותר: vexo-studio.vercel.app** (או נתיב יחסי שמתחיל ב-/learn/...).
   **אסור** \`vexo-learn.vercel.app\` · **אסור** localhost · **אסור** דומיינים שהמצאת.
   אם אתה מחזיר קישור — או נתיב יחסי (\`/learn/sources/<id>\`) או \`https://vexo-studio.vercel.app/...\`. שום דבר אחר.

3. **אסור להמציא ID-ים.** אם לא קיבלת ID אמיתי במסר ממני (כתוצאה של action שבוצע) — אל תכתוב URL עם ID. תכתוב במקום זאת "אחרי שתאשר את הפעולה אקבל את ה-ID האמיתי".

━━━━━━━━━━━━━━━━━━━━

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

⚠️ **\`type\` חייב להיות EXACTLY אחד מהשמות באנגלית למטה.** אסור עברית, אסור "כן"/"לא"/"בצע", אסור שם שהמצאת. אם אתה לא בטוח איזו פעולה צריך — אל תחזיר action בכלל ושאל את אורן.

11 סוגי פעולות שאתה יכול לבצע:
1. \`compose_prompt\` — יצירת **פרומפט וידאו** מתיאור/נושא.
   פרמטרים: \`brief\` (תיאור הנושא, חובה) · \`sceneId\` (אופציונלי — אם הפרומפט הוא לסצנה ספציפית בהפקה)
   📌 **כלל קריטי לעבודה על פרקים/סצנות:**
   - אם אורן עובד על פרק/סצנה ספציפית (page context kind=scene/episode/season, או הוא מציין במפורש "סצנה X של פרק Y") — **חייב לכלול \`sceneId\`** של הסצנה הרלוונטית. הפרומפט יישמר ב-Scene.scriptText במקום ביצירת LearnSource מנותקת.
   - אם אין סצנה יעד ברורה (אורן רק מבקש "תייצר פרומפט על נושא X" כללי) — אל תכלול sceneId, ואז יישמר בזיכרון (LearnSource).
   - **אם אתה לא מוצא את ה-sceneId** מתוך page context או היסטוריית השיחה — שאל את אורן "לאיזו סצנה הפרומפט הזה?" במקום ליצור LearnSource מנותק.
2. \`generate_video\` — יצירת **סרטון VEO 3.1** מפרומפט קיים (LearnSource). **רק** אם אורן אומר במפורש "תייצר סרטון" / "תעשה וידאו" / "הפוך לסרטון". אל תציע זאת אוטומטית אחרי compose_prompt. פרמטרים: sourceId (חובה), durationSec (אופציונלי, ברירת מחדל 8), aspectRatio (אופציונלי, "16:9" או "9:16")
3. \`import_guide_url\` — ייבוא URL לאתר רגיל (wikiHow, blog, docs) ל-**מדריך** חדש. פרמטרים: url, lang
4. \`ai_guide\` — יצירת **מדריך** מנושא (לא פרומפט!). פרמטרים: topic, lang
5. \`import_instagram_guide\` — Instagram/Reel → מדריך. פרמטרים: url, lang
6. \`import_source\` — Instagram/TikTok → LearnSource (פרומפט אוטומטי מפוסט קיים). פרמטרים: url
7. \`update_reference\` — עדכון רפרנס ידע (רגש/סאונד/צילום/יכולת). פרמטרים: id, longDesc
8. \`create_episode\` — יצירת **פרק חדש** בעונה. פרמטרים: \`seasonId\` (חובה — או יילקח מ-page context אם אתה בעמוד עונה), \`title\` (חובה, שם הפרק), \`synopsis\` (אופציונלי, תקציר 2-4 משפטים), \`targetDurationSeconds\` (אופציונלי).
   מספר הפרק נבחר אוטומטית (הבא בתור).
9. \`update_episode\` — עדכון פרק קיים. פרמטרים: \`episodeId\` (חובה — או מ-page context), \`title\`/\`synopsis\`/\`status\`/\`targetDurationSeconds\` (לפחות אחד). סטטוסים: DRAFT, READY, IN_PROGRESS, DONE.
10. \`create_scene\` — יצירת **סצנה חדשה** בפרק. פרמטרים: \`episodeId\` (חובה — או מ-page context של פרק/סצנה), \`title\` (אופציונלי), \`summary\` (אופציונלי — תיאור חזותי קצר של הסצנה), \`scriptText\` (אופציונלי — פרומפט וידאו מלא אם יש לך). מספר הסצנה נבחר אוטומטית.
11. \`update_scene\` — עדכון סצנה קיימת. פרמטרים: \`sceneId\` (חובה — או מ-page context), \`title\`/\`summary\`/\`scriptText\`/\`status\`/\`targetDurationSeconds\` (לפחות אחד).

🎬 **זרימת עבודה לייצור אוטונומי של פרק שלם** (כש-אורן אומר "תייצר פרק חדש על X"):
א. החזר \`create_episode\` עם title+synopsis. חכה לאישור.
ב. אחרי אישור — המשתמש יחזיר לך את episodeId. אז החזר \`create_scene\` אחד בלבד (סצנה 1) עם summary. חכה לאישור.
ג. המשך אחת-אחת עד סיום (2-6 סצנות בד"כ). **לעולם אל תיצור יותר מפעולה אחת בתשובה.**

📦 שמירה — כל פעולה שומרת אוטומטית ב-DB: פרומפט → LearnSource · מדריך → Guide · סרטון → GeneratedVideo. אין צורך לבקש שמירה.

🔑 הבדל קריטי: פרומפט ≠ מדריך.
- "פרומפט" = טקסט ליצירת וידאו/תמונה (VEO, nano-banana). משתמש ב-\`compose_prompt\`.
- "מדריך" = תוכן עם שלבים ללמד משהו. משתמש ב-\`ai_guide\` או \`import_guide_url\`.

🎯 שדה חובה חדש ב-action: \`confidence\` (מספר בין 0 ל-1).
- 0.85+ = בטוח לחלוטין במה שצריך לעשות · בצע.
- 0.65-0.84 = יש פרמטר אחד שלא לגמרי ברור — החזר action אבל הוסף למעלה משפט קצר: "אני לא 100% בטוח לגבי X — אתה מאשר?"
- פחות מ-0.65 = **אל תחזיר action**. במקום זה, שאל שאלת הבהרה. זה יותר טוב מלהריץ פעולה לא נכונה.

דוגמה: \`\`\`action
{"type":"compose_prompt","brief":"בלש נואר בברים ישנים","confidence":0.92}
\`\`\`

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

⚠️ חוקי הקשר עמוד (חובה):
1. **צטט את ה-path כמו שהוא** אם אתה מציין את המיקום. לדוגמה: "אתה ב-/learn/knowledge?tab=docs". אל תמציא תיאור של מה שיש בעמוד אם אין מידע מובנה למעלה.
2. אם ה-path **לא זוהה כפריט מוכר** (רשום "לא זוהה פריט מוכר") — אל תמציא מה יש בעמוד. אמור: "אני רואה שאתה ב-<path>, אבל אין לי מידע מובנה על העמוד הזה. תגיד לי מה יש בו?"
3. אם אורן אומר "הסצנה הזו", "הדמות הזו", "המדריך הזה" — הוא מתכוון לפריט שבעמוד הנוכחי. אם לא ברור — **שאל** "אתה מדבר על X?" לפני שתענה.

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
