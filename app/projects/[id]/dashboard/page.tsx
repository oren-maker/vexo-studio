"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";

type Payload = {
  project: { id: string; name: string; plannedBudget: number | null; status: string; genreTag: string | null; contentType: string };
  metrics: { seriesCount: number; totalSeasons: number; totalEpisodes: number; totalScenes: number; charCount: number; spend: number; budget: number; budgetUsagePct: number | null; costEntryCount: number };
  sceneStatuses: { status: string; count: number }[];
  episodeStatuses: { status: string; count: number }[];
  seriesList: { id: string; title: string; seasonCount: number; episodeCount: number }[];
  recentCosts: { createdAt: string; totalCost: number; description: string | null; costCategory: string }[];
  lastActivity: { id: string; sceneNumber: number; title: string | null; status: string; updatedAt: string; episode: { seasonId: string; episodeNumber: number | null; title: string | null } | null } | null;
};

const SCENE_STATUS_COLOR: Record<string, string> = {
  DRAFT: "bg-slate-700/40 text-slate-300",
  PLANNING: "bg-slate-700/40 text-slate-300",
  STORYBOARD_GENERATING: "bg-cyan-500/20 text-cyan-300",
  STORYBOARD_REVIEW: "bg-amber-500/20 text-amber-300",
  STORYBOARD_APPROVED: "bg-emerald-500/10 text-emerald-400",
  VIDEO_GENERATING: "bg-cyan-500/20 text-cyan-300",
  VIDEO_REVIEW: "bg-amber-500/20 text-amber-300",
  APPROVED: "bg-emerald-500/20 text-emerald-300",
  LOCKED: "bg-emerald-500/30 text-emerald-200",
};

export default function ProjectDashboardPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api<Payload>(`/api/v1/projects/${id}/overview`).then(setData).catch((e) => setErr((e as Error).message));
  }, [id]);

  if (err) return <div className="max-w-5xl mx-auto p-6 text-red-400">{err}</div>;
  if (!data) return <div className="max-w-5xl mx-auto p-6 text-text-muted">טוען…</div>;

  const m = data.metrics;
  const budgetColor = m.budgetUsagePct === null ? "text-text-muted" : m.budgetUsagePct >= 100 ? "text-rose-400" : m.budgetUsagePct >= 80 ? "text-amber-300" : "text-emerald-400";

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <header className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">{data.project.name}</h1>
          <div className="text-sm text-text-muted mt-1">
            <span>{data.project.status}</span>
            {data.project.contentType && <span className="ms-2">· {data.project.contentType}</span>}
            {data.project.genreTag && <span className="ms-2">· {data.project.genreTag}</span>}
          </div>
        </div>
        <Link href={`/projects/${id}`} className="text-sm text-accent hover:underline">חזור לפרויקט ←</Link>
      </header>

      {/* Hero metrics */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Tile label="סדרות" value={m.seriesCount} />
        <Tile label="עונות" value={m.totalSeasons} />
        <Tile label="פרקים" value={m.totalEpisodes} />
        <Tile label="סצנות" value={m.totalScenes} />
        <Tile label="דמויות" value={m.charCount} />
        <Tile label="עלויות" value={`$${m.spend.toFixed(2)}`} />
      </div>

      {/* Budget bar */}
      {m.budget > 0 && (
        <div className="bg-bg-card rounded-card border border-bg-main p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold">תקציב</span>
            <span className={`text-sm num ${budgetColor}`}>${m.spend.toFixed(2)} / ${m.budget.toFixed(2)} · {m.budgetUsagePct ?? 0}%</span>
          </div>
          <div className="h-2 bg-bg-main rounded-full overflow-hidden">
            <div className={`h-full ${m.budgetUsagePct! >= 100 ? "bg-rose-500" : m.budgetUsagePct! >= 80 ? "bg-amber-500" : "bg-emerald-500"} transition-all`} style={{ width: `${Math.min(100, m.budgetUsagePct ?? 0)}%` }} />
          </div>
        </div>
      )}

      {/* Scene status breakdown */}
      {data.sceneStatuses.length > 0 && (
        <section className="bg-bg-card rounded-card border border-bg-main p-4">
          <h2 className="text-sm font-semibold mb-3">סטטוס סצנות</h2>
          <div className="flex flex-wrap gap-2">
            {data.sceneStatuses.map((s) => (
              <div key={s.status} className={`px-3 py-1.5 rounded-lg text-sm ${SCENE_STATUS_COLOR[s.status] ?? "bg-slate-700/40 text-slate-300"}`}>
                <span className="font-mono text-[11px]">{s.status}</span>
                <span className="mx-1">·</span>
                <span className="font-bold num">{s.count}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Series list */}
      {data.seriesList.length > 0 && (
        <section className="bg-bg-card rounded-card border border-bg-main p-4">
          <h2 className="text-sm font-semibold mb-3">סדרות</h2>
          <ul className="space-y-2">
            {data.seriesList.map((sr) => (
              <li key={sr.id}>
                <Link href={`/series/${sr.id}`} className="flex items-center justify-between bg-bg-main rounded-lg p-3 hover:bg-bg-main/60">
                  <span className="font-semibold">{sr.title}</span>
                  <span className="text-xs text-text-muted">{sr.seasonCount} עונות · {sr.episodeCount} פרקים</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Recent costs */}
      {data.recentCosts.length > 0 && (
        <section className="bg-bg-card rounded-card border border-bg-main p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">עלויות אחרונות ({data.metrics.costEntryCount} סה"כ)</h2>
            <Link href="/learn/costs" className="text-xs text-accent hover:underline">פירוט מלא ←</Link>
          </div>
          <ul className="space-y-1.5 text-xs">
            {data.recentCosts.map((c, i) => (
              <li key={i} className="flex items-center justify-between bg-bg-main rounded p-2">
                <span className="flex-1 truncate text-text-secondary">{c.description ?? c.costCategory}</span>
                <span className="text-text-muted mx-2 text-[10px]">{new Date(c.createdAt).toLocaleDateString("he-IL")}</span>
                <span className="num font-bold text-accent">${c.totalCost.toFixed(3)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Last activity */}
      {data.lastActivity && (
        <section className="bg-bg-card rounded-card border border-bg-main p-4">
          <h2 className="text-sm font-semibold mb-2">פעילות אחרונה</h2>
          <Link href={`/scenes/${data.lastActivity.id}`} className="text-sm text-accent hover:underline block">
            SC{String(data.lastActivity.sceneNumber).padStart(2, "0")} · {data.lastActivity.title ?? "ללא כותרת"}
          </Link>
          <div className="text-xs text-text-muted mt-1">
            {data.lastActivity.status} · {new Date(data.lastActivity.updatedAt).toLocaleString("he-IL")}
          </div>
        </section>
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-bg-card rounded-card border border-bg-main p-3">
      <div className="text-[10px] uppercase text-text-muted">{label}</div>
      <div className="text-2xl font-bold num text-text-primary">{value}</div>
    </div>
  );
}
