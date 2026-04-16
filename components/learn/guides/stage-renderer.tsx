"use client";

import { useEffect, useState } from "react";

export default function StageRenderer({
  index,
  total,
  title,
  content,
  images,
  type,
  transitionToNext,
  anchorId,
}: {
  index: number;
  total: number;
  title: string;
  content: string;
  images: Array<{ id: string; blobUrl: string; caption: string | null }>;
  type: string;
  transitionToNext: string;
  anchorId?: string;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 100 + index * 80);
    return () => clearTimeout(t);
  }, [index]);

  const transitionClass =
    transitionToNext === "slide"
      ? "transition-all duration-700 ease-out"
      : transitionToNext === "instant"
      ? ""
      : "transition-opacity duration-700 ease-out";

  const initial =
    transitionToNext === "slide"
      ? visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
      : transitionToNext === "instant"
      ? "opacity-100"
      : visible ? "opacity-100" : "opacity-0";

  const typeBadge =
    type === "start" ? { bg: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40", label: "התחלה" } :
    type === "end" ? { bg: "bg-purple-500/15 text-purple-300 border-purple-500/40", label: "סיום" } :
    { bg: "bg-cyan-500/15 text-cyan-300 border-cyan-500/40", label: "שלב" };

  return (
    <section id={anchorId} className={`bg-slate-900/60 border border-slate-800 rounded-xl p-6 scroll-mt-24 ${transitionClass} ${initial}`}>
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] uppercase font-bold border px-2 py-0.5 rounded ${typeBadge.bg}`}>
            {typeBadge.label}
          </span>
          <span className="text-[11px] text-slate-500 font-mono">שלב {index + 1} / {total}</span>
        </div>
        {/* progress bar */}
        <div className="flex-1 max-w-xs h-1 bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-l from-cyan-500 to-purple-500" style={{ width: `${((index + 1) / total) * 100}%` }} />
        </div>
      </div>

      <h2 className="text-2xl font-bold text-white mb-3">{title}</h2>

      {content && (
        <div className="text-slate-200 leading-relaxed whitespace-pre-wrap text-base">
          {content}
        </div>
      )}

      {images.length > 0 && (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {images.map((img) => (
            <figure key={img.id} className="bg-slate-950/50 rounded-lg overflow-hidden border border-slate-800">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.blobUrl} alt={img.caption || ""} className="w-full max-h-96 object-cover" />
              {img.caption && <figcaption className="text-xs text-slate-400 p-2">{img.caption}</figcaption>}
            </figure>
          ))}
        </div>
      )}
    </section>
  );
}
