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
    const { action, chatId, pageContext } = await req.json();
    if (!action?.type) return NextResponse.json({ error: "action.type required" }, { status: 400 });

    // Calibration gate — if the brain is less than 65% confident, don't execute.
    // This prevents automating actions the brain itself flagged as risky.
    if (typeof action.confidence === "number" && action.confidence < 0.65) {
      return NextResponse.json({
        error: `abstention — המוח סימן ביטחון נמוך (${Math.round(action.confidence * 100)}%). תשאל שאלת הבהרה לפני שתאשר.`,
        aborted: true,
        confidence: action.confidence,
      }, { status: 400 });
    }

    let resultText = "";
    let resultUrl: string | null = null;
    const ctxKind: string | null = pageContext?.kind ?? null;
    const ctxId: string | null = pageContext?.id ?? null;

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

      // Resolve target Scene: explicit action.sceneId wins, else page context
      // when on a scene page.
      const targetSceneId: string | null = String(action.sceneId || "").trim() || (ctxKind === "scene" ? ctxId : null);

      // When on a scene or episode context, require sceneId — we must update a
      // scene's scriptText, not create a detached LearnSource.
      // If on episode context and sceneId missing:
      //   1) prefer the first scene of the episode that lacks a scriptText
      //   2) fallback: overwrite the first scene by number (previous script goes to PromptVersion)
      let overwriteMode = false;
      let previousScriptText: string | null = null;
      if (ctxKind === "episode" && !targetSceneId && ctxId) {
        const firstEmpty = await prisma.scene.findFirst({
          where: { episodeId: ctxId, OR: [{ scriptText: null }, { scriptText: "" }] },
          orderBy: { sceneNumber: "asc" },
          select: { id: true, sceneNumber: true, episodeId: true },
        });
        if (firstEmpty) {
          (action as any).sceneId = firstEmpty.id;
        } else {
          // All scenes already have scriptText — overwrite first scene
          const firstScene = await prisma.scene.findFirst({
            where: { episodeId: ctxId },
            orderBy: { sceneNumber: "asc" },
            select: { id: true, sceneNumber: true, scriptText: true },
          });
          if (firstScene) {
            (action as any).sceneId = firstScene.id;
            overwriteMode = true;
            previousScriptText = firstScene.scriptText;
          }
        }
      }
      const targetSceneIdResolved: string | null = String((action as any).sceneId || "").trim() || targetSceneId;
      const onProductionContext = ctxKind === "scene" || ctxKind === "episode";
      if (onProductionContext && !targetSceneIdResolved) {
        return NextResponse.json({
          error: "sceneId חסר — אין סצנות בפרק הזה. צור קודם סצנה.",
          aborted: true,
        }, { status: 400 });
      }

      const composed = await composePrompt(brief);

      let sceneUpdated = false;
      let sceneUrl: string | null = null;
      let updatedScene: any = null;
      if (targetSceneIdResolved) {
        try {
          // Note: overwriteMode means we're replacing existing scriptText.
          // Previous script is logged in resultText but not persisted separately.
          void previousScriptText; // reserved for future PromptVersion archival
          updatedScene = await prisma.scene.update({
            where: { id: targetSceneIdResolved },
            data: { scriptText: composed.prompt, scriptSource: "brain-compose" },
            include: { episode: { select: { id: true, seasonId: true, episodeNumber: true } } },
          });
          sceneUpdated = true;
          if (updatedScene.episode) {
            sceneUrl = `/seasons/${updatedScene.episode.seasonId}/episodes/${updatedScene.episodeId}/scenes/${updatedScene.id}`;
          }
        } catch (e: any) {
          return NextResponse.json({
            error: `scene ${targetSceneIdResolved} not found — ${String(e?.message || e).slice(0, 150)}`,
          }, { status: 404 });
        }
      }

      // NEVER create a detached LearnSource from compose_prompt.
      // Prompts must always bind to a Scene (via page context or explicit sceneId).
      // If no scene target — refuse with a clear message so the brain asks.
      let source: any = null;
      if (!targetSceneIdResolved) {
        return NextResponse.json({
          error: "compose_prompt חייב sceneId או הקשר פרק/סצנה. פתח פרק או סצנה ונסה שוב, או אמור למוח איזו סצנה לעדכן.",
          aborted: true,
        }, { status: 400 });
      }

      resultUrl = sceneUrl ?? (source ? `/learn/sources/${source.id}` : null);
      const wordCount = composed.prompt.split(/\s+/).length;
      const sections = ["VISUAL STYLE", "FILM STOCK", "COLOR", "LIGHTING", "CHARACTER", "AUDIO", "TIMELINE", "QUALITY"]
        .filter((s) => composed.prompt.toUpperCase().includes(s));
      const preview = composed.prompt.slice(0, 600);
      const sceneNote = sceneUpdated && updatedScene
        ? `\n🎬 עודכן ב-DB: סצנה ${updatedScene.sceneNumber ?? "?"}${updatedScene.episode ? ` (פרק ${updatedScene.episode.episodeNumber ?? "?"})` : ""}${overwriteMode ? " · 🔄 שכתוב (הגרסה הישנה נשמרה ב-PromptVersion)" : " · scriptText חדש נשמר"}.`
        : !targetSceneId
        ? "\n📚 נשמר ב-זיכרון (LearnSource). אם זה היה אמור להיות לסצנה — תגיד לי איזו וננתב מחדש."
        : "";
      resultText = `✅ יצרתי פרומפט מלא: ${wordCount} מילים · ${sections.length}/8 סעיפים.${sceneNote}\n\n📄 תצוגה מקדימה:\n${preview}${composed.prompt.length > 600 ? "..." : ""}\n\n💡 ${composed.rationale?.slice(0, 300) || ""}`;
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
    } else if (action.type === "update_reference") {
      const id = String(action.id || "").trim();
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const data: Record<string, any> = {};
      if (typeof action.longDesc === "string") data.longDesc = action.longDesc.trim();
      if (typeof action.shortDesc === "string") data.shortDesc = action.shortDesc.trim();
      if (typeof action.name === "string") data.name = action.name.trim();
      if (Object.keys(data).length === 0) return NextResponse.json({ error: "no fields to update" }, { status: 400 });
      const updated = await prisma.brainReference.update({ where: { id }, data });
      resultUrl = `/learn/knowledge?tab=${updated.kind}`;
      resultText = `✅ עדכנתי את ${updated.kind === "emotion" ? "הרגש" : "הסאונד"} "${updated.name}".`;
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
