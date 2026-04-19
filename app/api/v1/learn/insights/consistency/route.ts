import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

// Cross-reference consistency checker.
// Scans all active series + their scenes and flags:
//   1. Scene scriptText mentions a character NAME that isn't in the cast
//      (EpisodeCharacter for the episode).
//   2. Same appearance-token for a character described differently in two
//      scenes (e.g. "blond" in SC1 vs "brunette" in SC3). Uses naive
//      attribute extraction — catches low-hanging drift.
// Ships as a GET so the UI can poll it cheaply and show a /learn/inconsistencies page.
export async function GET(req: NextRequest) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;

  try {
    // Only scan scenes that are likely finalized or in late-stage (skip DRAFT noise)
    const scenes = await prisma.scene.findMany({
      where: {
        scriptText: { not: null },
        status: { in: ["STORYBOARD_APPROVED", "VIDEO_REVIEW", "APPROVED", "LOCKED"] },
      },
      select: {
        id: true, sceneNumber: true, scriptText: true, episodeId: true,
        episode: { select: { id: true, episodeNumber: true, seasonId: true, season: { select: { series: { select: { title: true } } } } } },
      },
      take: 500,
    });

    // Batch-load episode casts once per episode
    const episodeIds = [...new Set(scenes.map((s) => s.episodeId).filter((v): v is string => !!v))];
    const casts = await prisma.episodeCharacter.findMany({
      where: { episodeId: { in: episodeIds } },
      include: { character: { select: { id: true, name: true, appearance: true } } },
    });
    const castByEpisode = new Map<string, typeof casts>();
    for (const c of casts) {
      const arr = castByEpisode.get(c.episodeId) ?? [];
      arr.push(c);
      castByEpisode.set(c.episodeId, arr);
    }

    type Issue = {
      kind: "missing_cast" | "appearance_drift";
      sceneId: string;
      episodeNumber: number | null;
      sceneNumber: number;
      seriesTitle: string | null;
      detail: string;
    };
    const issues: Issue[] = [];

    // Attribute tokens we scan for per-character drift. Low-precision by design.
    const ATTR_TOKENS = [
      /\b(blond|blonde|brunette|redhead|dark[- ]haired|grey[- ]haired|bald|long[- ]haired|short[- ]haired)\b/gi,
      /\b(tall|short|lanky|stocky|slim|heavy)\b/gi,
      /\b(beard|mustache|clean[- ]shaven|stubble)\b/gi,
      /\b(scar|tattoo|glasses|piercing)\b/gi,
    ];
    const descriptorsByCharacter = new Map<string, Map<string, Issue[]>>();

    for (const scene of scenes) {
      if (!scene.scriptText || !scene.episodeId) continue;
      const cast = castByEpisode.get(scene.episodeId) ?? [];
      const castByFirstName = new Map<string, string>();
      for (const c of cast) {
        const first = c.character.name.split(" ")[0].toLowerCase();
        castByFirstName.set(first, c.character.id);
      }

      const text = scene.scriptText;

      // 1) Find ALL_CAPS speaker names + "SPEAKER:" patterns and unknowns
      const allCaps = [...text.matchAll(/\b[A-Z][A-Z']{2,}\b/g)].map((m) => m[0].toLowerCase());
      const speakerCues = [...text.matchAll(/^([A-Z][A-Z \-.']{1,40})\s*(?:\(|:)/gm)].map((m) => m[1].trim().toLowerCase());
      const candidates = new Set([...allCaps, ...speakerCues].filter((s) => s.length >= 3));
      // Only complain about names that look person-like (not VISUAL, CAMERA, etc.)
      const TECHNICAL = new Set(["visual", "camera", "shot", "audio", "music", "scene", "ext", "int", "fade", "cut", "close", "wide", "medium", "pov", "bg", "fg", "slow", "fast", "day", "night", "cu", "vo", "os", "the", "and", "for", "with", "style", "film", "color", "lighting", "character", "timeline", "quality", "stock"]);
      for (const cand of candidates) {
        if (TECHNICAL.has(cand)) continue;
        if (!castByFirstName.has(cand)) {
          issues.push({
            kind: "missing_cast",
            sceneId: scene.id,
            episodeNumber: scene.episode?.episodeNumber ?? null,
            sceneNumber: scene.sceneNumber,
            seriesTitle: scene.episode?.season?.series?.title ?? null,
            detail: `"${cand}" מוזכר ב-scriptText אבל אין Character שמיוצג בפרק הזה.`,
          });
          break; // one mention per scene is enough — avoid spam
        }
      }

      // 2) Appearance drift per character mentioned
      for (const c of cast) {
        const first = c.character.name.split(" ")[0].toLowerCase();
        const nearRx = new RegExp(`${first}[^.!?\\n]{0,180}`, "gi");
        const snippets = [...text.matchAll(nearRx)].map((m) => m[0]);
        for (const snip of snippets) {
          for (const rx of ATTR_TOKENS) {
            for (const m of snip.matchAll(rx)) {
              const token = m[0].toLowerCase();
              const byChar = descriptorsByCharacter.get(c.character.id) ?? new Map<string, Issue[]>();
              const list = byChar.get(token) ?? [];
              list.push({
                kind: "appearance_drift",
                sceneId: scene.id,
                episodeNumber: scene.episode?.episodeNumber ?? null,
                sceneNumber: scene.sceneNumber,
                seriesTitle: scene.episode?.season?.series?.title ?? null,
                detail: `${c.character.name}: "${token}"`,
              });
              byChar.set(token, list);
              descriptorsByCharacter.set(c.character.id, byChar);
            }
          }
        }
      }
    }

    // Flag characters that have CONFLICTING descriptors in the same category.
    // Categories are the 4 regex groups; if a character has 2+ DIFFERENT tokens
    // from the same regex, that's drift.
    const ATTR_CATEGORIES = [
      ["blond", "blonde", "brunette", "redhead", "dark-haired", "grey-haired", "bald", "long-haired", "short-haired"],
      ["tall", "short", "lanky", "stocky", "slim", "heavy"],
      ["beard", "mustache", "clean-shaven", "stubble"],
    ];
    for (const [charId, byToken] of descriptorsByCharacter) {
      for (const cat of ATTR_CATEGORIES) {
        const hits = cat.filter((t) => byToken.has(t));
        if (hits.length >= 2) {
          // Merge all scene mentions from the conflicting tokens
          const conflictIssues = hits.flatMap((t) => byToken.get(t) ?? []);
          issues.push({
            kind: "appearance_drift",
            sceneId: conflictIssues[0].sceneId,
            episodeNumber: conflictIssues[0].episodeNumber,
            sceneNumber: conflictIssues[0].sceneNumber,
            seriesTitle: conflictIssues[0].seriesTitle,
            detail: `הדמות (${charId.slice(-6)}) מתוארת גם כ-"${hits.join('" וגם כ-"')}" — בדוק עקביות.`,
          });
        }
      }
    }

    return NextResponse.json({
      ok: true,
      scannedScenes: scenes.length,
      issueCount: issues.length,
      issues: issues.slice(0, 200),
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e).slice(0, 400) }, { status: 500 });
  }
}
