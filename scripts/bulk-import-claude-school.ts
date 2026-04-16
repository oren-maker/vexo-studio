import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE = "https://claude-school-nu.vercel.app";
const UA = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";

type Guide = { slug: string; title: string; description: string; category: string; level: string; minutes: number };

const GUIDES: Guide[] = [
  { slug: "guide-2026-04-16-jmqzh0", title: "תמונות מוצר כמו בקטלוג — בלי צלם ובלי סטודיו", description: "הפוך תמונה ביתית למגזין מקצועי עם Gemini", category: "פרומפט אנג׳ינירינג", level: "מתחילים", minutes: 3 },
  { slug: "ai-claude-code-seedance-20-2026-04-16", title: "וידאו AI קולנועי מהטרמינל — Claude Code + Seedance 2.0", description: "חבר Claude Code ל-Seedance 2.0 דרך אוטומציית דפדפן", category: "וידאו AI", level: "מתחילים", minutes: 3 },
  { slug: "claude-channels-telegram-guide", title: "Claude Channels — לשלוט ב-Claude Code מהטלפון דרך טלגרם", description: "הפוך הודעות טלגרם לפקודות עבודה על המחשב", category: "אוטומציות", level: "בינוני", minutes: 9 },
  { slug: "content-bot-system-guide", title: "מערכת תוכן אוטומטית — מסריקת פוסטים ויראליים עד פרסום", description: "בנה צינור מסריקה ובנייה של פוסטים בעברית", category: "אוטומציות", level: "בינוני", minutes: 10 },
  { slug: "5-plugins-guide", title: "5 פלאגינים שהופכים את Claude Code לסביבת בנייה מלאה", description: "עיצוב, Figma, תיעוד, בדיקות ובקאנד שלם", category: "פיתוח", level: "מתחילים", minutes: 8 },
  { slug: "6-plugins-guide", title: "6 פלאגינים שכל משתמש Claude Code צריך להכיר", description: "מתודולוגיה, עיצוב, סקירה, בדיקות ודיוק", category: "פיתוח", level: "בינוני", minutes: 10 },
  { slug: "9-secret-repos-guide", title: "9 Repos סודיים שמשדרגים את Claude Code לרמה אחרת", description: "סוכנים שלומדים, ניהול קונטקסט, Kanban ו-AI", category: "פיתוח", level: "בינוני", minutes: 12 },
  { slug: "9-skills-guide", title: "9 תוספים חינמיים שמשדרגים את Claude Code מעוזר לשותף", description: "זיכרון, עיצוב, אוטומציות, מתודולוגיה ומחקר", category: "פיתוח", level: "מתחילים", minutes: 9 },
  { slug: "carl-base-guide", title: "CARL + BASE — איך לגרום ל-Claude Code לעקוב אחרי הכללים", description: "שני כלים שמנהלים כללים וקונטקסט אוטומטית", category: "פיתוח", level: "בינוני", minutes: 9 },
  { slug: "claude-memory-stack-guide", title: "4 כלים שגורמים ל-Claude Code לזכור אתכם בין סשנים", description: "claude-mem, claude-diary, claude-hindsight ו-Obsidian", category: "פיתוח", level: "מתחילים", minutes: 9 },
  { slug: "google-stitch-guide", title: "Google Stitch — איך להפסיק לבנות אפליקציות שנראות כאילו AI", description: "חבר Google Stitch ל-Claude Code דרך MCP", category: "פיתוח", level: "בינוני", minutes: 6 },
  { slug: "seed-paul-guide", title: "SEED + PAUL — מרעיון לאפליקציה שמשלמים עליה", description: "תכנון חכם ובנייה מובנית למניעת כישלונות", category: "פיתוח", level: "בינוני", minutes: 10 },
  { slug: "7-prompts-30-days-content-guide", title: "7 פרומפטים ל-Claude שמייצרים לכם חודש תוכן תוך שעתיים", description: "מחקר קהל, עמודים, לוח שנה, Hooks וניתוח", category: "אינסטגרם", level: "מתחילים", minutes: 12 },
  { slug: "content-growth-skills-guide", title: "5 Skills חינמיים שהופכים את Claude Code למכונת תוכן", description: "טרנדים, קופירייטינג, ניקוי ריח AI והפצה", category: "שיווק דיגיטלי", level: "מתחילים", minutes: 7 },
  { slug: "seo-skill-guide", title: "סקיל SEO ל-Claude Code — בדיקת אתרים מהטרמינל", description: "11 פקודות המחליפות Semrush ו-Ahrefs", category: "שיווק דיגיטלי", level: "מתחילים", minutes: 7 },
  { slug: "ai-2026-04-14", title: "איך לייצר תמונות AI שנראות כאילו צלם מקצועי", description: "נוסחה מובנית של 6 שכבות לפרומפטים", category: "פרומפט אנג׳ינירינג", level: "מתחילים", minutes: 6 },
  { slug: "claude-dating-guide", title: "איך להתחיל עם בחורות דרך Claude Code", description: "Claude Code ועזרה בפתיחת שיחות", category: "פרומפט אנג׳ינירינג", level: "מתחילים", minutes: 8 },
  { slug: "great-prompts-8-layers-guide", title: "נוסחת 8 השכבות — איך לכתוב פרומפטים שנותנים תוצאות", description: "מבנה של 8 שכבות לתוצאות ברמה גבוהה", category: "פרומפט אנג׳ינירינג", level: "מתחילים", minutes: 12 },
  { slug: "master-claude-10-steps-guide", title: "10 צעדים לשלוט ב-Claude תוך שבוע — מדריך מעשי", description: "מהתקנה ואוטומציות, 10 שלבים", category: "פרומפט אנג׳ינירינג", level: "מתחילים", minutes: 10 },
  { slug: "zen-skill-guide", title: "Zen Skill — איך לגרום לקלוד לחשוב לפני שהוא עונה", description: "סקיל שמכריח בחינת אפשרויות", category: "פרומפט אנג׳ינירינג", level: "מתחילים", minutes: 8 },
  { slug: "careless-whisper-guide", title: "Careless Whisper — להפוך דיבור לטקסט מהמחשב", description: "דסקטופ קלילה עם הקלטה וממללא", category: "כלים ו-MCP", level: "מתחילים", minutes: 6 },
  { slug: "caveman-guide", title: "Caveman — איך לחתוך 75% מהטוקנים של Claude Code", description: "סקיל לדיוק עם 75% פחות טוקנים", category: "כלים ו-MCP", level: "מתחילים", minutes: 6 },
  { slug: "graphify-guide", title: "Graphify — איך לגרום לקלוד להכיר את הפרויקט", description: "בנה מפה של פרויקט שקלוד מכיר", category: "כלים ו-MCP", level: "בינוני", minutes: 8 },
  { slug: "nano-banana-mcp-guide", title: "Nano Banana MCP — להפוך את Claude Code לסטודיו עיצוב", description: "חבר ל-Gemini לייצור תמונות מהטרמינל", category: "כלים ו-MCP", level: "מתחילים", minutes: 8 },
  { slug: "notebooklm-claude-guide", title: "חיבור Claude Code ל-NotebookLM — מחקר וסיכומים", description: "פודקאסטים, מפות חשיבה ומצגות", category: "כלים ו-MCP", level: "בינוני", minutes: 8 },
  { slug: "rtl-vscode-agents-guide", title: "RTL for VS Code Agents — עברית תקינה בתוך Claude", description: "תוסף חינמי לתיקון עברית בסוכני AI", category: "כלים ו-MCP", level: "מתחילים", minutes: 6 },
  { slug: "battle-transformation-guide", title: "יצירת סצנת קרב קולנועית ושינוי צורה עם Seedance", description: "סרטון AI עם קרבות והפיכות", category: "וידאו AI", level: "בינוני", minutes: 6 },
  { slug: "remotion-guide", title: "Remotion — לייצר סרטונים מ-React", description: "הפוך React לסרטוני MP4 עם Claude Code", category: "וידאו AI", level: "בינוני", minutes: 8 },
  { slug: "claude-autopost-social", title: "Claude מפרסם לכם בסושיאל — אוטומטית", description: "חבור ל-14+ פלטפורמות לפרסום אוטומטי", category: "אוטומציות", level: "בינוני", minutes: 7 },
  { slug: "claude-code-web-design", title: "איך לבנות דפי נחיתה מושלמים עם Claude Code", description: "4 שלבים לדף נחיתה פרימיום בתוך 10 דקות", category: "פיתוח", level: "מתחילים", minutes: 6 },
  { slug: "claude-code-windows-installation", title: "התקנת Claude Code על Windows — המדריך המלא", description: "Claude Code, Git ו-VS Code צעד אחר צעד", category: "פיתוח", level: "מתחילים", minutes: 10 },
  { slug: "claude-dashboard-guide", title: "איך בונים דשבורד אינטראקטיבי עם Claude — 3 שיטות", description: "מ-Artifacts ל-Claude Code, מ-Excel ל-Dashboard", category: "פיתוח", level: "מתחילים", minutes: 10 },
  { slug: "claude-instagram-audit", title: "אודיט אינסטגרם עם Claude — שתי שיטות", description: "ניתוח מעמיק דרך Windsor.ai או דפדפן", category: "אינסטגרם", level: "בינוני", minutes: 8 },
  { slug: "build-ai-agent-guide", title: "לבנות סוכן AI מאפס — מהקונספט ועד קוד עובד", description: "מדריך צעד-אחר-צעד עם Python, LangChain ו-LangGraph", category: "סוכני AI", level: "בינוני", minutes: 12 },
];

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#x27;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function stripHtml(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, "")).replace(/[ \t]+/g, " ").trim();
}

// Walk an HTML fragment and emit markdown-ish text preserving code blocks, bold, lists
function renderBlock(html: string): { text: string; images: string[] } {
  const images: string[] = [];
  let out = html;

  // Extract <pre><code class="language-X">...</code></pre> first (with optional <code> wrapper)
  out = out.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_m, inner) => {
    const codeMatch = /<code(?:\s+class="[^"]*language-(\w+)[^"]*")?[^>]*>([\s\S]*?)<\/code>/i.exec(inner);
    const lang = codeMatch?.[1] || "text";
    const code = decodeEntities((codeMatch?.[2] ?? inner).replace(/<[^>]+>/g, ""));
    return `\n\n\`\`\`${lang}\n${code.replace(/\n+$/, "")}\n\`\`\`\n\n`;
  });

  // Inline <code> → `…`
  out = out.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_m, inner) => `\`${stripHtml(inner)}\``);

  // <strong>/<b>
  out = out.replace(/<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi, (_m, inner) => `**${stripHtml(inner)}**`);

  // Images — collect to images[]
  out = out.replace(/<img[^>]+src="([^"]+)"[^>]*>/gi, (_m, src) => {
    images.push(src);
    return "";
  });

  // Lists → bullet lines
  out = out.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_m, inner) => {
    const items = Array.from((inner as string).matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi))
      .map((im) => "- " + stripHtml(im[1]))
      .join("\n");
    return `\n\n${items}\n\n`;
  });
  out = out.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_m, inner) => {
    const items = Array.from((inner as string).matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi))
      .map((im, i) => `${i + 1}. ` + stripHtml(im[1]))
      .join("\n");
    return `\n\n${items}\n\n`;
  });

  // Paragraphs → double newline separation
  out = out.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_m, inner) => `\n\n${decodeEntities(inner).replace(/<[^>]+>/g, "")}\n\n`);

  // <h3> inside section body → bold line
  out = out.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_m, inner) => `\n\n**${stripHtml(inner)}**\n\n`);

  // Drop remaining tags, decode, normalize whitespace
  out = decodeEntities(out.replace(/<[^>]+>/g, ""));
  out = out.replace(/\n{3,}/g, "\n\n").trim();
  return { text: out, images };
}

async function fetchAndParse(slug: string): Promise<{ title: string; description: string | null; coverImageUrl: string | null; stages: { title: string; content: string; images: string[] }[] }> {
  const res = await fetch(`${BASE}/guides/${slug}`, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`fetch ${res.status} for ${slug}`);
  let html = await res.text();

  // Strip <script>, <style>, <noscript>, and Next.js bootstrap before anything else
  html = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  html = html.replace(/<style[\s\S]*?<\/style>/gi, "");
  html = html.replace(/<noscript[\s\S]*?<\/noscript>/gi, "");

  const title = decodeEntities(html.match(/<meta\s+property="og:title"\s+content="([^"]*)"/i)?.[1] || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "").replace(/<[^>]+>/g, "").trim();
  const description = decodeEntities(html.match(/<meta\s+property="og:description"\s+content="([^"]*)"/i)?.[1] || "").trim() || null;
  const coverImageUrl = html.match(/<meta\s+property="og:image"\s+content="([^"]*)"/i)?.[1] || null;

  // Narrow to the <main>…</main> region; fall back to <article>; fall back to body-minus-footer
  let body = html;
  const mainMatch = body.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  if (mainMatch) body = mainMatch[1];
  else {
    const articleMatch = body.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    if (articleMatch) body = articleMatch[1];
  }
  // Cut at footer if still present
  body = body.replace(/<footer[\s\S]*$/i, "");
  // Cut at any residual Next.js chunk markers (defensive)
  const nextIdx = body.indexOf("self.__next_f");
  if (nextIdx > 0) body = body.slice(0, nextIdx);
  const copyrightIdx = body.search(/©\s*Claude School/i);
  if (copyrightIdx > 0) body = body.slice(0, copyrightIdx);

  // Split by <h2>, capture section htmls within the narrowed body
  const h2Re = /<h2[^>]*>([\s\S]*?)<\/h2>/gi;
  const matches = Array.from(body.matchAll(h2Re));
  const stages: { title: string; content: string; images: string[] }[] = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const stageTitle = stripHtml(m[1]).slice(0, 200);
    if (!stageTitle || stageTitle.length < 2) continue;
    if (/תוכן עניינים|table of contents/i.test(stageTitle)) continue;
    const start = m.index! + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : body.length;
    const sectionHtml = body.slice(start, end);
    const { text, images } = renderBlock(sectionHtml);
    // Drop residual nav/footer noise tokens if they leaked through
    const clean = text
      .replace(/self\.__next_f[\s\S]*/g, "")
      .replace(/©\s*Claude School[\s\S]*/i, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (clean.length > 10 || images.length > 0) stages.push({ title: stageTitle, content: clean, images });
  }

  return { title, description, coverImageUrl, stages };
}

async function upsertGuide(g: Guide) {
  const existing = await prisma.guide.findUnique({ where: { slug: g.slug }, include: { stages: true } });
  // Always rebuild claude-school-imported guides (fixes the Next.js JS leakage bug in prior parser).
  // Keep other sources (authored, ai-generated) intact if they already have content.
  if (existing && existing.source !== "claude-school-import" && existing.stages.length >= 3) {
    return { slug: g.slug, status: "skipped (non-import source, already has content)" };
  }
  if (existing) {
    await prisma.guide.delete({ where: { id: existing.id } });
  }
  const parsed = await fetchAndParse(g.slug);
  if (parsed.stages.length === 0) {
    // fallback: single stage with og:description
    parsed.stages = [{ title: g.title, content: g.description, images: [] }];
  }
  const guide = await prisma.guide.create({
    data: {
      slug: g.slug,
      defaultLang: "he",
      status: "published",
      isPublic: true,
      source: "claude-school-import",
      sourceUrl: `${BASE}/guides/${g.slug}`,
      category: g.category,
      authorName: "Claude School",
      estimatedMinutes: g.minutes,
      coverImageUrl: parsed.coverImageUrl,
      translations: { create: { lang: "he", title: parsed.title || g.title, description: parsed.description ?? g.description, isAuto: false } },
      stages: {
        create: parsed.stages.map((s, i) => ({
          order: i,
          type: i === 0 ? "start" : i === parsed.stages.length - 1 ? "end" : "middle",
          transitionToNext: "fade",
          translations: { create: { lang: "he", title: s.title, content: s.content, isAuto: false } },
          images: s.images.length > 0 ? { create: s.images.map((u, idx) => ({ blobUrl: u, source: "claude-school", order: idx })) } : undefined,
        })),
      },
    },
  });
  return { slug: g.slug, status: `created (${parsed.stages.length} stages)`, id: guide.id };
}

async function cleanupHebrewSlugDuplicates() {
  const hebrewSlugs = await prisma.guide.findMany({
    where: { slug: { contains: "א" } },
    select: { id: true, slug: true },
  });
  if (hebrewSlugs.length > 0) {
    console.log(`[cleanup] deleting ${hebrewSlugs.length} Hebrew-slug duplicates:`);
    for (const g of hebrewSlugs) console.log(`  - ${g.slug}`);
    await prisma.guide.deleteMany({ where: { id: { in: hebrewSlugs.map((g) => g.id) } } });
  }
}

async function main() {
  await cleanupHebrewSlugDuplicates();
  const results: { slug: string; status: string }[] = [];
  for (const g of GUIDES) {
    try {
      const r = await upsertGuide(g);
      console.log(`[${r.slug}] ${r.status}`);
      results.push({ slug: r.slug, status: r.status });
    } catch (e: any) {
      console.error(`[${g.slug}] ERROR: ${e.message}`);
      results.push({ slug: g.slug, status: `error: ${e.message}` });
    }
  }
  console.log("\n=== Summary ===");
  const created = results.filter((r) => r.status.startsWith("created")).length;
  const skipped = results.filter((r) => r.status.startsWith("skipped")).length;
  const errors = results.filter((r) => r.status.startsWith("error")).length;
  console.log(`created=${created} skipped=${skipped} errors=${errors}`);
  console.log("\n=== Links ===");
  for (const r of results) console.log(`https://vexo-studio.vercel.app/learn/guides/${r.slug}  —  ${r.status}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
