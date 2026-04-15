import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/learn/db";

export const dynamic = "force-dynamic";

export default async function ImprovementRunPage({ params }: { params: { runId: string } }) {
  const run = await prisma.improvementRun.findUnique({
    where: { id: params.runId },
  });
  if (!run) notFound();

  const versions = await prisma.promptVersion.findMany({
    where: { triggeredBy: "auto-improve", snapshotId: run.snapshotId },
    orderBy: { createdAt: "desc" },
  });
  const sources = versions.length
    ? await prisma.learnSource.findMany({
        where: { id: { in: Array.from(new Set(versions.map((v) => v.sourceId))) } },
        select: { id: true, title: true, prompt: true, userRating: true },
      })
    : [];
  const sourceById: Record<string, { id: string; title: string | null; prompt: string; userRating: number | null }> = {};
  for (const s of sources) sourceById[s.id] = s;

  const snapshot = await prisma.insightsSnapshot.findUnique({ where: { id: run.snapshotId } });

  const duration = run.completedAt
    ? Math.round((run.completedAt.getTime() - run.startedAt.getTime()) / 1000)
    : null;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-5 flex items-center gap-3 text-xs">
        <Link href="/learn/consciousness" className="text-slate-400 hover:text-cyan-400">
          ← תודעה
        </Link>
        <Link href="/learn/logs?tab=improvements" className="text-slate-400 hover:text-cyan-400">
          כל ההרצות
        </Link>
      </div>

      <header className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <span
            className={`text-[10px] uppercase font-bold px-2 py-1 rounded ${
              run.status === "complete"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                : run.status === "failed"
                ? "bg-red-500/20 text-red-300 border border-red-500/40"
                : "bg-amber-500/20 text-amber-300 border border-amber-500/40"
            }`}
          >
            {run.status}
          </span>
          <span className="text-xs text-slate-500">
            {new Date(run.startedAt).toLocaleString("he-IL")}
            {duration !== null && ` · ${duration}s`}
          </span>
        </div>
        <h1 className="text-3xl font-bold text-white">🔄 תוצאות שדרוג אוטומטי</h1>
        <p className="text-sm text-slate-400 mt-1">{run.summary || "—"}</p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat value={run.sourcesExamined} label="נבדקו" accent="cyan" />
        <Stat value={run.sourcesImproved} label="שודרגו" accent="emerald" />
        <Stat
          value={run.sourcesExamined - run.sourcesImproved}
          label="נשמרו ללא שינוי"
          accent="slate"
        />
        <Stat value={`$${run.totalCostUsd.toFixed(4)}`} label="עלות Gemini" accent="amber" />
      </div>

      {snapshot && (
        <section className="mb-6 bg-slate-900/40 border border-slate-800 rounded-xl p-4">
          <div className="text-[11px] text-slate-500 uppercase mb-1">Snapshot בסיס</div>
          <div className="text-sm text-slate-200">
            {new Date(snapshot.takenAt).toLocaleString("he-IL")} · {snapshot.sourcesCount} מקורות ·{" "}
            {snapshot.nodesCount} nodes · {snapshot.avgTechniques} avg tech
          </div>
        </section>
      )}

      <section className="mb-8">
        <h2 className="text-xl font-bold text-white mb-3">
          פרומפטים ששודרגו ({versions.length})
        </h2>
        {versions.length === 0 ? (
          <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6 text-center text-sm text-slate-500">
            אף פרומפט לא שודרג בהרצה הזו — כל המועמדים נשמרו כמות שהם.
          </div>
        ) : (
          <ul className="space-y-4">
            {versions.map((v) => (
              <li
                key={v.id}
                className="bg-slate-900/60 border border-slate-800 rounded-xl p-5"
              >
                <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                  <div>
                    <Link
                      href={`/learn/sources/${v.sourceId}`}
                      className="text-lg font-bold text-white hover:text-cyan-300"
                    >
                      {sourceById[v.sourceId]?.title || "(ללא כותרת)"}
                    </Link>
                    <div className="text-[11px] text-slate-500 mt-1">
                      גרסה v{v.version} · {new Date(v.createdAt).toLocaleString("he-IL")}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Link
                      href={`/learn/sources/${v.sourceId}`}
                      className="text-xs bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-3 py-1.5 rounded-lg"
                    >
                      פתח פרומפט
                    </Link>
                    <Link
                      href={`/learn/sources/${v.sourceId}/logs`}
                      className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-3 py-1.5 rounded-lg"
                    >
                      לוג מלא
                    </Link>
                  </div>
                </div>

                {v.reason && (
                  <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 mb-3">
                    <div className="text-[10px] uppercase text-emerald-400 font-semibold mb-1">
                      מה השתנה
                    </div>
                    <div className="text-sm text-emerald-200">{v.reason}</div>
                  </div>
                )}

                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <div className="text-[10px] uppercase text-slate-500 mb-1 flex items-center gap-2">
                      <span className="bg-red-500/20 text-red-300 px-1.5 py-0.5 rounded">
                        לפני
                      </span>
                      <span>{v.prompt.split(/\s+/).length} מילים</span>
                    </div>
                    <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3 text-xs text-slate-300 whitespace-pre-wrap max-h-64 overflow-y-auto">
                      {v.prompt}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-slate-500 mb-1 flex items-center gap-2">
                      <span className="bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded">
                        אחרי (גרסה נוכחית)
                      </span>
                      <span>{(sourceById[v.sourceId]?.prompt || "").split(/\s+/).length} מילים</span>
                    </div>
                    <div className="bg-slate-950/60 border border-emerald-500/20 rounded-lg p-3 text-xs text-emerald-50 whitespace-pre-wrap max-h-64 overflow-y-auto">
                      {(sourceById[v.sourceId]?.prompt || "")}
                    </div>
                  </div>
                </div>

                {v.diff && (
                  <details className="mt-3">
                    <summary className="text-[11px] text-slate-400 cursor-pointer hover:text-cyan-400">
                      📊 diff מפורט
                    </summary>
                    <pre className="text-[10px] text-slate-400 bg-slate-950 rounded p-2 mt-2 overflow-x-auto">
                      {JSON.stringify(v.diff, null, 2)}
                    </pre>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({
  value,
  label,
  accent,
}: {
  value: string | number;
  label: string;
  accent: "cyan" | "emerald" | "slate" | "amber";
}) {
  const colorMap = {
    cyan: "text-cyan-300",
    emerald: "text-emerald-300",
    slate: "text-slate-300",
    amber: "text-amber-300",
  };
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
      <div className={`text-3xl font-black ${colorMap[accent]}`}>{value}</div>
      <div className="text-xs text-slate-400 mt-1">{label}</div>
    </div>
  );
}
