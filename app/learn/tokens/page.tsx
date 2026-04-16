import Link from "next/link";
import { prisma } from "@/lib/learn/db";
import { PRICING } from "@/lib/learn/usage-tracker";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const OP_LABELS: Record<string, string> = {
  "compose": "✨ חולל פרומפט",
  "improve": "🎯 שפר פרומפט",
  "video-analysis": "📹 ניתוח וידאו",
  "image-gen": "🎨 יצירת תמונה",
  "knowledge-extract": "🧠 חילוץ ידע",
  "translate": "🌐 תרגום",
  "reference-search": "🔍 חיפוש refs",
};

export default async function TokensPage() {
  const [all, byEngine, byOperation, byModel, byDay, recent, totalCount] = await Promise.all([
    prisma.apiUsage.aggregate({
      _sum: { inputTokens: true, outputTokens: true, imagesOut: true, usdCost: true },
      _count: true,
    }),
    prisma.apiUsage.groupBy({
      by: ["engine"],
      _sum: { usdCost: true, inputTokens: true, outputTokens: true, imagesOut: true },
      _count: true,
    }),
    prisma.apiUsage.groupBy({
      by: ["operation"],
      _sum: { usdCost: true },
      _count: true,
    }),
    prisma.apiUsage.groupBy({
      by: ["model"],
      _sum: { usdCost: true, inputTokens: true, outputTokens: true, imagesOut: true },
      _count: true,
      orderBy: { _sum: { usdCost: "desc" } },
    }),
    prisma.$queryRaw<Array<{ day: string; usd: number; calls: number }>>`
      SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day,
             SUM("usdCost")::float AS usd,
             COUNT(*)::int AS calls
      FROM "ApiUsage"
      WHERE "createdAt" > NOW() - INTERVAL '14 days'
      GROUP BY 1
      ORDER BY 1 DESC
    `,
    prisma.apiUsage.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.apiUsage.count(),
  ]);

  // Resolve sourceId → LearnSource (title) for the נושא column.
  const sourceIds = Array.from(new Set(recent.map((r) => r.sourceId).filter(Boolean) as string[]));
  const sourcesById = sourceIds.length
    ? await prisma.learnSource.findMany({
        where: { id: { in: sourceIds } },
        select: { id: true, title: true, prompt: true, addedBy: true },
      })
    : [];
  const sourceMap = new Map(sourcesById.map((s) => [s.id, s]));

  // Helper to derive a "topic" + "project" hint per ApiUsage row from meta + sourceId.
  function topicFor(r: typeof recent[number]): string {
    const meta: any = r.meta || {};
    if (meta.title) return String(meta.title).slice(0, 60);
    if (meta.purpose) return String(meta.purpose).slice(0, 60);
    if (r.sourceId && sourceMap.has(r.sourceId)) {
      const s = sourceMap.get(r.sourceId)!;
      return (s.title || s.prompt || "").slice(0, 60);
    }
    return "—";
  }
  function projectFor(r: typeof recent[number]): string {
    const meta: any = r.meta || {};
    if (meta.engine === "openai-sora" || meta.engine === "google-veo") return "וידאו";
    if (r.operation === "video-gen" || r.operation === "video-analysis") return "וידאו";
    if (r.operation === "image-gen" || r.operation === "image-prompt-build") return "תמונות";
    if (r.operation === "knowledge-extract" || r.operation === "translate") return "ספרייה";
    if (r.operation === "compose" || r.operation === "improve") return "פרומפטים";
    if (r.operation === "brain-chat") return "מוח";
    if (r.operation === "insights-snapshot") return "תובנות";
    if (r.sourceId && sourceMap.has(r.sourceId)) {
      const addedBy = sourceMap.get(r.sourceId)?.addedBy || "";
      if (addedBy.startsWith("brain-chat:scene:")) return "סצנה";
      if (addedBy.startsWith("brain-chat")) return "מוח";
    }
    return "כללי";
  }

  const totalUsd = all._sum.usdCost || 0;
  const totalTokensIn = all._sum.inputTokens || 0;
  const totalTokensOut = all._sum.outputTokens || 0;
  const totalImages = all._sum.imagesOut || 0;

  return (
    <div className="max-w-6xl mx-auto">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-white">עלויות ו-Tokens</h1>
        <p className="text-sm text-slate-400 mt-1">
          מעקב בזמן אמת אחר כל קריאה ל-Gemini / Claude. כל שימוש מתועד עם tokens, מחיר ותפעול.
        </p>
      </header>

      {totalCount === 0 ? (
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-10 text-center">
          <div className="text-5xl mb-3">📊</div>
          <h2 className="text-lg font-semibold text-white mb-1">אין עדיין נתוני שימוש</h2>
          <p className="text-sm text-slate-400">הרץ פעולה שמשתמשת ב-Gemini/Claude (חולל, שפר, ייבא Instagram) וחזור לכאן.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Stat value={`$${totalUsd.toFixed(4)}`} label="סה״כ הוצאה" accent="cyan" big />
            <Stat value={all._count.toLocaleString()} label="קריאות API" accent="purple" />
            <Stat value={(totalTokensIn + totalTokensOut).toLocaleString()} label="Tokens סה״כ" accent="emerald" hint={`${totalTokensIn.toLocaleString()} in · ${totalTokensOut.toLocaleString()} out`} />
            <Stat value={totalImages.toLocaleString()} label="תמונות שחוללו" accent="amber" />
          </div>

          {/* By engine */}
          <Section title="לפי מנוע">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {byEngine.map((e) => (
                <div key={e.engine} className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-white font-bold capitalize">{e.engine}</div>
                    <div className="text-xl font-black text-cyan-300">${(e._sum.usdCost || 0).toFixed(4)}</div>
                  </div>
                  <div className="text-xs text-slate-400">
                    {e._count} קריאות · {((e._sum.inputTokens || 0) + (e._sum.outputTokens || 0)).toLocaleString()} tokens
                    {(e._sum.imagesOut || 0) > 0 && ` · ${e._sum.imagesOut} תמונות`}
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* By operation */}
          <Section title="לפי פעולה">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {byOperation.sort((a, b) => (b._sum.usdCost || 0) - (a._sum.usdCost || 0)).map((op) => (
                <div key={op.operation} className="bg-slate-900/60 border border-slate-800 rounded-lg p-3 flex items-center justify-between">
                  <div className="text-sm text-white">{OP_LABELS[op.operation] || op.operation}</div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-slate-400">{op._count}×</span>
                    <span className="text-cyan-300 font-mono font-semibold">${(op._sum.usdCost || 0).toFixed(4)}</span>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* By model */}
          <Section title="לפי מודל" subtitle="מחיר עדכני ו-totals">
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-800/60 text-right text-xs text-slate-400 uppercase">
                    <th className="px-4 py-3">מודל</th>
                    <th className="px-4 py-3">קריאות</th>
                    <th className="px-4 py-3">In tokens</th>
                    <th className="px-4 py-3">Out tokens</th>
                    <th className="px-4 py-3">תמונות</th>
                    <th className="px-4 py-3">$ in/1M</th>
                    <th className="px-4 py-3">$ out/1M</th>
                    <th className="px-4 py-3 text-left">סה״כ עלות</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {byModel.map((m) => {
                    const p = (PRICING as any)[m.model];
                    return (
                      <tr key={m.model} className="hover:bg-slate-800/30">
                        <td className="px-4 py-3 text-white font-mono text-xs">{m.model}</td>
                        <td className="px-4 py-3 text-slate-300">{m._count}</td>
                        <td className="px-4 py-3 text-slate-300">{(m._sum.inputTokens || 0).toLocaleString()}</td>
                        <td className="px-4 py-3 text-slate-300">{(m._sum.outputTokens || 0).toLocaleString()}</td>
                        <td className="px-4 py-3 text-slate-300">{m._sum.imagesOut || 0}</td>
                        <td className="px-4 py-3 text-slate-500">{p ? `$${p.inputPer1M}` : "—"}</td>
                        <td className="px-4 py-3 text-slate-500">{p ? `$${p.outputPer1M}` : "—"}</td>
                        <td className="px-4 py-3 text-cyan-300 font-mono font-bold text-left">${(m._sum.usdCost || 0).toFixed(4)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>

          {/* Daily chart */}
          {byDay.length > 0 && (
            <Section title="14 ימים אחרונים">
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                {byDay.map((d) => {
                  const maxUsd = Math.max(...byDay.map((x) => x.usd), 0.001);
                  const width = (d.usd / maxUsd) * 100;
                  return (
                    <div key={d.day} className="flex items-center gap-3 py-1.5 text-xs">
                      <span className="text-slate-400 w-20 shrink-0 font-mono">{d.day}</span>
                      <div className="flex-1 bg-slate-800 rounded-full h-2 overflow-hidden">
                        <div className="h-full bg-gradient-to-l from-cyan-400 to-purple-500" style={{ width: `${width}%` }} />
                      </div>
                      <span className="text-slate-500 w-12 text-left">{d.calls}×</span>
                      <span className="text-cyan-300 font-mono font-semibold w-16 text-left">${d.usd.toFixed(4)}</span>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* Full log */}
          <Section title="לוג מלא" subtitle={`50 קריאות אחרונות מתוך ${totalCount}`}>
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-800/60 text-right text-[10px] text-slate-400 uppercase">
                    <th className="px-3 py-2">זמן</th>
                    <th className="px-3 py-2">פעולה</th>
                    <th className="px-3 py-2">נושא</th>
                    <th className="px-3 py-2">פרוייקט</th>
                    <th className="px-3 py-2">מודל</th>
                    <th className="px-3 py-2">in/out tokens</th>
                    <th className="px-3 py-2">תמונות</th>
                    <th className="px-3 py-2">מקור</th>
                    <th className="px-3 py-2 text-left">עלות</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {recent
                    .map((r) => ({ r, topic: topicFor(r), project: projectFor(r) }))
                    .filter((x) => x.topic !== "—" || x.project !== "כללי")
                    .map(({ r, topic, project }) => {
                    return (
                      <tr key={r.id} className={r.errored ? "bg-red-500/5" : ""}>
                        <td className="px-3 py-2 text-slate-400 font-mono">
                          {new Date(r.createdAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })} · {new Date(r.createdAt).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" })}
                        </td>
                        <td className="px-3 py-2 text-slate-300">{OP_LABELS[r.operation] || r.operation}</td>
                        <td className="px-3 py-2 text-slate-200 max-w-[200px] truncate" title={topic}>{topic}</td>
                        <td className="px-3 py-2 text-slate-400 text-[11px]"><span className="bg-slate-800/80 border border-slate-700 px-2 py-0.5 rounded">{project}</span></td>
                        <td className="px-3 py-2 text-slate-500 font-mono text-[10px]">{r.model.replace("-20251001", "")}</td>
                        <td className="px-3 py-2 text-slate-400">{r.inputTokens}/{r.outputTokens}</td>
                        <td className="px-3 py-2 text-slate-400">{r.imagesOut || "—"}</td>
                        <td className="px-3 py-2 text-slate-500">
                          {r.sourceId ? <Link href={`/learn/sources/${r.sourceId}`} className="text-cyan-400 hover:underline">{r.sourceId.slice(-6)}</Link> : "—"}
                        </td>
                        <td className="px-3 py-2 text-cyan-300 font-mono text-left">{r.errored ? "⚠" : `$${r.usdCost.toFixed(6)}`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>

          {/* Pricing reference */}
          <Section title="מחירי API עדכניים">
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 text-xs space-y-2">
              <div><b className="text-cyan-300">Gemini Flash (טקסט):</b> $0.075 / 1M input · $0.30 / 1M output — הזול ביותר, מומלץ לרוב הפעולות</div>
              <div><b className="text-purple-300">Gemini 2.5 Flash Image (nano-banana):</b> ~$0.039 לכל תמונה</div>
              <div><b className="text-emerald-300">Claude Haiku 4.5:</b> $1 / 1M input · $5 / 1M output — fallback כשגימיני מוצה</div>
              <div><b className="text-amber-300">Claude Sonnet 4.6:</b> $3 / 1M input · $15 / 1M output — לשימוש איכותי במיוחד</div>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

function Stat({ value, label, accent, hint, big }: { value: string; label: string; accent: "cyan" | "purple" | "emerald" | "amber"; hint?: string; big?: boolean }) {
  const colorMap = {
    cyan: "text-cyan-300",
    purple: "text-purple-300",
    emerald: "text-emerald-300",
    amber: "text-amber-300",
  };
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
      <div className={`font-black ${colorMap[accent]} ${big ? "text-4xl" : "text-3xl"}`}>{value}</div>
      <div className="text-sm text-slate-300 mt-1">{label}</div>
      {hint && <div className="text-[11px] text-slate-500 mt-1">{hint}</div>}
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-xl font-bold text-white mb-1">{title}</h2>
      {subtitle && <p className="text-xs text-slate-400 mb-3">{subtitle}</p>}
      {children}
    </section>
  );
}
