"use client";
import { learnFetch } from "@/lib/learn/fetch";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

const PAGE_SIZE = 30;

type Upgrade = {
  id: string; status: string; priority: number; instruction: string;
  claudeNotes: string | null; chatId: string | null; createdAt: string;
};

export default function BrainUpgradesPage() {
  const [upgrades, setUpgrades] = useState<Upgrade[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  type UTab = "active" | "archive";
  const rawTab = (searchParams?.get("tab") ?? "active") as UTab;
  const tab: UTab = (["active", "archive"] as const).includes(rawTab as UTab) ? rawTab : "active";
  const setTab = (t: UTab) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("tab", t);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const r = await learnFetch("/api/v1/learn/brain/upgrades").then((r) => r.json());
      const all: Upgrade[] = r.upgrades ?? r.items ?? [];
      setUpgrades(all);
      const c: Record<string, number> = {};
      all.forEach((u) => { c[u.status] = (c[u.status] || 0) + 1; });
      setCounts(c);
    } catch {}
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const pending = counts.pending || 0;
  const inProgress = counts["in-progress"] || 0;
  const done = counts.done || 0;
  const rejected = counts.rejected || 0;
  const total = upgrades.length;

  const activeStatuses = ["pending", "in-progress"];
  const archiveStatuses = ["done", "rejected"];
  const filtered = upgrades.filter((u) =>
    tab === "active" ? activeStatuses.includes(u.status) : archiveStatuses.includes(u.status)
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [tab]);

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/learn/brain" className="text-xs text-slate-400 hover:text-cyan-400">← חזרה למוח</Link>
          <h1 className="text-3xl font-bold text-white mt-1">⬆️ שדרוגים</h1>
          <p className="text-sm text-slate-400 mt-1">הוראות שדרוג שנשלחו למוח. כל הוראה נבדקת ומבוצעת.</p>
        </div>
        <Link href="/learn/brain/chat" className="text-xs bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 px-3 py-1.5 rounded font-semibold">
          🗣 שיחה עם המוח
        </Link>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatBox value={total} label="סה״כ" color="text-slate-200" />
        <StatBox value={pending} label="⏳ ממתין" color="text-amber-300" />
        <StatBox value={inProgress} label="🔄 בעבודה" color="text-cyan-300" />
        <StatBox value={done} label="✅ הושלם" color="text-emerald-300" />
        <StatBox value={rejected} label="✗ נדחה" color="text-red-300" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-800">
        <button onClick={() => setTab("active")} className={`px-4 py-2 text-sm font-semibold border-b-2 ${tab === "active" ? "text-cyan-300 border-cyan-400" : "text-slate-500 border-transparent"}`}>
          פעילים ({pending + inProgress})
        </button>
        <button onClick={() => setTab("archive")} className={`px-4 py-2 text-sm font-semibold border-b-2 ${tab === "archive" ? "text-cyan-300 border-cyan-400" : "text-slate-500 border-transparent"}`}>
          ארכיון ({done + rejected})
        </button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-slate-500">טוען…</div>
      ) : paged.length === 0 ? (
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-10 text-center text-sm text-slate-400">
          {tab === "active"
            ? <>אין שדרוגים פעילים. דבר עם המוח ב-<Link href="/learn/brain/chat" className="text-cyan-400 underline">שיחה</Link> ותן הוראות.</>
            : "הארכיון ריק."}
        </div>
      ) : (
        <div className="space-y-2">
          {paged.map((u) => (
            <div key={u.id} className={`rounded-lg p-4 border ${
              u.status === "pending" ? "bg-amber-500/5 border-amber-500/30" :
              u.status === "in-progress" ? "bg-cyan-500/5 border-cyan-500/30" :
              u.status === "done" ? "bg-emerald-500/5 border-emerald-500/30" :
              "bg-slate-900/60 border-slate-800 opacity-60"
            }`}>
              <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                <span className="text-[10px] uppercase font-semibold tracking-wider">
                  {u.status === "pending" && "⏳ ממתין"}
                  {u.status === "in-progress" && "🔄 בעבודה"}
                  {u.status === "done" && "✅ הושלם"}
                  {u.status === "rejected" && "✗ נדחה"}
                  <span className="text-slate-600 ms-2">עדיפות {u.priority}</span>
                </span>
                <span className="text-[10px] text-slate-500 font-mono">{new Date(u.createdAt).toLocaleString("he-IL")}</span>
              </div>
              <div className="text-sm text-slate-100 whitespace-pre-wrap">{u.instruction}</div>
              {u.claudeNotes && (
                <div className="mt-2 text-xs text-slate-400 border-t border-slate-800 pt-2">
                  <span className="text-emerald-400 font-semibold">📝 ביצוע:</span> {u.claudeNotes}
                </div>
              )}
              {u.chatId && (
                <Link href={`/learn/brain/chat?id=${u.chatId}`} className="text-[10px] text-cyan-400 hover:underline mt-2 inline-block">
                  מקור: שיחה ←
                </Link>
              )}
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-3">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1 rounded bg-slate-800 text-sm disabled:opacity-30">הקודם</button>
          <span className="text-xs text-slate-400">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="px-3 py-1 rounded bg-slate-800 text-sm disabled:opacity-30">הבא</button>
        </div>
      )}
    </div>
  );
}

function StatBox({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-center">
      <div className={`text-2xl font-black ${color}`}>{value}</div>
      <div className="text-[11px] text-slate-400 mt-0.5">{label}</div>
    </div>
  );
}
