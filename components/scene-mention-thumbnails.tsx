"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { learnFetch } from "@/lib/learn/fetch";
import { adminHeaders } from "@/lib/learn/admin-key";

// Scans brain chat content for /scenes/<cuid> or .../scenes/<cuid> URLs,
// fetches the best-available thumbnail for each, and renders a horizontal
// strip of small clickable previews under the message. Makes scene-references
// visual instead of abstract ID strings.

const SCENE_ID_RX = /\/scenes\/([a-z0-9]{20,30})\b/gi;

type Thumb = { sceneId: string; sceneNumber: number | null; url: string | null; kind: string };

export function SceneMentionThumbnails({ content, max = 3 }: { content: string; max?: number }) {
  const ids = [...content.matchAll(SCENE_ID_RX)].map((m) => m[1]);
  const uniq = [...new Set(ids)].slice(0, max);
  const [thumbs, setThumbs] = useState<Thumb[]>([]);

  useEffect(() => {
    if (uniq.length === 0) return;
    let alive = true;
    Promise.all(
      uniq.map((id) =>
        learnFetch(`/api/v1/scenes/${id}/thumbnail`, { headers: adminHeaders() })
          .then((r) => r.json())
          .then((d) => ({ sceneId: id, sceneNumber: d?.sceneNumber ?? null, url: d?.url ?? null, kind: d?.kind ?? "none" }))
          .catch(() => ({ sceneId: id, sceneNumber: null, url: null, kind: "error" }))
      ),
    ).then((results) => { if (alive) setThumbs(results.filter((t) => t.url)); });
    return () => { alive = false; };
  }, [uniq.join(",")]);

  if (thumbs.length === 0) return null;

  return (
    <div className="mt-2 flex gap-2 flex-wrap">
      {thumbs.map((t) => (
        <Link
          key={t.sceneId}
          href={`/scenes/${t.sceneId}`}
          className="group block"
          title={`סצנה ${t.sceneNumber ?? "?"} · ${t.kind}`}
        >
          {t.kind.startsWith("video") ? (
            <video
              src={t.url!}
              muted
              className="h-16 w-28 object-cover rounded bg-black border border-slate-700 group-hover:border-cyan-400"
              preload="metadata"
            />
          ) : (
            <img
              src={t.url!}
              alt={`Scene ${t.sceneNumber ?? "?"}`}
              className="h-16 w-28 object-cover rounded bg-black border border-slate-700 group-hover:border-cyan-400"
              loading="lazy"
            />
          )}
          <div className="text-[10px] text-slate-400 mt-0.5 text-center">SC{String(t.sceneNumber ?? 0).padStart(2, "0")}</div>
        </Link>
      ))}
    </div>
  );
}
