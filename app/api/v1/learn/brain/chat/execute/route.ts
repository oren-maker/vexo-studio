import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";
import { scrapeGuideFromUrl } from "@/lib/learn/guide-scraper";
import { extractInstagram } from "@/lib/learn/instagram";
import { generateGuideFromTopic } from "@/lib/learn/guide-ai";
import { translateGuideToLang } from "@/lib/learn/translate";
import { runPipeline } from "@/lib/learn/pipeline";
import { composePrompt } from "@/lib/learn/gemini-compose";
import { startVideoGeneration, runVideoGeneration } from "@/lib/learn/gemini-video-gen";

export const runtime = "nodejs";
export const maxDuration = 120;

// Hebrew → Latin transliteration for clean ASCII URL slugs
const HE_TO_LAT: Record<string, string> = {
  א: "a", ב: "b", ג: "g", ד: "d", ה: "h", ו: "v", ז: "z", ח: "ch", ט: "t",
  י: "y", כ: "k", ך: "k", ל: "l", מ: "m", ם: "m", נ: "n", ן: "n", ס: "s",
  ע: "a", פ: "p", ף: "p", צ: "tz", ץ: "tz", ק: "k", ר: "r", ש: "sh", ת: "t",
};

function slugify(text: string): string {
  const transliterated = text
    .split("")
    .map((c) => HE_TO_LAT[c] ?? c)
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
  return transliterated || "guide";
}

export async function POST(req: NextRequest) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;
  try {
    const { action, chatId } = await req.json();
    if (!action?.type) return NextResponse.json({ error: "action.type required" }, { status: 400 });

    let resultText = "";
    let resultUrl: string | null = null;

    if (action.type === "import_guide_url") {
      const scraped = await scrapeGuideFromUrl(action.url);
      const lang = action.lang || "he";
      const slug = `${slugify(scraped.title) || "guide"}-${Date.now().toString(36).slice(-4)}`;
      const guide = await prisma.guide.create({
        data: {
          slug, defaultLang: lang, status: "draft", isPublic: true,
          source: "url-import", sourceUrl: action.url, coverImageUrl: scraped.coverImageUrl,
          translations: { create: { lang, title: scraped.title, description: scraped.description, isAuto: false } },
          stages: scraped.stages.length > 0 ? {
            create: scraped.stages.map((s, i) => ({
              order: i,
              type: i === 0 ? "start" : i === scraped.stages.length - 1 ? "end" : "middle",
              transitionToNext: "fade",
              translations: { create: { lang, title: s.title, content: s.content, isAuto: false } },
              images: s.images.length > 0 ? { create: s.images.map((u, idx) => ({ blobUrl: u, source: "url-scrape", order: idx })) } : undefined,
            })),
          } : undefined,
        },
      });
      if (lang !== "he") waitUntil(translateGuideToLang(guide.id, "he").catch(() => {}));
      resultUrl = `/guides/${guide.slug}`;
      resultText = `✅ יצרתי מדריך: "${scraped.title}" עם ${scraped.stages.length} שלבים.`;
    } else if (action.type === "ai_guide") {
      const lang = action.lang || "he";
      const ai = await generateGuideFromTopic(action.topic, lang);
      const slug = `${slugify(ai.title || action.topic) || "guide"}-${Date.now().toString(36).slice(-4)}`;
      const guide = await prisma.guide.create({
        data: {
          slug, defaultLang: lang, status: "draft", isPublic: true,
          source: "ai-generated", category: ai.category || null, estimatedMinutes: ai.estimatedMinutes || null,
          translations: { create: { lang, title: ai.title, description: ai.description, isAuto: true } },
          stages: { create: ai.stages.map((s, i) => ({ order: i, type: s.type, transitionToNext: "fade", translations: { create: { lang, title: s.title, content: s.content, isAuto: true } } })) },
        },
      });
      if (lang !== "he") waitUntil(translateGuideToLang(guide.id, "he").catch(() => {}));
      resultUrl = `/guides/${guide.slug}`;
      resultText = `✅ יצרתי מדריך AI: "${ai.title}" עם ${ai.stages.length} שלבים.`;
    } else if (action.type === "import_instagram_guide") {
      const ig = await extractInstagram(action.url);
      const lang = action.lang || "he";
      const title = (ig.caption || "Instagram guide").split(/[.!?\n]/)[0].slice(0, 200);
      const slug = `${slugify(title) || "ig-guide"}-${Date.now().toString(36).slice(-4)}`;
      const guide = await prisma.guide.create({
        data: {
          slug, defaultLang: lang, status: "draft", isPublic: true,
          source: "instagram", sourceUrl: ig.sourceUrl, coverImageUrl: ig.thumbnail,
          translations: { create: { lang, title, description: ig.caption?.slice(0, 500) || null, isAuto: false } },
          stages: ig.caption ? {
            create: [{
              order: 0, type: "start", transitionToNext: "fade",
              translations: { create: { lang, title, content: ig.caption, isAuto: false } },
              images: ig.thumbnail ? { create: [{ blobUrl: ig.thumbnail, source: "instagram", order: 0 }] } : undefined,
            }],
          } : undefined,
        },
      });
      if (lang !== "he") waitUntil(translateGuideToLang(guide.id, "he").catch(() => {}));
      resultUrl = `/guides/${guide.slug}`;
      resultText = `✅ ייבאתי מ-Instagram: "${title.slice(0, 60)}".`;
    } else if (action.type === "compose_prompt") {
      const brief = String(action.brief || action.topic || "").trim();
      if (!brief) return NextResponse.json({ error: "brief/topic required" }, { status: 400 });
      const composed = await composePrompt(brief);
      const source = await prisma.learnSource.create({
        data: {
          type: "upload",
          prompt: composed.prompt,
          title: brief.slice(0, 120),
          status: "complete",
          addedBy: "brain-chat",
        },
      });
      resultUrl = `/learn/sources/${source.id}`;
      const wordCount = composed.prompt.split(/\s+/).length;
      const sections = ["VISUAL STYLE", "FILM STOCK", "COLOR", "LIGHTING", "CHARACTER", "AUDIO", "TIMELINE", "QUALITY"]
        .filter((s) => composed.prompt.toUpperCase().includes(s));
      const preview = composed.prompt.slice(0, 600);
      resultText = `✅ יצרתי פרומפט מלא: ${wordCount} מילים · ${sections.length}/8 סעיפים.\n\n📄 תצוגה מקדימה:\n${preview}${composed.prompt.length > 600 ? "..." : ""}\n\n💡 ${composed.rationale?.slice(0, 300) || ""}`;
    } else if (action.type === "generate_video") {
      const sourceId = String(action.sourceId || "").trim();
      if (!sourceId) return NextResponse.json({ error: "sourceId required" }, { status: 400 });
      const source = await prisma.learnSource.findUnique({ where: { id: sourceId } });
      if (!source) return NextResponse.json({ error: "source not found" }, { status: 404 });
      if (!source.prompt) return NextResponse.json({ error: "source has no prompt" }, { status: 400 });
      const videoId = await startVideoGeneration(source.prompt, source.id, {
        durationSec: action.durationSec || 8,
        aspectRatio: action.aspectRatio || "16:9",
      });
      waitUntil(runVideoGeneration(videoId, source.prompt).catch(() => {}));
      resultUrl = `/learn/sources/${source.id}`;
      resultText = `🎬 התחלתי ליצור סרטון VEO (8s, 16:9). זה לוקח 1-2 דקות. ניתן לראות את ההתקדמות בדף המקור.`;
    } else if (action.type === "import_source") {
      const source = await prisma.learnSource.create({
        data: { type: "instructor_url", url: action.url, prompt: "", status: "pending", addedBy: "brain-chat" },
      });
      waitUntil(runPipeline(source.id).catch(() => {}));
      resultUrl = `/learn/sources/${source.id}`;
      resultText = `✅ יצרתי מקור חדש — רץ pipeline ברקע. תוכל לראות את הפרומפט בעוד דקה.`;
    } else {
      return NextResponse.json({ error: `unknown action type: ${action.type}` }, { status: 400 });
    }

    // Record result as brain message in the chat
    if (chatId) {
      await prisma.brainMessage.create({
        data: { chatId, role: "brain", content: `${resultText}${resultUrl ? `\n🔗 ${resultUrl}` : ""}` },
      });
      await prisma.brainChat.update({ where: { id: chatId }, data: { updatedAt: new Date(), summarizedAt: null } });
    }

    return NextResponse.json({ ok: true, text: resultText, url: resultUrl });
  } catch (e: any) {
    console.error("[brain-chat-execute]", e);
    return NextResponse.json({ error: String(e?.message || e).slice(0, 400) }, { status: 500 });
  }
}
