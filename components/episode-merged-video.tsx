"use client";
/**
 * Episode merged-video card.
 * - Loads existing merged Asset (if any) on mount.
 * - "Merge" button: GET /merge-clips → stitchClipsInBrowser (FFmpeg.wasm) →
 *   uploadMergedEpisode (Vercel Blob) → POST /merged-video → reload.
 * - Reuses the same "merged" Asset table the rest of the app reads from.
 */
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useLang } from "@/lib/i18n";

type Clip = { url: string; label: string; kind: "opening" | "scene"; sceneNumber?: number };
type MergeClipsResponse = {
  episodeNumber: number;
  hasOpening: boolean;
  clips: Clip[];
  missing: { sceneId: string; sceneNumber: number; title: string | null }[];
  total: number;
};
type Merged = { id: string; fileUrl: string; createdAt: string; metadata: { clipCount?: number; builtAt?: string; sourceClips?: Clip[] } };

export function EpisodeMergedVideo({ episodeId }: { episodeId: string }) {
  const lang = useLang(); const he = lang === "he";
  const [merged, setMerged] = useState<Merged | null>(null);
  const [clipsInfo, setClipsInfo] = useState<MergeClipsResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ pct: number; msg: string } | null>(null);

  async function loadAll() {
    try {
      const [m, c] = await Promise.all([
        api<{ merged: Merged | null }>(`/api/v1/episodes/${episodeId}/merged-video`).catch(() => ({ merged: null })),
        api<MergeClipsResponse>(`/api/v1/episodes/${episodeId}/merge-clips`).catch(() => null),
      ]);
      setMerged(m.merged);
      setClipsInfo(c);
    } catch (e) { setErr((e as Error).message); }
  }
  useEffect(() => { loadAll(); }, [episodeId]);

  async function runMerge() {
    setErr(null); setBusy(true); setProgress({ pct: 0, msg: he ? "מתחיל…" : "Starting…" });
    try {
      const info = clipsInfo ?? await api<MergeClipsResponse>(`/api/v1/episodes/${episodeId}/merge-clips`);
      if (!info.clips.length) throw new Error(he ? "אין קליפים לאיחוד" : "No clips to merge");

      // 1. Stitch in-browser
      const { stitchClipsInBrowser } = await import("@/lib/ffmpeg-wasm");
      const blob = await stitchClipsInBrowser(
        info.clips.map((c) => c.url),
        (pct, msg) => setProgress({ pct: Math.min(80, Math.round(pct * 0.8)), msg }),
      );

      // 2. Upload to Vercel Blob
      setProgress({ pct: 82, msg: he ? "מעלה ל-Blob…" : "Uploading to Blob…" });
      const { uploadMergedEpisode } = await import("@/lib/blob-upload");
      const { url } = await uploadMergedEpisode(blob, episodeId, (pct) => {
        setProgress({ pct: 80 + Math.round(pct * 0.18), msg: he ? `מעלה ${pct}%…` : `Uploading ${pct}%…` });
      });

      // 3. Persist as Asset
      setProgress({ pct: 99, msg: he ? "שומר…" : "Saving…" });
      const r = await api<{ merged: Merged }>(`/api/v1/episodes/${episodeId}/merged-video`, {
        method: "POST",
        body: {
          blobUrl: url,
          clipCount: info.clips.length,
          sourceClips: info.clips,
        },
      });
      setMerged(r.merged);
      setProgress({ pct: 100, msg: he ? "הושלם" : "Done" });
      setTimeout(() => setProgress(null), 1500);
    } catch (e) {
      setErr((e as Error).message);
      setProgress(null);
    } finally { setBusy(false); }
  }

  const clipsCount = clipsInfo?.total ?? 0;

  return (
    <div className="rounded-card border border-bg-main bg-bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="font-bold text-base">🎬 {he ? "הפרק המאוחד" : "Merged episode"}</div>
          <div className="text-xs text-text-muted">
            {he ? "פתיח + סצנות בסדר → סרטון אחד מתנגן" : "Opening + scenes in order → one continuous video"}
          </div>
        </div>
        {merged && !busy && (
          <button onClick={runMerge} className="px-3 py-1.5 rounded-lg border border-accent text-accent text-sm font-semibold">
            🔁 {he ? "ייצר מחדש" : "Rebuild"}
          </button>
        )}
        {!merged && !busy && clipsCount > 0 && (
          <button onClick={runMerge} className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-bold">
            🎬 {he ? `חבר ${clipsCount} קליפים` : `Merge ${clipsCount} clips`}
          </button>
        )}
      </div>

      {err && <div className="text-xs text-status-errText">⚠ {err}</div>}

      {progress && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span>{progress.msg}</span>
            <span className="num">{progress.pct}%</span>
          </div>
          <div className="h-2 rounded-full bg-bg-main overflow-hidden">
            <div className="h-full bg-accent transition-all" style={{ width: `${progress.pct}%` }} />
          </div>
        </div>
      )}

      {clipsInfo && clipsInfo.missing.length > 0 && (
        <div className="text-[11px] text-status-warnText bg-status-warningBg rounded-lg px-3 py-2">
          ⚠ {he ? `לסצנות הבאות אין סרטון ראשי וידלגו: ` : "Scenes without a primary video will be skipped: "}
          {clipsInfo.missing.map((m) => `SC${m.sceneNumber}`).join(", ")}
        </div>
      )}

      {merged && (
        <div className="space-y-2">
          <video src={merged.fileUrl} controls className="w-full rounded-lg bg-black" />
          <div className="flex flex-wrap gap-2 text-[11px] text-text-muted">
            <span>{merged.metadata.clipCount} {he ? "קליפים" : "clips"}</span>
            <span>·</span>
            <span>{he ? "נבנה" : "built"}: {merged.metadata.builtAt ? new Date(merged.metadata.builtAt).toLocaleString(he ? "he-IL" : undefined) : "—"}</span>
            <a href={merged.fileUrl} download className="ms-auto text-accent hover:underline">⬇ {he ? "הורד" : "Download"}</a>
          </div>
        </div>
      )}

      {!merged && clipsInfo && clipsCount === 0 && (
        <div className="text-xs text-text-muted text-center py-3">
          {he ? "אין סרטונים זמינים — צור סרטון בכל סצנה וסמן אותו כראשי" : "No videos available — create a video on each scene and mark it as main"}
        </div>
      )}

      {clipsInfo && clipsCount > 0 && !merged && !busy && (
        <details className="text-xs">
          <summary className="cursor-pointer text-text-muted">{he ? `תצוגה מקדימה של הסדר (${clipsCount})` : `Preview order (${clipsCount})`}</summary>
          <ol className="list-decimal ms-5 mt-2 space-y-0.5 text-text-secondary">
            {clipsInfo.clips.map((c, i) => <li key={i}>{c.label}</li>)}
          </ol>
        </details>
      )}
    </div>
  );
}
