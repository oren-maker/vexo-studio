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
type EpScene = { id: string; sceneNumber: number; title: string | null };

export function ProjectNav({ projectId, activeEpisodeId, activeSceneId }: {
  projectId: string | null | undefined;
  activeEpisodeId?: string | null;
  activeSceneId?: string | null;
}) {
  const lang = useLang();
  const he = lang === "he";
  const pathname = usePathname();
  const [data, setData] = useState<Payload | null>(null);
  const [openSeasons, setOpenSeasons] = useState<Record<string, boolean>>({});
  const [openEpisodes, setOpenEpisodes] = useState<Record<string, boolean>>({});
  const [scenesByEp, setScenesByEp] = useState<Record<string, EpScene[]>>({});

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    api<Payload>(`/api/v1/projects/${projectId}/seasons`).then((d) => {
      if (cancelled) return;
      setData(d);
      // Expand the season + episode that contain the current page by default
      const nextS: Record<string, boolean> = {};
      const nextE: Record<string, boolean> = {};
      for (const s of d.seasons) {
        if (pathname.includes(`/seasons/${s.id}`) || s.episodes.some((e) => pathname.includes(`/episodes/${e.id}`)) || s.episodes.some((e) => activeEpisodeId === e.id)) {
          nextS[s.id] = true;
        }
        for (const e of s.episodes) {
          if (e.id === activeEpisodeId || pathname.includes(`/episodes/${e.id}`)) nextE[e.id] = true;
        }
      }
      setOpenSeasons((o) => ({ ...nextS, ...o }));
      setOpenEpisodes((o) => ({ ...nextE, ...o }));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [projectId, pathname, activeEpisodeId]);

  // Fetch scenes for any expanded episode + always pre-fetch for the active episode
  useEffect(() => {
    const candidates = new Set<string>(Object.keys(openEpisodes).filter((k) => openEpisodes[k]));
    if (activeEpisodeId) candidates.add(activeEpisodeId);
    const epIds = [...candidates].filter((k) => !scenesByEp[k]);
    if (epIds.length === 0) return;
    let cancelled = false;
    Promise.all(epIds.map((epId) =>
      api<EpScene[]>(`/api/v1/episodes/${epId}/scenes`).then((s) => [epId, s] as const).catch(() => [epId, [] as EpScene[]] as const),
    )).then((pairs) => {
      if (cancelled) return;
      setScenesByEp((m) => ({ ...m, ...Object.fromEntries(pairs) }));
    });
    return () => { cancelled = true; };
  }, [openEpisodes, activeEpisodeId]);

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
      <Link href={`/projects/${projectId}/dashboard`} className="block px-5 py-1.5 text-xs text-sidebar-text/80 hover:text-white hover:bg-white/5 border-b border-white/5">
        📊 {he ? "דשבורד פרויקט" : "Project dashboard"}
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
                <div className="ps-8 pe-3 pb-1 space-y-0.5">
                  {s.episodes.length === 0 && <div className="text-[11px] text-sidebar-text/50 py-1">{he ? "אין פרקים" : "No episodes"}</div>}
                  {s.episodes.map((e) => {
                    const activeEp = pathname === `/episodes/${e.id}` || pathname.startsWith(`/episodes/${e.id}/`) || activeEpisodeId === e.id;
                    // Auto-open the episode if it's the one the user is currently viewing,
                    // even before the openEpisodes effect has run.
                    const epOpen = openEpisodes[e.id] ?? (activeEpisodeId === e.id || pathname === `/episodes/${e.id}`);
                    const scenes = scenesByEp[e.id];
                    return (
                      <div key={e.id}>
                        <div className={`flex items-center gap-1 ${activeEp ? "bg-white/5 rounded" : ""}`}>
                          <button onClick={() => setOpenEpisodes((o) => ({ ...o, [e.id]: !o[e.id] }))} className="w-5 h-5 text-[10px] text-sidebar-text/60 hover:text-white">
                            {epOpen ? "▾" : "▸"}
                          </button>
                          <Link
                            href={`/episodes/${e.id}`}
                            className={`flex-1 py-1 text-[12px] truncate ${activeEp ? "text-white font-semibold" : "text-sidebar-text/80 hover:text-white"}`}
                            title={e.title}
                          >
                            <span data-no-translate className="font-mono text-[10px] text-sidebar-text/60 me-1">EP{String(e.episodeNumber).padStart(2, "0")}</span>
                            {e.title}
                          </Link>
                        </div>
                        {epOpen && (
                          <div className="ps-7 pe-2 py-0.5 space-y-0.5">
                            {!scenes && <div className="text-[10px] text-sidebar-text/40 py-0.5">…</div>}
                            {scenes && scenes.length === 0 && <div className="text-[10px] text-sidebar-text/40 py-0.5">{he ? "אין סצנות" : "No scenes"}</div>}
                            {scenes && scenes.map((sc) => {
                              const activeSc = pathname === `/scenes/${sc.id}` || activeSceneId === sc.id;
                              return (
                                <Link
                                  key={sc.id}
                                  href={`/scenes/${sc.id}`}
                                  className={`block py-0.5 text-[11px] truncate ${activeSc ? "text-white font-semibold bg-white/5 rounded px-1.5" : "text-sidebar-text/70 hover:text-white"}`}
                                  title={sc.title ?? ""}
                                >
                                  <span data-no-translate className="font-mono text-[9px] text-sidebar-text/50 me-1">SC{String(sc.sceneNumber).padStart(2, "0")}</span>
                                  {sc.title ?? (he ? "ללא כותרת" : "Untitled")}
                                </Link>
                              );
                            })}
                          </div>
                        )}
                      </div>
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
