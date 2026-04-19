"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

// Shows the latest episode THUMBNAIL Asset as a small preview chip.
// Falls back to nothing if no thumbnail has been generated yet —
// user sees the "🖼 ייצר thumbnail" button and can make one.

type Asset = { id: string; fileUrl: string; createdAt: string; metadata: { model?: string; usdCost?: number } | null };

export function EpisodeThumbnailPreview({ episodeId, he = true }: { episodeId: string; he?: boolean }) {
  const [asset, setAsset] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api<{ assets?: Asset[] }>(`/api/v1/episodes/${episodeId}/assets?type=THUMBNAIL`)
      .then((r) => { if (alive) setAsset(r?.assets?.[0] ?? null); })
      .catch(() => { /* endpoint may not exist — silently hide */ })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [episodeId]);

  if (loading || !asset) return null;

  return (
    <div className="flex items-start gap-3 bg-slate-900/50 border border-slate-800 rounded-lg p-3">
      <img src={asset.fileUrl} alt="episode thumbnail" className="w-40 h-auto aspect-video object-cover rounded bg-black" />
      <div className="flex-1 min-w-0 text-xs">
        <div className="font-semibold text-slate-100 mb-1">🖼 {he ? "Thumbnail של הפרק" : "Episode thumbnail"}</div>
        <div className="text-slate-400">
          {asset.metadata?.model && <span className="font-mono">{asset.metadata.model}</span>}
          {asset.metadata?.usdCost != null && <span className="ms-2">${asset.metadata.usdCost.toFixed(4)}</span>}
        </div>
        <div className="text-[10px] text-slate-500 mt-1 font-mono">{new Date(asset.createdAt).toLocaleString("he-IL")}</div>
        <a href={asset.fileUrl} target="_blank" rel="noreferrer" className="text-[11px] text-cyan-400 hover:underline">פתח במסך מלא →</a>
      </div>
    </div>
  );
}
