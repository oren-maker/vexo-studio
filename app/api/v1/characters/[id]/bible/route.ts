import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs";

// Character bible — auto-assembles everything the system knows about a
// character from their base fields + episode appearances + scene scriptText
// mentions. No LLM call here; this is a deterministic aggregator so the page
// renders instantly and callers can paste the result straight into a prompt.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const character = await prisma.character.findUnique({
      where: { id: params.id },
      include: {
        media: { orderBy: { createdAt: "desc" }, select: { id: true, fileUrl: true, mediaType: true, createdAt: true, metadata: true } },
        voices: { select: { id: true, voiceModel: true, providerId: true } },
        appearances: {
          include: {
            episode: {
              select: {
                id: true, episodeNumber: true, title: true, status: true, seasonId: true,
                season: { select: { seasonNumber: true, title: true, series: { select: { title: true } } } },
                scenes: { select: { id: true, sceneNumber: true, title: true, scriptText: true, status: true }, orderBy: { sceneNumber: "asc" } },
              },
            },
          },
        },
      },
    });
    if (!character) return ok(null);

    // Collect script snippets that mention the character name (or first name)
    const fullName = character.name.toLowerCase().trim();
    const firstName = fullName.split(" ")[0];
    const mentionPatterns = [fullName, firstName].filter((s) => s.length >= 2);
    const rx = new RegExp(`\\b(${mentionPatterns.map((s) => s.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")).join("|")})\\b`, "i");

    const sceneMentions: { sceneId: string; episodeId: string; episodeNumber: number | null; sceneNumber: number; seriesTitle: string | null; snippet: string }[] = [];
    for (const appearance of character.appearances) {
      const ep = appearance.episode;
      if (!ep) continue;
      for (const s of ep.scenes) {
        if (!s.scriptText) continue;
        if (!rx.test(s.scriptText)) continue;
        // Pull the SMALLEST sentence containing a mention — gives clean evidence per scene
        const sentences = s.scriptText.split(/(?<=[.!?])\s+/);
        const hit = sentences.find((sent) => rx.test(sent)) ?? s.scriptText.slice(0, 200);
        sceneMentions.push({
          sceneId: s.id,
          episodeId: ep.id,
          episodeNumber: ep.episodeNumber,
          sceneNumber: s.sceneNumber,
          seriesTitle: ep.season?.series?.title ?? null,
          snippet: hit.trim().slice(0, 300),
        });
      }
    }

    const firstAppearance = sceneMentions[0] ?? null;
    const lastAppearance = sceneMentions[sceneMentions.length - 1] ?? null;

    return ok({
      character: {
        id: character.id,
        name: character.name,
        roleType: character.roleType,
        characterType: character.characterType,
        gender: character.gender,
        ageRange: character.ageRange,
        appearance: character.appearance,
        personality: character.personality,
        wardrobeRules: character.wardrobeRules,
        speechStyle: character.speechStyle,
        continuityLock: character.continuityLock,
        notes: character.notes,
      },
      portraits: character.media.filter((m) => m.mediaType === "portrait" || m.mediaType === "composite"),
      otherMedia: character.media.filter((m) => m.mediaType !== "portrait" && m.mediaType !== "composite"),
      voices: character.voices,
      stats: {
        episodeCount: character.appearances.length,
        sceneMentionCount: sceneMentions.length,
        firstAppearance,
        lastAppearance,
      },
      episodes: character.appearances.map((a) => ({
        episodeId: a.episode?.id,
        episodeNumber: a.episode?.episodeNumber,
        title: a.episode?.title,
        seasonNumber: a.episode?.season?.seasonNumber,
        seriesTitle: a.episode?.season?.series?.title,
      })),
      sceneMentions,
    });
  } catch (e) { return handleError(e); }
}
