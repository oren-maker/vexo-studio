"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Card } from "@/components/page-shell";

type Project = {
  id: string; name: string; contentType: string; status: string;
  description: string | null; language: string; genreTag: string | null;
  thumbnailUrl: string | null; createdAt: string;
  _count: { series: number; courses: number };
};

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "bg-bg-main text-text-secondary",
  ACTIVE: "bg-status-okBg text-status-okText",
  PAUSED: "bg-status-warningBg text-status-warnText",
  ARCHIVED: "bg-status-errBg text-status-errText",
};

export default function ProjectsPage() {
  const [items, setItems] = useState<Project[]>([]);
  const [filter, setFilter] = useState<"ALL" | "SERIES" | "COURSE" | "KIDS_CONTENT">("ALL");
  useEffect(() => { api<Project[]>("/api/v1/projects").then(setItems).catch(() => {}); }, []);
  const visible = filter === "ALL" ? items : items.filter((i) => i.contentType === filter);

  return (
    <Card title="All projects" subtitle="Series, courses and kids content">
      <div className="flex justify-between items-center mb-4">
        <div className="flex gap-1 text-sm">
          {(["ALL", "SERIES", "COURSE", "KIDS_CONTENT"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1 rounded-lg ${filter === f ? "bg-accent text-white" : "bg-bg-main text-text-secondary"}`}>{f}</button>
          ))}
        </div>
        <Link href="/projects/new" className="px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-semibold">+ New project</Link>
      </div>
      {visible.length === 0 ? (
        <div className="text-center py-12 text-text-muted">
          <div className="text-3xl mb-2">🎬</div>
          <div>No projects in this view.</div>
        </div>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map((p) => (
            <li key={p.id}>
              <Link href={`/projects/${p.id}`} className="block bg-bg-main rounded-card border border-bg-main p-4 hover:border-accent transition">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-semibold">{p.name}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${STATUS_COLOR[p.status] ?? "bg-bg-card"}`}>{p.status}</span>
                </div>
                <div className="text-xs text-text-muted mb-3">{p.contentType.replace("_", " ")} · {p.language.toUpperCase()}{p.genreTag && ` · ${p.genreTag}`}</div>
                <div className="text-sm text-text-secondary line-clamp-2 min-h-[2.5em]">{p.description ?? "No description"}</div>
                <div className="flex gap-3 text-[11px] text-text-muted mt-3 pt-3 border-t border-bg-card">
                  <span>{p._count.series} series</span>
                  <span>{p._count.courses} courses</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
