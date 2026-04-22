"use client";

import { useEffect, useState } from "react";

export default function GuideToc({ items }: { items: { id: string; title: string }[] }) {
  const [activeId, setActiveId] = useState<string | null>(items[0]?.id ?? null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!items.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: [0, 0.25, 0.5, 1] }
    );
    for (const it of items) {
      const el = document.getElementById(it.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [items]);

  if (!items.length) return null;

  return (
    <aside className="hidden lg:block w-64 shrink-0 sticky top-6 self-start">
      <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
        <button
          onClick={() => setOpen(!open)}
          className="w-full flex items-center justify-between text-sm font-bold text-white mb-3"
        >
          <span>תוכן עניינים</span>
          <span className="text-xs text-slate-500">{open ? "≡" : "◁"}</span>
        </button>
        {open && (
          <nav className="flex flex-col gap-1">
            {items.map((it) => (
              <a
                key={it.id}
                href={`#${it.id}`}
                className={`text-xs leading-5 py-1.5 px-2 rounded transition border-r-2 text-right ${
                  activeId === it.id
                    ? "bg-cyan-500/10 text-cyan-300 border-cyan-400"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border-transparent"
                }`}
              >
                {it.title}
              </a>
            ))}
          </nav>
        )}
      </div>
    </aside>
  );
}
