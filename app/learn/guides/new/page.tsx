import NewGuideTabs from "@/components/learn/guides/new-guide-tabs";

export const dynamic = "force-dynamic";

export default function NewGuidePage() {
  return (
    <div className="max-w-4xl mx-auto">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-white">➕ מדריך חדש</h1>
        <p className="text-sm text-slate-400 mt-1">בחר איך אתה רוצה להתחיל — ידני, AI, מ-URL, או מ-Instagram.</p>
      </header>
      <NewGuideTabs />
    </div>
  );
}
