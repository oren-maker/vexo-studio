import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, isAuthResponse, requirePermission } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs";
export const maxDuration = 60;

// Aggregate every episode synopsis in the series and ask Gemini for a
// 3-paragraph narrative summary (logline, themes, arc). Saves to
// Series.summary — overwriting whatever was there (older version lives
// on in the Prisma audit log if enabled).

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "edit_project"); if (f) return f;

    const series = await prisma.series.findUnique({
      where: { id: params.id },
      include: {
        seasons: {
          orderBy: { seasonNumber: "asc" },
          include: {
            episodes: {
              orderBy: { episodeNumber: "asc" },
              select: { episodeNumber: true, title: true, synopsis: true },
            },
          },
        },
      },
    });
    if (!series) throw Object.assign(new Error("series not found"), { statusCode: 404 });

    const episodeList = series.seasons.flatMap((s) =>
      s.episodes.map((e) => `S${s.seasonNumber}E${e.episodeNumber}: "${e.title}" — ${e.synopsis?.slice(0, 250) ?? "(no synopsis)"}`)
    );

    if (episodeList.length === 0) {
      throw Object.assign(new Error("no episodes yet — add at least one episode with a synopsis"), { statusCode: 400 });
    }

    const prompt = `כתוב סיכום עלילתי תמציתי לסדרה "${series.title}" (ז'אנר: ${series.genre ?? "לא צוין"}) בעברית, בפורמט הבא:

**פסקה 1 (logline — משפט אחד):** מהי הסדרה במשפט אחד חד.
**פסקה 2 (נושאים):** 3-4 משפטים על הנושאים המרכזיים, קונפליקטים רגשיים, סגנון ויזואלי.
**פסקה 3 (קשת):** 3-4 משפטים על ההתקדמות הכוללת מפרק 1 עד הסוף.

הנה כל הפרקים (לפי סדר):
${episodeList.slice(0, 60).join("\n")}

כתוב ישר את הסיכום, ללא מבוא/סיום/הסברים. השתמש בסגנון כמו בתיאור של פלטפורמה (Netflix, Apple TV). 250-400 מילים.`;

    const key = process.env.GEMINI_API_KEY;
    if (!key) throw Object.assign(new Error("GEMINI_API_KEY missing"), { statusCode: 500 });

    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 1500 },
        }),
        signal: AbortSignal.timeout(40_000),
      },
    );
    if (!r.ok) throw Object.assign(new Error(`gemini ${r.status}`), { statusCode: 502 });
    const j: any = await r.json();
    const summary = j.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!summary) throw Object.assign(new Error("gemini returned empty summary"), { statusCode: 502 });

    await prisma.series.update({
      where: { id: params.id },
      data: { summary },
    });

    return ok({
      seriesId: params.id,
      summaryLength: summary.length,
      episodeCount: episodeList.length,
      summary,
    });
  } catch (e) { return handleError(e); }
}
