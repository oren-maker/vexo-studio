"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";

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
  { href: "/learn/brain",         label: "🎬 הבמאי",        exact: true },
  { href: "/learn/logs",          label: "📂 לוגים" },
  { href: "/learn/tokens",        label: "🪙 טוקנים" },
];

export default function LearnLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <AuthGuard>
    <div className="min-h-screen" dir="rtl">
      {/* Sticky top navigation */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between py-2">
            <Link href="/learn" className="text-lg font-bold tracking-tight text-gray-900">
              🧠 VEXO <span className="text-[#00BCD4]">LEARN</span>
            </Link>
            <Link href="/admin" className="text-xs text-gray-400 hover:text-gray-700 px-3 py-1 rounded border border-gray-200">
              ← חזרה ל-Studio
            </Link>
          </div>
          {/* Tabs */}
          <div className="flex items-center gap-0 overflow-x-auto -mb-px" style={{ scrollbarWidth: "none" }}>
            {TABS.map((tab) => {
              const t = tab as { href: string; label: string; exact?: boolean };
              const isActive = t.exact
                ? pathname === t.href
                : pathname === t.href || pathname.startsWith(t.href + "/");
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className={`text-[13px] px-3 py-2.5 whitespace-nowrap font-semibold border-b-[3px] transition ${
                    isActive
                      ? "text-[#00BCD4] border-[#00BCD4] bg-[#00BCD4]/5"
                      : "text-gray-500 border-transparent hover:text-gray-900 hover:border-gray-300"
                  }`}
                >
                  {t.label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
      {/* Page content — dark bg matching vexo-learn's original design */}
      <div className="bg-slate-950 text-slate-100 min-h-[calc(100vh-100px)]">
        <div className="max-w-7xl mx-auto px-4 py-6">
          {children}
        </div>
      </div>
    </div>
    </AuthGuard>
  );
}
