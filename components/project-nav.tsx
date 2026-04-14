"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useLang } from "@/lib/i18n";

type Episode = { id: string; episodeNumber: number; title: string };
type Season  = { id: string; seasonNumber: number; title: string | null; episodes: Episode[] };
type Project = { id: string; name: string };
type Payload = { project: Project; seasons: Season[] };

export function ProjectNav({ projectId }: { projectId: string | null | undefined }) {
  const lang = useLang();
  const he = lang === "he";
  const pathname = usePathname();
  const [data, setData] = useState<Payload | null>(null);
  const [openSeasons, setOpenSeasons] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    api<Payload>(`/api/v1/projects/${projectId}/seasons`).then((d) => {
      if (cancelled) return;
      setData(d);
      // Expand the season that contains the current page by default
      const next: Record<string, boolean> = {};
      for (const s of d.seasons) {
        if (pathname.includes(`/seasons/${s.id}`) || s.episodes.some((e) => pathname.includes(`/episodes/${e.id}`))) next[s.id] = true;
      }
      setOpenSeasons((o) => ({ ...next, ...o }));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [projectId, pathname]);

  if (!projectId) return null;

  const GENERAL = [
    { href: `/projects/${projectId}/characters`,   label: he ? "דמויות" : "Characters",   icon: "🎭" },
    { href: `/projects/${projectId}/finance`,      label: he ? "כספים" : "Finance",       icon: "💰" },
    { href: `/projects/${projectId}/distribution`, label: he ? "הפצה" : "Distribution",   icon: "📡" },
    { href: `/projects/${projectId}/analytics`,    label: he ? "אנליטיקס" : "Analytics",  icon: "📊" },
    { href: `/projects/${projectId}/calendar`,     label: he ? "לוח שנה" : "Calendar",     icon: "📅" },
    { href: `/projects/${projectId}/ai-director`,  label: he ? "במאי AI" : "AI Director", icon: "🤖" },
    { href: `/admin/logs`,                         label: he ? "לוג" : "Logs",             icon: "📝" },
  ];

  return (
    <div className="py-3">
      {/* Project header */}
      <Link href={`/projects/${projectId}`} className="block px-5 py-2 border-b border-white/5 hover:bg-white/5">
        <div className="text-[10px] uppercase tracking-widest text-sidebar-muted">{he ? "סדרה" : "Series"}</div>
        <div className="font-bold text-white text-sm truncate">{data?.project.name ?? "…"}</div>
      </Link>

      {/* Seasons */}
      <nav className="py-2">
        <div className="px-5 py-1 text-[10px] uppercase tracking-widest text-sidebar-muted">{he ? "עונות" : "Seasons"}</div>
        {data?.seasons.length === 0 && (
          <div className="px-5 py-1 text-xs text-sidebar-text/60">{he ? "אין עונות" : "No seasons"}</div>
        )}
        {data?.seasons.map((s) => {
          const open = openSeasons[s.id] ?? false;
          const active = pathname === `/seasons/${s.id}`;
          return (
            <div key={s.id}>
              <div className={`flex items-center gap-1 px-2 ${active ? "bg-white/10" : ""}`}>
                <button
                  onClick={() => setOpenSeasons((o) => ({ ...o, [s.id]: !o[s.id] }))}
                  className="w-6 h-6 text-xs text-sidebar-text/60 hover:text-white"
                  aria-label="toggle"
                >
                  {open ? "▾" : "▸"}
                </button>
                <Link href={`/seasons/${s.id}`} className={`flex-1 py-1.5 text-sm truncate ${active ? "text-white font-semibold" : "text-sidebar-text hover:text-white"}`}>
                  {he ? `עונה ${s.seasonNumber}` : `Season ${s.seasonNumber}`}{s.title && ` · ${s.title}`}
                </Link>
              </div>
              {open && (
                <div className="ps-10 pe-3 pb-1 space-y-0.5">
                  {s.episodes.length === 0 && <div className="text-[11px] text-sidebar-text/50 py-1">{he ? "אין פרקים" : "No episodes"}</div>}
                  {s.episodes.map((e) => {
                    const activeEp = pathname === `/episodes/${e.id}` || pathname.startsWith(`/episodes/${e.id}/`);
                    return (
                      <Link
                        key={e.id}
                        href={`/episodes/${e.id}`}
                        className={`block py-1 text-[12px] truncate ${activeEp ? "text-white font-semibold bg-white/5 rounded px-2" : "text-sidebar-text/80 hover:text-white"}`}
                        title={e.title}
                      >
                        <span className="font-mono text-[10px] text-sidebar-text/60 me-1">EP{String(e.episodeNumber).padStart(2, "0")}</span>
                        {e.title}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* General section */}
      <div className="pt-3 border-t border-white/5">
        <div className="px-5 py-1 text-[10px] uppercase tracking-widest text-sidebar-muted">{he ? "כללי" : "General"}</div>
        {GENERAL.map((it) => {
          const active = pathname === it.href || pathname.startsWith(it.href + "/");
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`flex items-center gap-2 px-5 py-1.5 text-sm border-s-[3px] ${active ? "bg-white/10 text-white border-accent-cyan" : "border-transparent text-sidebar-text hover:text-white hover:bg-white/5"}`}
            >
              <span>{it.icon}</span>
              <span>{it.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
