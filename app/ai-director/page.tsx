"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";

const VEXO_LEARN_BASE = "https://vexo-learn.vercel.app";

const TABS = [
  { key: "chat", label: "🗣 שיחה עם הבמאי", path: "/learn/brain/chat" },
  { key: "compose", label: "✨ חולל פרומפט", path: "/learn/compose" },
  { key: "sources", label: "📚 ספרייה", path: "/learn/sources" },
  { key: "guides", label: "📖 מדריכים", path: "/guides" },
  { key: "insights", label: "👁 תובנות", path: "/learn/insights" },
  { key: "consciousness", label: "🧠 תודעה", path: "/learn/consciousness" },
  { key: "knowledge", label: "💡 ידע", path: "/learn/knowledge" },
  { key: "logs", label: "📂 לוגים", path: "/learn/logs" },
] as const;

function AiDirectorContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const activeTab = searchParams.get("tab") || "chat";
  const current = TABS.find((t) => t.key === activeTab) || TABS[0];
  const iframeSrc = `${VEXO_LEARN_BASE}${current.path}?embed=1`;

  return (
    <div className="flex flex-col h-[calc(100vh-80px)]">
      <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-1 flex-wrap" dir="rtl">
        {TABS.map((tab) => {
          const isActive = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              onClick={() => router.replace(`/ai-director?tab=${tab.key}`)}
              className={`text-sm px-3 py-2 rounded-lg whitespace-nowrap transition font-medium ${
                isActive
                  ? "bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/40"
                  : "text-sidebar-text hover:bg-white/5 hover:text-white border border-transparent"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <iframe
        key={activeTab}
        src={iframeSrc}
        className="flex-1 w-full rounded-xl border border-white/10 bg-slate-950"
        style={{ minHeight: 600 }}
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}

export default function AiDirectorPage() {
  return (
    <Suspense fallback={<div className="text-center py-20 text-white/50">טוען...</div>}>
      <AiDirectorContent />
    </Suspense>
  );
}
