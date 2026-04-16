"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { AuthGuard } from "@/components/auth-guard";

const groups = [
  {
    title: "סדרות",
    icon: "🎬",
    items: [
      { href: "/learn/series", label: "ניתוח סדרות", icon: "📊" },
    ],
  },
  {
    title: "פרומפט",
    icon: "✨",
    items: [
      { href: "/learn/my-prompts", label: "פרומפט בAI", icon: "📁" },
      { href: "/learn/compose", label: "חולל", icon: "✨" },
    ],
  },
  {
    title: "במאי בAI",
    icon: "🎬",
    items: [
      { href: "/learn/brain/chat", label: "שיחה עם הבמאי", icon: "🗣" },
      { href: "/learn/brain", label: "הבמאי", icon: "🎬" },
      { href: "/learn/brain/upgrades", label: "שדרוגים", icon: "⬆️" },
      { href: "/learn/insights", label: "תובנות", icon: "📊" },
      { href: "/learn/consciousness", label: "תודעה", icon: "👁" },
      { href: "/learn", label: "Feed", icon: "📚" },
      { href: "/learn/sources", label: "זיכרון", icon: "🧠" },
      { href: "/learn/sync", label: "סנכרון", icon: "🔄" },
      { href: "/learn/knowledge", label: "Knowledge", icon: "💡" },
      { href: "/learn/search", label: "חיפוש סמנטי", icon: "🧬" },
    ],
  },
  {
    title: "וידאו",
    icon: "🎥",
    items: [
      { href: "/learn/video", label: "סקירה", icon: "🎞️" },
    ],
  },
  {
    title: "ניהול",
    icon: "⚙️",
    items: [
      { href: "/learn/tokens", label: "Tokens", icon: "💰" },
      { href: "/learn/logs", label: "לוגים", icon: "📂" },
    ],
  },
];

export default function LearnLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("learn-sidebar-expanded");
    let initial: Record<string, boolean> = {};
    if (stored) { try { initial = JSON.parse(stored); } catch {} }
    for (const g of groups) {
      if (g.items.some((it) => pathname === it.href || (it.href !== "/learn" && pathname.startsWith(it.href + "/")))) {
        initial[g.title] = true;
      }
    }
    setExpanded(initial);
    setLoaded(true);
  }, [pathname]);

  function toggle(title: string) {
    const next = { ...expanded, [title]: !expanded[title] };
    setExpanded(next);
    localStorage.setItem("learn-sidebar-expanded", JSON.stringify(next));
  }

  return (
    <AuthGuard>
      <div className="flex min-h-screen bg-slate-950 text-slate-100" dir="rtl">
        {/* Sidebar — right side (RTL) */}
        <aside className="w-52 shrink-0 bg-slate-900/70 border-l border-slate-800 px-3 py-4 flex flex-col gap-2 sticky top-0 h-screen backdrop-blur overflow-y-auto">
          {/* Logo */}
          <div className="flex items-center gap-2 mb-2 px-1">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center text-white font-black text-sm">V</div>
            <div className="leading-tight">
              <div className="text-sm font-bold text-white">VEXO Learn</div>
              <div className="text-[9px] text-slate-500 uppercase tracking-wider">Director</div>
            </div>
          </div>

          {/* Back to Studio */}
          <Link href="/admin" className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-slate-400 hover:bg-slate-800/50 hover:text-white transition border border-slate-800 mb-2">
            <span>←</span>
            <span>חזרה לראשי</span>
          </Link>

          {/* Navigation groups */}
          <nav className="flex-1 flex flex-col gap-1">
            {groups.map((g) => {
              const isOpen = loaded ? !!expanded[g.title] : false;
              const hasActive = g.items.some((it) => pathname === it.href || (it.href !== "/learn" && pathname.startsWith(it.href + "/")));
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
                        const active = pathname === it.href || (it.href !== "/learn" && pathname.startsWith(it.href + "/"));
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
            אורן · VEXO Studio
          </div>
        </aside>

        {/* Main content — overflow-y-auto so long pages scroll independently of the sticky sidebar */}
        <main className="flex-1 p-6 md:p-10 overflow-y-auto overflow-x-hidden" style={{ maxHeight: "100vh" }}>
          {children}
        </main>
      </div>
    </AuthGuard>
  );
}
