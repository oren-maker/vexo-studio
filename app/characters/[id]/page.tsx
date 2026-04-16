"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { Card } from "@/components/page-shell";
import { useLang } from "@/lib/i18n";

type Media = { id: string; fileUrl: string; createdAt: string; metadata: { angle?: string } | null };
type Character = {
  id: string; name: string; roleType: string | null; characterType: string | null;
  appearance: string | null; personality: string | null; wardrobeRules: string | null;
  continuityLock: boolean; project: { id: string; name: string };
  media: Media[];
};
type Participation = {
  character: { id: string; name: string };
  seasons: Array<{
    id: string; seasonNumber: number; title: string | null;
    episodes: Array<{
      id: string; episodeNumber: number; title: string; synopsis: string | null; status: string;
      scenesWithChar: Array<{ id: string; sceneNumber: number; title: string | null; summary: string | null }>;
      totalScenes: number;
    }>;
  }>;
  totalEpisodes: number;
  totalScenes: number;
};
type LogRow = { id: string; at: string; kind: string; title: string; detail: string | null; actor: string | null };

export default function CharacterDetailPage() {
  const { id } = useParams<{ id: string }>();
  const lang = useLang();
  const he = lang === "he";
  const [character, setCharacter] = useState<Character | null>(null);
  const [part, setPart] = useState<Participation | null>(null);
  const [log, setLog] = useState<LogRow[]>([]);
  const [tab, setTab] = useState<"gallery" | "log" | "participation">("gallery");
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [composite, setComposite] = useState<{ fileUrl: string; createdAt: string } | null>(null);
  const [buildingComposite, setBuildingComposite] = useState(false);

  useEffect(() => {
    api<Character>(`/api/v1/characters/${id}`).then(setCharacter).catch(() => setCharacter(null));
    api<{ composite: { fileUrl: string; createdAt: string } | null }>(`/api/v1/characters/${id}/composite`)
      .then((r) => setComposite(r.composite))
      .catch(() => setComposite(null));
  }, [id]);

  async function buildComposite() {
    if (buildingComposite) return;
    setBuildingComposite(true);
    try {
      const r = await api<{ compositeUrl: string }>(`/api/v1/characters/${id}/composite`, { method: "POST", body: {} });
      setComposite({ fileUrl: r.compositeUrl, createdAt: new Date().toISOString() });
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBuildingComposite(false);
    }
  }

  useEffect(() => {
    if (tab === "participation" && !part) {
      api<Participation>(`/api/v1/characters/${id}/participation`).then(setPart).catch(() => setPart(null));
    }
    if (tab === "log" && log.length === 0) {
      api<LogRow[]>(`/api/v1/characters/${id}/log`).then(setLog).catch(() => setLog([]));
    }
  }, [tab, id, part, log.length]);

  if (!character) return <div className="text-text-muted">{he ? "טוען…" : "Loading…"}</div>;

  return (
    <div className="space-y-6">
      <Link href={`/projects/${character.project.id}/characters`} className="text-sm text-accent hover:underline">{he ? "→ חזרה לרשימת הדמויות" : "← All characters"}</Link>

      <div className="flex items-start gap-4 flex-wrap">
        {composite ? (
          <img src={composite.fileUrl} alt={`${character.name} composite`} className="h-32 w-auto max-w-[300px] rounded-xl object-cover bg-bg-main" title={he ? "תמונת רפרנס מאוחדת" : "Composite reference"} />
        ) : character.media[0] ? (
          <img src={character.media[0].fileUrl} alt={character.name} className="w-32 h-32 rounded-xl object-cover bg-bg-main" />
        ) : (
          <div className="w-32 h-32 rounded-xl bg-bg-main flex items-center justify-center text-5xl">🎭</div>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold">{character.name}</h1>
          <div className="flex gap-2 flex-wrap mt-1">
            {character.roleType && <span className="bg-bg-main rounded-full px-2 py-0.5 text-xs">{character.roleType}</span>}
            {character.characterType && <span className="bg-bg-main rounded-full px-2 py-0.5 text-xs">{character.characterType}</span>}
            {character.continuityLock && <span className="bg-accent/15 text-accent rounded-full px-2 py-0.5 text-xs font-semibold">🔒 {he ? "נעול לעקביות" : "continuity locked"}</span>}
          </div>
          {character.appearance && <p className="text-sm text-text-secondary mt-3">{character.appearance}</p>}
        </div>
      </div>

      <div className="flex gap-1 border-b border-bg-main">
        {([
          { id: "gallery", label: he ? "גלריה" : "Gallery", count: character.media.length },
          { id: "log", label: he ? "לוג" : "Log", count: null as number | null },
          { id: "participation", label: he ? "השתתפות" : "Participation", count: part?.totalEpisodes ?? null },
        ] as const).map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${tab === t.id ? "border-accent text-accent" : "border-transparent text-text-muted hover:text-text-secondary"}`}>
            {t.label}{t.count != null && <span className="text-text-muted"> ({t.count})</span>}
          </button>
        ))}
      </div>

      {tab === "gallery" && (
        <Card
          title={he ? `🖼 גלריית ${character.name}` : `🖼 ${character.name}'s gallery`}
          subtitle={`${character.media.length} ${he ? "תמונות" : "images"}`}
        >
          {character.media.length === 0 ? (
            <div className="text-center py-10 text-text-muted">{he ? "אין עדיין תמונות — הפעל את 'צור גלריה' מעמוד הדמויות" : "No images yet — generate a gallery from the characters page"}</div>
          ) : (
            <>
              {/* Primary view = composite character sheet (the same one Sora/VEO/fal
                  receive as a single reference). Build/rebuild on demand. */}
              <div className="mb-5 bg-bg-main rounded-xl p-3">
                <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
                  <div>
                    <div className="text-xs font-semibold text-accent uppercase tracking-wider">
                      {he ? "🎨 תמונת רפרנס מאוחדת (לוידאו)" : "🎨 Composite reference sheet (for video)"}
                    </div>
                    <div className="text-[11px] text-text-muted mt-0.5">
                      {he
                        ? "התמונה הזו נשלחת לסורה / VEO / fal כ-reference יחיד במקום 4 תמונות נפרדות. שומר על עקביות הזהות."
                        : "Sent to Sora / VEO / fal as a single reference instead of 4 separate portraits. Keeps identity locked."}
                    </div>
                  </div>
                  <button
                    onClick={buildComposite}
                    disabled={buildingComposite}
                    className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold disabled:opacity-50"
                  >
                    {buildingComposite ? (he ? "🔄 בונה…" : "🔄 Building…") : composite ? (he ? "🔁 בנה מחדש" : "🔁 Rebuild") : (he ? "🎨 בנה תמונה מאוחדת" : "🎨 Build composite")}
                  </button>
                </div>
                {composite ? (
                  <a href={composite.fileUrl} target="_blank" rel="noreferrer" className="block">
                    <img
                      src={composite.fileUrl}
                      alt={`${character.name} composite`}
                      className="w-full max-w-2xl rounded-lg border border-bg-main mx-auto"
                    />
                    <div className="text-[10px] text-text-muted text-center mt-1">
                      {he ? "עודכן ב-" : "updated "} {new Date(composite.createdAt).toLocaleString(he ? "he-IL" : "en")}
                    </div>
                  </a>
                ) : (
                  <div className="text-center py-6 text-text-muted text-xs">
                    {he ? "אין עדיין תמונה מאוחדת. לחץ \"בנה\" כדי לייצר אחת מ-4 הזוויות הראשונות." : "No composite yet. Click Build to generate from the first 4 angles."}
                  </div>
                )}
              </div>

              {/* Individual angles below — kept as source material */}
              <details className="mb-2">
                <summary className="cursor-pointer text-xs text-text-muted font-semibold mb-2">
                  {he ? `📐 הצג את ${character.media.length} הזוויות הבודדות (חומר מקור)` : `📐 Show ${character.media.length} individual angles (source)`}
                </summary>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                  {character.media.map((m, i) => (
                    <button key={m.id} onClick={() => setLightbox(i)} className="relative aspect-square rounded-lg overflow-hidden bg-bg-main group">
                      <img src={m.fileUrl} alt="" className="w-full h-full object-cover" />
                      {m.metadata?.angle && <div className="absolute bottom-1 left-1 right-1 bg-black/60 text-white text-[10px] rounded px-1.5 py-0.5">{m.metadata.angle}</div>}
                    </button>
                  ))}
                </div>
              </details>
            </>
          )}
        </Card>
      )}

      {tab === "log" && (
        <Card title={he ? "📜 היסטוריית הדמות" : "📜 Change log"} subtitle={`${log.length} ${he ? "אירועים" : "events"}`}>
          {log.length === 0 ? (
            <div className="text-center py-10 text-text-muted">{he ? "אין עדיין שינויים מתועדים" : "No changes yet"}</div>
          ) : (
            <ul className="space-y-2 max-h-[600px] overflow-auto">
              {log.map((r) => (
                <li key={r.id} className="bg-bg-main rounded-lg p-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">{r.title}</div>
                    {r.detail && <div className="text-xs text-text-muted mt-1 truncate">{r.detail.startsWith("http") ? <a href={r.detail} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">{r.detail.slice(0, 80)}…</a> : r.detail}</div>}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-[10px] text-text-muted">{new Date(r.at).toLocaleString(he ? "he-IL" : undefined)}</span>
                    {r.actor && <span className="text-[10px] text-text-secondary">{r.actor}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === "participation" && (
        <Card
          title={he ? "🎬 היכן הדמות משתתפת" : "🎬 Where the character appears"}
          subtitle={part ? `${part.totalEpisodes} ${he ? "פרקים" : "episodes"} · ${part.totalScenes} ${he ? "סצנות" : "scenes"}` : (he ? "טוען…" : "Loading…")}
        >
          {!part ? (
            <div className="text-center py-6 text-text-muted">{he ? "טוען…" : "Loading…"}</div>
          ) : part.seasons.length === 0 ? (
            <div className="text-center py-10 text-text-muted">{he ? "הדמות עדיין לא שובצה לפרק" : "Character isn't cast in any episode yet"}</div>
          ) : (
            <div className="space-y-4">
              {part.seasons.map((s) => (
                <div key={s.id} className="border border-bg-main rounded-lg p-4">
                  <Link href={`/seasons/${s.id}`} className="flex items-center justify-between mb-3">
                    <div>
                      <span className="font-bold">{he ? `עונה ${s.seasonNumber}` : `Season ${s.seasonNumber}`}</span>
                      {s.title && <span className="text-text-muted text-sm ms-2">· {s.title}</span>}
                    </div>
                    <span className="text-xs text-accent">{s.episodes.length} {he ? "פרקים" : "episodes"} →</span>
                  </Link>
                  <ul className="space-y-2">
                    {s.episodes.map((ep) => (
                      <li key={ep.id}>
                        <Link href={`/episodes/${ep.id}`} className="flex items-center justify-between bg-bg-main rounded-lg p-3 hover:bg-bg-main/60">
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm">
                              <span data-no-translate className="text-text-muted font-mono text-xs me-2">EP{String(ep.episodeNumber).padStart(2, "0")}</span>
                              {ep.title}
                            </div>
                            {ep.synopsis && <div className="text-xs text-text-muted mt-1 truncate">{ep.synopsis}</div>}
                            {ep.scenesWithChar.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {ep.scenesWithChar.map((sc) => (
                                  <Link key={sc.id} href={`/scenes/${sc.id}`} onClick={(e) => e.stopPropagation()} className="text-[11px] bg-accent/10 text-accent rounded-full px-2 py-0.5 hover:bg-accent hover:text-white">
                                    SC{String(sc.sceneNumber).padStart(2, "0")}{sc.title ? ` · ${sc.title.slice(0, 30)}` : ""}
                                  </Link>
                                ))}
                              </div>
                            )}
                          </div>
                          <span className="text-xs text-accent shrink-0 ms-3">→</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {lightbox != null && character.media[lightbox] && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <img src={character.media[lightbox].fileUrl} alt="" className="max-w-full max-h-full object-contain" />
        </div>
      )}
    </div>
  );
}
