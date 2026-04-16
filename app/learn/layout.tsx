"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/learn/brain/chat", label: "🗣 שיחה עם הבמאי" },
  { href: "/learn/compose", label: "✨ חולל פרומפט" },
  { href: "/learn/sources", label: "📚 ספרייה" },
  { href: "/learn/guides", label: "📖 מדריכים" },
  { href: "/learn/insights", label: "👁 תובנות" },
  { href: "/learn/consciousness", label: "🧠 תודעה" },
  { href: "/learn/knowledge", label: "💡 ידע" },
  { href: "/learn/logs", label: "📂 לוגים" },
];

export default function LearnLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div>
      <nav className="flex items-center gap-1 mb-6 overflow-x-auto pb-1 flex-wrap border-b border-white/10 pt-1" dir="rtl">
        {TABS.map((tab) => {
          const isActive = pathname === tab.href || pathname.startsWith(tab.href + "/");
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`text-sm px-3 py-2 rounded-t-lg whitespace-nowrap transition font-medium ${
                isActive
                  ? "bg-accent-cyan/20 text-accent-cyan border-b-2 border-accent-cyan"
                  : "text-white/50 hover:bg-white/5 hover:text-white border-b-2 border-transparent"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
