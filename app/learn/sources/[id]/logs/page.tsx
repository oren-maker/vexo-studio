import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/learn/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TABS = [
  { key: "all", label: "📋 הכל" },
  { key: "versions", label: "📜 גרסאות" },
  { key: "usage", label: "💰 קריאות API" },
  { key: "images", label: "🎨 תמונות" },
  { key: "videos", label: "🎬 וידאו" },
  { key: "lineage", label: "🔗 קשרים" },
];

export default async function SourceLogsPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string };
}) {
  const tab = searchParams.tab || "all";
  const source = await prisma.learnSource.findUnique({
    where: { id: params.id },
    include: { parentSource: { select: { id: true, title: true } }, children: { select: { id: true, title: true, addedBy: true, lineageNotes: true, createdAt: true } } },
  });
  if (!source) notFound();

  const [versions, usage, images, videos] = await Promise.all([
    prisma.promptVersion.findMany({ where: { sourceId: params.id }, orderBy: { version: "desc" } }),
    prisma.apiUsage.findMany({ where: { sourceId: params.id }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.generatedImage.findMany({ where: { sourceId: params.id }, orderBy: { createdAt: "desc" } }),
    prisma.generatedVideo.findMany({ where: { sourceId: params.id }, orderBy: { createdAt: "desc" } }),
  ]);

  const totalCost = usage.reduce((s, u) => s + u.usdCost, 0);

  // Build unified timeline for "all" tab
  type Entry = { time: Date; kind: string; icon: string; title: string; subtitle?: string; cost?: number; href?: string; meta?: string };
  const allEntries: Entry[] = [];
  for (const v of versions) {
    allEntries.push({
      time: v.createdAt,
      kind: "version",
      icon: "📜",
      title: `גרסה v${v.version} נשמרה`,
      subtitle: v.reason || v.triggeredBy || "",
      meta: v.triggeredBy || undefined,
    });
  }
  for (const u of usage) {
    allEntries.push({
      time: u.createdAt,
      kind: "usage",
      icon: u.errored ? "⚠️" : "💰",
      title: `${u.operation} · ${u.model.replace("-20251001", "")}`,
      subtitle: `${u.inputTokens}/${u.outputTokens} tokens${u.imagesOut ? ` · ${u.imagesOut} תמונות` : ""}${u.videoSeconds ? ` · ${u.videoSeconds}s וידאו` : ""}`,
      cost: u.errored ? undefined : u.usdCost,
    });
  }
  for (const i of images) {
    allEntries.push({
      time: i.createdAt,
      kind: "image",
      icon: "🎨",
      title: `תמונה נוצרה (${i.model})`,
      cost: i.usdCost,
      href: i.blobUrl,
    });
  }
  for (const v of videos) {
    allEntries.push({
      time: v.createdAt,
      kind: "video",
      icon: v.status === "complete" ? "🎬" : v.status === "failed" ? "❌" : "⏳",
      title: `וידאו ${v.status} · ${v.model.replace("veo-3.1-", "").replace("-preview", "")}`,
      subtitle: `${v.durationSec}s · ${v.aspectRatio}${v.error ? ` · ${v.error.slice(0, 80)}` : ""}`,
      cost: v.usdCost,
      href: v.blobUrl || undefined,
    });
  }
  allEntries.sort((a, b) => b.time.getTime() - a.time.getTime());

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-4 flex items-center gap-3">
        <Link href={`/learn/sources/${params.id}`} className="text-xs text-slate-400 hover:text-cyan-400">
          ← חזרה לפרומפט
        </Link>
      </div>

      <header className="mb-6">
        <div className="text-xs text-slate-500">פרומפט: <Link href={`/learn/sources/${params.id}`} className="text-cyan-400 hover:underline">{source.title || source.id.slice(-8)}</Link></div>
        <h1 className="text-3xl font-bold text-white mt-1">📂 לוגים — היסטוריה מלאה</h1>
        <p className="text-sm text-slate-400 mt-1">כל פעולה שנעשתה על הפרומפט הזה. כלום לא נמחק.</p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-5">
        <Stat value={versions.length} label="גרסאות" accent="amber" />
        <Stat value={usage.length} label="קריאות API" accent="cyan" />
        <Stat value={images.length} label="תמונות" accent="purple" />
        <Stat value={videos.length} label="סרטונים" accent="pink" />
        <Stat value={`$${totalCost.toFixed(4)}`} label="עלות" accent="emerald" />
      </div>

      <div className="flex flex-wrap gap-1 bg-slate-900/60 border border-slate-800 rounded-xl p-1 mb-5">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <Link
              key={t.key}
              href={`/learn/sources/${params.id}/logs?tab=${t.key}`}
              className={`px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                active ? "bg-cyan-500 text-slate-950" : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {tab === "all" && (
        <div className="space-y-2">
          {allEntries.length === 0 ? (
            <Empty />
          ) : (
            allEntries.map((e, i) => (
              <div key={i} className="bg-slate-900/60 border border-slate-800 rounded-lg p-3 flex items-start gap-3">
                <div className="text-2xl shrink-0 w-8 text-center">{e.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-sm text-white font-medium">{e.title}</span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {new Date(e.time).toLocaleString("he-IL", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  {e.subtitle && <div className="text-xs text-slate-400 mt-0.5">{e.subtitle}</div>}
                </div>
                {e.cost !== undefined && (
                  <span className="text-xs text-amber-300 font-mono shrink-0">${e.cost.toFixed(4)}</span>
                )}
                {e.href && (
                  <a href={e.href} target="_blank" className="text-xs text-cyan-400 hover:underline shrink-0">פתח</a>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {tab === "versions" && (
        <div className="space-y-2">
          {versions.length === 0 ? <Empty /> : versions.map((v) => {
            const d = v.diff as any;
            return (
              <details key={v.id} className="bg-slate-900/60 border border-amber-500/20 rounded-lg">
                <summary className="cursor-pointer p-3 hover:bg-slate-900/80 rounded-t-lg">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="bg-amber-500/20 text-amber-300 font-bold text-[11px] px-2 py-0.5 rounded">v{v.version}</span>
                    <span className="text-xs text-slate-400">{new Date(v.createdAt).toLocaleString("he-IL")}</span>
                    {v.triggeredBy && <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded">{v.triggeredBy}</span>}
                    {d && (d.linesAdded || d.linesRemoved) && (
                      <span className="text-[10px] font-mono">
                        {d.linesAdded ? <span className="text-emerald-400">+{d.linesAdded}</span> : null}
                        {d.linesRemoved ? <span className="text-red-400 mr-1">−{d.linesRemoved}</span> : null}
                      </span>
                    )}
                    {v.reason && <span className="text-xs text-slate-300 italic flex-1 line-clamp-1">💡 {v.reason}</span>}
                  </div>
                </summary>
                <div className="p-3 border-t border-slate-800">
                  <pre className="bg-slate-950/70 rounded p-3 text-[11px] text-slate-100 whitespace-pre-wrap font-mono leading-relaxed max-h-96 overflow-y-auto" dir="ltr">{v.prompt}</pre>
                </div>
              </details>
            );
          })}
        </div>
      )}

      {tab === "usage" && (
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
          {usage.length === 0 ? <Empty /> : (
            <table className="w-full text-xs">
              <thead className="bg-slate-800/60">
                <tr>
                  <th className="px-3 py-2 text-right text-[10px] uppercase text-slate-400">זמן</th>
                  <th className="px-3 py-2 text-right text-[10px] uppercase text-slate-400">פעולה</th>
                  <th className="px-3 py-2 text-right text-[10px] uppercase text-slate-400">מודל</th>
                  <th className="px-3 py-2 text-right text-[10px] uppercase text-slate-400">in/out</th>
                  <th className="px-3 py-2 text-left text-[10px] uppercase text-slate-400">עלות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {usage.map((u) => (
                  <tr key={u.id} className={u.errored ? "bg-red-500/5" : ""}>
                    <td className="px-3 py-2 text-slate-500 font-mono">{new Date(u.createdAt).toLocaleString("he-IL", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                    <td className="px-3 py-2 text-slate-300">{u.operation}</td>
                    <td className="px-3 py-2 text-slate-500 font-mono text-[10px]">{u.model.replace("-20251001", "")}</td>
                    <td className="px-3 py-2 text-slate-400">{u.inputTokens}/{u.outputTokens}</td>
                    <td className="px-3 py-2 text-amber-300 font-mono text-left">{u.errored ? "⚠" : `$${u.usdCost.toFixed(6)}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "images" && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {images.length === 0 ? <Empty /> : images.map((i) => (
            <a key={i.id} href={i.blobUrl} target="_blank" className="bg-slate-900/60 border border-slate-800 rounded-lg overflow-hidden hover:border-purple-500/50 transition">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={i.blobUrl} alt="" className="w-full aspect-video object-cover" />
              <div className="p-2 text-[10px] flex justify-between items-center">
                <span className="text-purple-300 font-mono">{i.model}</span>
                <span className="text-amber-300 font-bold">${i.usdCost.toFixed(4)}</span>
              </div>
              <div className="px-2 pb-2 text-[9px] text-slate-500 font-mono">{new Date(i.createdAt).toLocaleString("he-IL")}</div>
            </a>
          ))}
        </div>
      )}

      {tab === "videos" && (
        <div className="space-y-3">
          {videos.length === 0 ? <Empty /> : videos.map((v) => (
            <div key={v.id} className="bg-slate-900/60 border border-slate-800 rounded-lg overflow-hidden">
              {v.status === "complete" && v.blobUrl ? (
                /* eslint-disable-next-line jsx-a11y/media-has-caption */
                <video src={v.blobUrl} controls className="w-full max-h-64" />
              ) : (
                <div className="aspect-video bg-slate-950 flex items-center justify-center text-sm text-slate-400">
                  {v.status === "failed" ? `❌ ${v.error?.slice(0, 100)}` : `⏳ ${v.status}`}
                </div>
              )}
              <div className="p-3 flex items-center justify-between text-xs">
                <div className="text-slate-400">
                  <span className="text-pink-300 font-mono">{v.model.replace("veo-3.1-", "").replace("-preview", "")}</span>
                  <span className="text-slate-500 mx-2">·</span>
                  {v.durationSec}s · {v.aspectRatio} · {new Date(v.createdAt).toLocaleString("he-IL")}
                </div>
                <span className="text-amber-300 font-mono font-bold">${v.usdCost.toFixed(2)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "lineage" && (
        <div className="space-y-4">
          {source.parentSource ? (
            <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3">
              <div className="text-[10px] uppercase text-purple-400 mb-1">⬆️ פרומפט הורה</div>
              <Link href={`/learn/sources/${source.parentSource.id}`} className="text-white font-medium hover:underline">
                {source.parentSource.title || "(ללא כותרת)"}
              </Link>
              {source.lineageNotes && (
                <div className="mt-2 text-xs text-slate-300 italic">💡 {source.lineageNotes}</div>
              )}
            </div>
          ) : (
            <div className="text-xs text-slate-500">אין פרומפט הורה</div>
          )}

          {source.children.length > 0 ? (
            <div>
              <div className="text-[10px] uppercase text-emerald-400 mb-2">⬇️ פרומפטים שנולדו מכאן ({source.children.length})</div>
              <ul className="space-y-2">
                {source.children.map((c) => (
                  <li key={c.id} className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
                    <Link href={`/learn/sources/${c.id}`} className="text-white font-medium hover:underline">
                      {c.title || "(ללא כותרת)"}
                    </Link>
                    <div className="text-[10px] text-slate-500 mt-1">{c.addedBy} · {new Date(c.createdAt).toLocaleString("he-IL")}</div>
                    {c.lineageNotes && <div className="text-xs text-slate-300 italic mt-2">💡 {c.lineageNotes}</div>}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="text-xs text-slate-500">אף פרומפט לא נולד מהמקור הזה עדיין</div>
          )}
        </div>
      )}
    </div>
  );
}

function Empty() {
  return <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-8 text-center text-sm text-slate-500">אין רשומות בקטגוריה הזו</div>;
}

function Stat({ value, label, accent }: { value: any; label: string; accent: "amber" | "cyan" | "purple" | "pink" | "emerald" }) {
  const colors = {
    amber: "text-amber-300",
    cyan: "text-cyan-300",
    purple: "text-purple-300",
    pink: "text-pink-300",
    emerald: "text-emerald-300",
  };
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3 text-center">
      <div className={`text-xl font-bold ${colors[accent]}`}>{value}</div>
      <div className="text-[10px] text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}
