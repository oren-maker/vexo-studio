"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/learn",               label: "📚 Feed",         exact: true },
  { href: "/learn/brain/chat",    label: "🗣 שיחה עם הבמאי" },
  { href: "/learn/compose",       label: "✨ חולל פרומפט" },
  { href: "/learn/my-prompts",    label: "📁 הפרומפטים שלי" },
  { href: "/learn/improve",       label: "🎯 שפר" },
  { href: "/learn/sources",       label: "🎬 ספרייה" },
  { href: "/learn/sources/new",   label: "➕ הוסף מקור" },
  { href: "/learn/guides",        label: "📖 מדריכים" },
  { href: "/learn/insights",      label: "📊 תובנות" },
  { href: "/learn/consciousness", label: "👁 תודעה" },
  { href: "/learn/knowledge",     label: "💡 ידע" },
  { href: "/learn/search",        label: "🔍 חיפוש" },
  { href: "/learn/sync",          label: "🔄 סנכרון" },
  { href: "/learn/brain",         label: "🎬 הבמאי" },
  { href: "/learn/logs",          label: "📂 לוגים" },
  { href: "/learn/tokens",        label: "🪙 טוקנים" },
];

export default function LearnLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100" dir="rtl">
      {/* Top bar */}
      <div className="bg-slate-900/80 backdrop-blur-sm border-b border-white/10 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between py-3">
            <Link href="/learn" className="text-lg font-bold tracking-tight">
              VEXO <span className="text-cyan-400">LEARN</span>
            </Link>
            <Link href="/admin" className="text-xs text-slate-400 hover:text-white">
              ← חזרה ל-Studio
            </Link>
          </div>
          {/* Tab navigation */}
          <nav className="flex items-center gap-0.5 overflow-x-auto pb-0 -mb-px scrollbar-none">
            {TABS.map((tab) => {
              const isActive = tab.exact
                ? pathname === tab.href
                : pathname === tab.href || pathname.startsWith(tab.href + "/");
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`text-[13px] px-3 py-2.5 whitespace-nowrap transition font-medium border-b-2 ${
                    isActive
                      ? "text-cyan-400 border-cyan-400 bg-white/5"
                      : "text-slate-400 border-transparent hover:text-white hover:bg-white/5"
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  );
}
