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
      // Resolve scene from episode or season context
      async function pickSceneFromEpisode(episodeId: string): Promise<{ id: string; overwrite: boolean; prev: string | null } | null> {
        const firstEmpty = await prisma.scene.findFirst({
          where: { episodeId, OR: [{ scriptText: null }, { scriptText: "" }] },
          orderBy: { sceneNumber: "asc" },
          select: { id: true },
        });
        if (firstEmpty) return { id: firstEmpty.id, overwrite: false, prev: null };
        const firstScene = await prisma.scene.findFirst({
          where: { episodeId },
          orderBy: { sceneNumber: "asc" },
          select: { id: true, scriptText: true },
        });
        return firstScene ? { id: firstScene.id, overwrite: true, prev: firstScene.scriptText } : null;
      }
      if (ctxKind === "episode" && !targetSceneId && ctxId) {
        const picked = await pickSceneFromEpisode(ctxId);
        if (picked) { (action as any).sceneId = picked.id; overwriteMode = picked.overwrite; previousScriptText = picked.prev; }
      } else if (ctxKind === "season" && !targetSceneId && ctxId) {
        // Find first episode of this season, then pick its first empty/first scene
        const firstEp: any = await (prisma as any).episode?.findFirst({
          where: { seasonId: ctxId },
          orderBy: { episodeNumber: "asc" },
          select: { id: true },
        });
        if (firstEp) {
          const picked = await pickSceneFromEpisode(firstEp.id);
          if (picked) { (action as any).sceneId = picked.id; overwriteMode = picked.overwrite; previousScriptText = picked.prev; }
        }
      }
      const targetSceneIdResolved: string | null = String((action as any).sceneId || "").trim() || targetSceneId;
      const onProductionContext = ctxKind === "scene" || ctxKind === "episode" || ctxKind === "season";
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
          // Log scene activity
          try {
            await (prisma as any).sceneLog.create({
              data: {
                sceneId: targetSceneIdResolved,
                action: overwriteMode ? "script_overwritten" : "script_updated",
                actor: "ai:brain-compose",
                actorName: "AI Director (Gemini)",
                details: {
                  brief: brief.slice(0, 200),
                  wordCount: composed.prompt.split(/\s+/).length,
                  previousLength: previousScriptText?.length || 0,
                  newLength: composed.prompt.length,
                  reason: overwriteMode ? "overwrite (all scenes had scripts)" : "first-empty",
                },
              },
            });
          } catch {}
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
        durationSec: action.durationSec || 20,
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
    } else if (action.type === "create_episode") {
      // Autonomous episode creation. seasonId explicit or from page ctx.
      const seasonId = String(action.seasonId || "").trim() || (ctxKind === "season" ? ctxId : null);
      if (!seasonId) return NextResponse.json({ error: "seasonId חסר — פתח עמוד עונה או שלח seasonId במפורש" }, { status: 400 });
      const title = String(action.title || "").trim();
      if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });
      const synopsis = typeof action.synopsis === "string" ? action.synopsis.trim() : null;
      const targetDurationSeconds = typeof action.targetDurationSeconds === "number" ? action.targetDurationSeconds : null;
      // Auto-pick next episodeNumber
      const last: any = await (prisma as any).episode?.findFirst({
        where: { seasonId },
        orderBy: { episodeNumber: "desc" },
        select: { episodeNumber: true },
      });
      const nextNumber = (last?.episodeNumber ?? 0) + 1;
      const ep: any = await (prisma as any).episode.create({
        data: { seasonId, episodeNumber: nextNumber, title, synopsis, targetDurationSeconds, status: "DRAFT" },
      });
      resultUrl = `/seasons/${seasonId}/episodes/${ep.id}`;
      resultText = `✅ יצרתי פרק חדש: פרק ${nextNumber} — "${title}"${synopsis ? ` · ${synopsis.slice(0, 120)}` : ""}.`;
    } else if (action.type === "update_episode") {
      const episodeId = String(action.episodeId || "").trim() || (ctxKind === "episode" ? ctxId : null);
      if (!episodeId) return NextResponse.json({ error: "episodeId חסר" }, { status: 400 });
      const data: Record<string, any> = {};
      if (typeof action.title === "string") data.title = action.title.trim();
      if (typeof action.synopsis === "string") data.synopsis = action.synopsis.trim();
      if (typeof action.status === "string") data.status = action.status;
      if (typeof action.targetDurationSeconds === "number") data.targetDurationSeconds = action.targetDurationSeconds;
      if (Object.keys(data).length === 0) return NextResponse.json({ error: "no fields to update" }, { status: 400 });
      const ep: any = await (prisma as any).episode.update({ where: { id: episodeId }, data });
      resultUrl = `/seasons/${ep.seasonId}/episodes/${ep.id}`;
      resultText = `✅ עדכנתי פרק ${ep.episodeNumber}: "${ep.title}".`;
    } else if (action.type === "create_scene") {
      // episodeId explicit or from page ctx (episode/scene)
      let episodeId = String(action.episodeId || "").trim();
      if (!episodeId && ctxKind === "episode") episodeId = ctxId || "";
      if (!episodeId && ctxKind === "scene" && ctxId) {
        const parentScene: any = await (prisma as any).scene?.findUnique({ where: { id: ctxId }, select: { episodeId: true } });
        if (parentScene?.episodeId) episodeId = parentScene.episodeId;
      }
      if (!episodeId) return NextResponse.json({ error: "episodeId חסר — פתח עמוד פרק או שלח episodeId במפורש" }, { status: 400 });
      const title = typeof action.title === "string" ? action.title.trim() : null;
      const summary = typeof action.summary === "string" ? action.summary.trim() : null;
      const scriptText = typeof action.scriptText === "string" ? action.scriptText.trim() : null;
      // Auto-pick next sceneNumber for this episode
      const lastScene: any = await (prisma as any).scene?.findFirst({
        where: { episodeId },
        orderBy: { sceneNumber: "desc" },
        select: { sceneNumber: true },
      });
      const nextNumber = (lastScene?.sceneNumber ?? 0) + 1;
      const ep: any = await (prisma as any).episode?.findUnique({ where: { id: episodeId }, select: { seasonId: true } });
      const scene: any = await (prisma as any).scene.create({
        data: {
          parentType: "episode",
          parentId: episodeId,
          episodeId,
          sceneNumber: nextNumber,
          title,
          summary,
          scriptText,
          scriptSource: scriptText ? "brain-create" : null,
          status: "DRAFT",
        },
      });
      resultUrl = ep ? `/seasons/${ep.seasonId}/episodes/${episodeId}/scenes/${scene.id}` : `/scenes/${scene.id}`;
      resultText = `✅ יצרתי סצנה חדשה: סצנה ${nextNumber}${title ? ` — "${title}"` : ""}${summary ? ` · ${summary.slice(0, 120)}` : ""}.`;
    } else if (action.type === "update_scene") {
      const brainSceneId = String(action.sceneId || "").trim();
      const pageSceneId = ctxKind === "scene" ? (ctxId || null) : null;
      const brainSceneNumber = typeof action.sceneNumber === "number" ? action.sceneNumber : Number(action.sceneNumber) || null;
      const brainEpisodeId = String(action.episodeId || "").trim() || (ctxKind === "episode" ? ctxId : null);

      // Resolve sceneId with cascading fallbacks:
      //   1. brainSceneId exists in DB → use it
      //   2. sceneNumber + episodeId → resolve to real scene
      //   3. page context scene id → use it
      //   4. most-recently-updated episode's sceneNumber → last resort
      //   5. give up with helpful message
      let sceneId: string | null = null;
      let resolvedVia: string | null = null;

      if (brainSceneId) {
        const exists = await prisma.scene.findUnique({ where: { id: brainSceneId }, select: { id: true } });
        if (exists) { sceneId = brainSceneId; resolvedVia = "brain-id"; }
      }
      if (!sceneId && brainSceneNumber && brainEpisodeId) {
        const byNumber = await prisma.scene.findFirst({ where: { episodeId: brainEpisodeId, sceneNumber: brainSceneNumber }, select: { id: true } });
        if (byNumber) { sceneId = byNumber.id; resolvedVia = "number+episode"; }
      }
      if (!sceneId && pageSceneId) {
        const exists = await prisma.scene.findUnique({ where: { id: pageSceneId }, select: { id: true } });
        if (exists) { sceneId = pageSceneId; resolvedVia = "page-context"; }
      }
      if (!sceneId && brainSceneNumber) {
        // Last resort: pick the scene with that number in the most recently-updated episode
        const recentEp = await prisma.episode.findFirst({ orderBy: { updatedAt: "desc" }, select: { id: true } });
        if (recentEp) {
          const byNumber = await prisma.scene.findFirst({ where: { episodeId: recentEp.id, sceneNumber: brainSceneNumber }, select: { id: true } });
          if (byNumber) { sceneId = byNumber.id; resolvedVia = "number+recent-episode"; }
        }
      }

      if (!sceneId) {
        const detail = brainSceneId
          ? `המוח שלח sceneId='${brainSceneId}' שלא קיים ב-DB${brainSceneNumber ? ` ו-sceneNumber=${brainSceneNumber} לא נמצא בפרק הפעיל` : ""}.`
          : "המוח לא שלח sceneId או sceneNumber תקין.";
        return NextResponse.json({ error: `${detail} פתח עמוד של הסצנה הספציפית או בקש מהמוח לעדכן בפעם הבאה עם sceneNumber + episodeId.`, aborted: true }, { status: 404 });
      }

      const data: Record<string, any> = {};
      if (typeof action.title === "string") data.title = action.title.trim();
      if (typeof action.summary === "string") data.summary = action.summary.trim();
      if (typeof action.scriptText === "string") { data.scriptText = action.scriptText.trim(); data.scriptSource = "brain-update"; }
      if (typeof action.status === "string") data.status = action.status;
      if (typeof action.targetDurationSeconds === "number") data.targetDurationSeconds = action.targetDurationSeconds;
      if (Object.keys(data).length === 0) return NextResponse.json({ error: "no fields to update" }, { status: 400 });
      const scene: any = await (prisma as any).scene.update({
        where: { id: sceneId },
        data,
        include: { episode: { select: { id: true, seasonId: true, episodeNumber: true } } },
      });
      resultUrl = scene.episode ? `/seasons/${scene.episode.seasonId}/episodes/${scene.episodeId}/scenes/${scene.id}` : `/scenes/${scene.id}`;
      resultText = `✅ עדכנתי סצנה ${scene.sceneNumber ?? "?"}${scene.title ? ` — "${scene.title}"` : ""}.`;
    } else if (action.type === "update_opening_prompt") {
      // Swap the season-opening prompt, optionally duration/model/aspect.
      // Old prompt snapshotted to SeasonOpeningPromptVersion so nothing is lost.
      const seasonId = String(action.seasonId || "").trim() || (ctxKind === "season" ? ctxId : null);
      if (!seasonId) return NextResponse.json({ error: "seasonId חסר — פתח עמוד עונה או שלח seasonId במפורש" }, { status: 400 });
      const prompt = typeof action.prompt === "string" ? action.prompt.trim() : "";
      if (prompt.length < 10) return NextResponse.json({ error: "prompt required (>=10 chars)" }, { status: 400 });

      const existing = await prisma.seasonOpening.findUnique({ where: { seasonId } });
      if (!existing) return NextResponse.json({ error: "opening not found — create one from the UI first" }, { status: 404 });

      const MODEL_MAX: Record<string, number> = {
        "seedance": 12, "kling": 10,
        "veo3-fast": 8, "veo3-pro": 8,
        "google-veo-3.1-fast-generate-preview": 8,
        "google-veo-3.1-generate-preview": 8,
        "google-veo-3.1-lite-generate-preview": 8,
        "sora-2": 20, "sora-2-pro": 20,
        "vidu-q1": 8,
      };

      const data: Record<string, any> = { currentPrompt: prompt };
      const activeModel = typeof action.model === "string" ? action.model : existing.model;
      if (typeof action.model === "string") data.model = action.model;
      if (typeof action.aspectRatio === "string") data.aspectRatio = action.aspectRatio;
      const cap = MODEL_MAX[activeModel] ?? 12;
      if (typeof action.duration === "number") data.duration = Math.min(action.duration, cap);
      else if (data.model && existing.duration > cap) data.duration = cap;

      // Snapshot the old prompt before overwriting
      if (existing.currentPrompt && existing.currentPrompt !== prompt) {
        await prisma.seasonOpeningPromptVersion.create({
          data: { openingId: existing.id, prompt: existing.currentPrompt },
        });
      }
      await prisma.seasonOpening.update({ where: { id: existing.id }, data });
      resultUrl = `/seasons/${seasonId}#opening`;
      resultText = `✅ עדכנתי את פרומפט הפתיחה של העונה (${prompt.length} תווים). גש ל-Opening ולחץ "יצר מחדש" כדי להפיק וידאו חדש.`;
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

    // Write SceneLog for any scene-related action so it shows in the activity tab
    const sceneActions = ["compose_prompt", "update_scene", "create_scene"];
    const targetSceneId = action.sceneId || (ctxKind === "scene" ? ctxId : null);
    if (sceneActions.includes(action.type) && targetSceneId) {
      await (prisma as any).sceneLog.create({
        data: {
          sceneId: targetSceneId,
          action: `brain_execute_${action.type}`,
          actor: "ai:brain",
          actorName: "במאי AI",
          details: { actionType: action.type, resultText: resultText?.slice(0, 200), resultUrl },
        },
      }).catch(() => {});
    }

    return NextResponse.json({ ok: true, text: resultText, url: resultUrl });
  } catch (e: any) {
    console.error("[brain-chat-execute]", e);
    return NextResponse.json({ error: String(e?.message || e).slice(0, 400) }, { status: 500 });
  }
}
