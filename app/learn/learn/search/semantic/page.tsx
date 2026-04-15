import SemanticSearchClient from "@/components/learn/semantic-search-client";

export const dynamic = "force-dynamic";

export default function SemanticSearchPage() {
  return (
    <div className="max-w-5xl mx-auto">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-white">🔍 חיפוש סמנטי</h1>
        <p className="text-sm text-slate-400 mt-1">
          חיפוש לפי משמעות (Gemini Embeddings 768-dim) — לא מילים מדויקות. הזן רעיון/תיאור ⇒ מקבל את הפרומפטים הקרובים סמנטית.
        </p>
      </header>
      <SemanticSearchClient />
    </div>
  );
}
