"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

const groups = [
  {
    title: "פרומפט",
    icon: "✨",
    items: [
      { href: "/learn/my-prompts", label: "שלי", icon: "📁" },
      { href: "/learn/compose", label: "חולל", icon: "✨" },
      { href: "/learn/improve", label: "שפר", icon: "🎯" },
    ],
  },
  {
    title: "למידה",
    icon: "🧠",
    items: [
      { href: "/learn/brain", label: "המוח", icon: "🧠" },
      { href: "/learn/brain/chat", label: "שיחה עם המוח", icon: "💬" },
      { href: "/learn/insights", label: "תובנות", icon: "📊" },
      { href: "/learn/consciousness", label: "תודעה", icon: "👁" },
      { href: "/learn", label: "Feed", icon: "📚" },
      { href: "/learn/sources", label: "ספרייה", icon: "🎬" },
      { href: "/learn/sources/new", label: "הוסף מקור", icon: "➕" },
      { href: "/learn/sync", label: "סנכרון", icon: "🔄" },
      { href: "/learn/knowledge", label: "Knowledge", icon: "💡" },
      { href: "/learn/search/semantic", label: "חיפוש סמנטי", icon: "🧬" },
    ],
  },
  {
    title: "מדריכים",
    icon: "📖",
    items: [
      { href: "/guides", label: "ספריית מדריכים", icon: "📚" },
      { href: "/guides/new", label: "מדריך חדש", icon: "➕" },
    ],
  },
  {
    title: "וידאו",
    icon: "🎥",
    items: [
      { href: "/video", label: "סקירה", icon: "🎞️" },
      { href: "/video/merge", label: "מיזוג קליפים", icon: "🎬" },
      { href: "/video/trim", label: "טרים מתקדם", icon: "✂️" },
    ],
  },
  {
    title: "ניהול",
    icon: "⚙️",
    items: [
      { href: "/learn/tokens", label: "Tokens", icon: "💰" },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  // Load expanded state from localStorage so it persists between pages.
  // Auto-expand the group that contains the active path.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("sidebar-expanded");
    let initial: Record<string, boolean> = {};
    if (stored) {
      try {
        initial = JSON.parse(stored);
      } catch {}
    }
    // Ensure the group containing the active pathname is expanded.
    for (const g of groups) {
      if (g.items.some((it) => pathname === it.href)) {
        initial[g.title] = true;
      }
    }
    setExpanded(initial);
    setLoaded(true);
  }, [pathname]);

  function toggle(title: string) {
    const next = { ...expanded, [title]: !expanded[title] };
    setExpanded(next);
    localStorage.setItem("sidebar-expanded", JSON.stringify(next));
  }

  return (
    <aside className="w-52 shrink-0 bg-slate-900/70 border-l border-slate-800 px-3 py-4 flex flex-col gap-2 sticky top-0 h-screen backdrop-blur">
      <div className="flex items-center gap-2 mb-3 px-1">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center text-white font-black text-sm">V</div>
        <div className="leading-tight">
          <div className="text-sm font-bold text-white">VEXO Learn</div>
          <div className="text-[9px] text-slate-500 uppercase tracking-wider">Director</div>
        </div>
      </div>

      <nav className="flex-1 flex flex-col gap-1 overflow-y-auto scrollbar-thin">
        {groups.map((g) => {
          const isOpen = loaded ? !!expanded[g.title] : false;
          const hasActive = g.items.some((it) => pathname === it.href);
          return (
            <div key={g.title}>
              <button
                onClick={() => toggle(g.title)}
                className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition ${
                  hasActive ? "bg-slate-800/50 text-cyan-300" : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="text-sm">{g.icon}</span>
                  <span>{g.title}</span>
                </span>
                <span className={`text-[10px] transition-transform ${isOpen ? "rotate-90" : ""}`}>◀</span>
              </button>
              {isOpen && (
                <ul className="flex flex-col gap-0.5 mt-1 mb-1 pr-3">
                  {g.items.map((it) => {
                    const active = pathname === it.href;
                    return (
                      <li key={it.href}>
                        <Link
                          href={it.href}
                          className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition ${
                            active
                              ? "bg-cyan-500/10 text-cyan-300 border border-cyan-500/20"
                              : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                          }`}
                        >
                          <span className="text-sm">{it.icon}</span>
                          <span>{it.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>

      <div className="text-[9px] text-slate-600 pt-2 border-t border-slate-800 px-1">
        אורן · VEXO
      </div>
    </aside>
  );
}
