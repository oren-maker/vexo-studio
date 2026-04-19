"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { learnFetch } from "@/lib/learn/fetch";
import { adminHeaders } from "@/lib/learn/admin-key";

type Results = {
  scenes: { id: string; sceneNumber: number; title: string | null; summary: string | null; status: string; episode: { episodeNumber: number | null; seasonId: string; season: { series: { title: string | null } | null } | null } | null }[];
  guides: { id: string; slug: string; category: string | null; coverImageUrl: string | null; translations: { title: string; description: string | null }[] }[];
  sources: { id: string; title: string | null; prompt: string; type: string; status: string }[];
  characters: { id: string; name: string; roleType: string | null; appearance: string | null }[];
  refs: { id: string; kind: string; name: string; shortDesc: string }[];
};

export default function GlobalSearchPage() {
  const router = useRouter();
  const params = useSearchParams();
  const initialQ = params?.get("q") ?? "";
  const [q, setQ] = useState(initialQ);
  const [data, setData] = useState<{ query: string; total: number; results: Results } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = q.trim();
    if (trimmed.length < 2) { setData(null); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await learnFetch(`/api/v1/learn/search/global?q=${encodeURIComponent(trimmed)}`, { headers: adminHeaders() });
        const j = await r.json();
        if (r.ok) setData(j);
      } catch {}
      finally { setLoading(false); }
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const url = q ? `?q=${encodeURIComponent(q)}` : "";
    router.replace(`/learn/search/all${url}`, { scroll: false });
  }, [q, router]);

  return (
    <div className="max-w-4xl mx-auto space-y-6" dir="rtl">
      <header>
        <h1 className="text-2xl font-bold text-slate-100">🔍 חיפוש גלובלי</h1>
        <p className="text-sm text-slate-400 mt-1">סצנות · מדריכים · מקורות · דמויות · רפרנסים</p>
      </header>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
        placeholder="כתוב משהו (לפחות 2 תווים)..."
        className="w-full bg-slate-900 border border-slate-700 focus:border-cyan-500 rounded-xl px-4 py-3 text-slate-100 outline-none"
      />

      {loading && <div className="text-slate-500 text-sm">מחפש…</div>}
      {data && data.total === 0 && !loading && (
        <div className="text-center py-12 text-slate-500">
          <div className="text-5xl mb-3">🤷</div>
          אין תוצאות ל-"{data.query}"
        </div>
      )}

      {data && data.total > 0 && (
        <div className="space-y-6">
          <div className="text-xs text-slate-500">{data.total} תוצאות</div>

          {data.results.scenes.length > 0 && (
            <Section title={`🎬 סצנות (${data.results.scenes.length})`}>
              {data.results.scenes.map((s) => (
                <Link key={s.id} href={`/scenes/${s.id}`} className="block bg-slate-900/40 border border-slate-800 rounded-lg p-3 hover:border-cyan-500/40">
                  <div className="text-xs text-slate-400">
                    {s.episode?.season?.series?.title && <span>{s.episode.season.series.title} · </span>}
                    <span className="font-mono">EP{String(s.episode?.episodeNumber ?? 0).padStart(2, "0")} · SC{String(s.sceneNumber).padStart(2, "0")}</span>
                    <span className="ms-2 text-amber-300">{s.status}</span>
                  </div>
                  <div className="font-semibold text-slate-100 mt-1">{s.title ?? "ללא כותרת"}</div>
                  {s.summary && <div className="text-xs text-slate-400 mt-1 line-clamp-2">{s.summary}</div>}
                </Link>
              ))}
            </Section>
          )}

          {data.results.guides.length > 0 && (
            <Section title={`📘 מדריכים (${data.results.guides.length})`}>
              {data.results.guides.map((g) => (
                <Link key={g.id} href={`/guides/${g.slug}`} className="block bg-slate-900/40 border border-slate-800 rounded-lg p-3 hover:border-cyan-500/40">
                  <div className="flex items-start gap-3">
                    {g.coverImageUrl && <img src={g.coverImageUrl} alt="" className="w-16 h-16 object-cover rounded" />}
                    <div className="flex-1">
                      <div className="font-semibold text-slate-100">{g.translations[0]?.title ?? g.slug}</div>
                      {g.category && <div className="text-xs text-cyan-400 mt-0.5">{g.category}</div>}
                      {g.translations[0]?.description && <div className="text-xs text-slate-400 mt-1 line-clamp-2">{g.translations[0].description}</div>}
                    </div>
                  </div>
                </Link>
              ))}
            </Section>
          )}

          {data.results.sources.length > 0 && (
            <Section title={`📥 מקורות (${data.results.sources.length})`}>
              {data.results.sources.map((s) => (
                <Link key={s.id} href={`/learn/sources/${s.id}`} className="block bg-slate-900/40 border border-slate-800 rounded-lg p-3 hover:border-cyan-500/40">
                  <div className="font-semibold text-slate-100">{s.title ?? "ללא כותרת"}</div>
                  <div className="text-xs text-slate-400 mt-1 line-clamp-2">{s.prompt.slice(0, 180)}</div>
                  <div className="text-[10px] text-slate-500 mt-1">{s.type} · {s.status}</div>
                </Link>
              ))}
            </Section>
          )}

          {data.results.characters.length > 0 && (
            <Section title={`🎭 דמויות (${data.results.characters.length})`}>
              {data.results.characters.map((c) => (
                <Link key={c.id} href={`/characters/${c.id}`} className="block bg-slate-900/40 border border-slate-800 rounded-lg p-3 hover:border-cyan-500/40">
                  <div className="font-semibold text-slate-100">{c.name}</div>
                  {c.roleType && <div className="text-xs text-cyan-400">{c.roleType}</div>}
                  {c.appearance && <div className="text-xs text-slate-400 mt-1 line-clamp-2">{c.appearance}</div>}
                </Link>
              ))}
            </Section>
          )}

          {data.results.refs.length > 0 && (
            <Section title={`📖 רפרנסים (${data.results.refs.length})`}>
              {data.results.refs.map((r) => (
                <Link key={r.id} href={`/learn/knowledge?tab=${r.kind}`} className="block bg-slate-900/40 border border-slate-800 rounded-lg p-3 hover:border-cyan-500/40">
                  <div className="text-xs text-cyan-400">{r.kind}</div>
                  <div className="font-semibold text-slate-100">{r.name}</div>
                  <div className="text-xs text-slate-400 mt-1">{r.shortDesc}</div>
                </Link>
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-cyan-300 mb-2">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}
