import Link from "next/link";
import { prisma } from "@/lib/learn/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TABS = [
  { key: "snapshots", label: "📸 תובנות", hint: "Snapshots של המאגר כל שעה" },
  { key: "versions", label: "📜 גרסאות", hint: "היסטוריית שינויים של פרומפטים" },
  { key: "improvements", label: "🔄 שדרוגים", hint: "הרצות Auto-Improve" },
  { key: "usage", label: "💰 API Usage", hint: "כל קריאה ל-Gemini / Claude" },
  { key: "jobs", label: "⚙️ Jobs", hint: "עיבוד ארוך (sync, extraction)" },
  { key: "images", label: "🎨 תמונות", hint: "תמונות שחוללו" },
  { key: "videos", label: "🎬 וידאו", hint: "סרטונים שחוללו" },
];

export default async function LogsPage({ searchParams }: { searchParams: { tab?: string; page?: string } }) {
  const tab = searchParams.tab || "snapshots";
  const page = Math.max(1, Number(searchParams.page || 1));
  const pageSize = 50;

  // Query totals for all tabs for the tab badges
  const [sTotal, vTotal, iTotal, aTotal, jTotal, imgTotal, vidTotal] = await Promise.all([
    prisma.insightsSnapshot.count(),
    prisma.promptVersion.count(),
    prisma.improvementRun.count(),
    prisma.apiUsage.count(),
    prisma.syncJob.count(),
    prisma.generatedImage.count(),
    prisma.generatedVideo.count(),
  ]);
  const counts: Record<string, number> = {
    snapshots: sTotal,
    versions: vTotal,
    improvements: iTotal,
    usage: aTotal,
    jobs: jTotal,
    images: imgTotal,
    videos: vidTotal,
  };

  let rows: any[] = [];
  let total = 0;
  if (tab === "snapshots") {
    [rows, total] = await Promise.all([
      prisma.insightsSnapshot.findMany({ orderBy: { takenAt: "desc" }, take: pageSize, skip: (page - 1) * pageSize }),
      prisma.insightsSnapshot.count(),
    ]);
  } else if (tab === "versions") {
    [rows, total] = await Promise.all([
      prisma.promptVersion.findMany({ orderBy: { createdAt: "desc" }, take: pageSize, skip: (page - 1) * pageSize }),
      prisma.promptVersion.count(),
    ]);
  } else if (tab === "improvements") {
    [rows, total] = await Promise.all([
      prisma.improvementRun.findMany({ orderBy: { startedAt: "desc" }, take: pageSize, skip: (page - 1) * pageSize }),
      prisma.improvementRun.count(),
    ]);
  } else if (tab === "usage") {
    [rows, total] = await Promise.all([
      prisma.apiUsage.findMany({ orderBy: { createdAt: "desc" }, take: pageSize, skip: (page - 1) * pageSize }),
      prisma.apiUsage.count(),
    ]);
  } else if (tab === "jobs") {
    [rows, total] = await Promise.all([
      prisma.syncJob.findMany({ orderBy: { startedAt: "desc" }, take: pageSize, skip: (page - 1) * pageSize }),
      prisma.syncJob.count(),
    ]);
  } else if (tab === "images") {
    [rows, total] = await Promise.all([
      prisma.generatedImage.findMany({ orderBy: { createdAt: "desc" }, take: pageSize, skip: (page - 1) * pageSize }),
      prisma.generatedImage.count(),
    ]);
  } else if (tab === "videos") {
    [rows, total] = await Promise.all([
      prisma.generatedVideo.findMany({ orderBy: { createdAt: "desc" }, take: pageSize, skip: (page - 1) * pageSize }),
      prisma.generatedVideo.count(),
    ]);
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const tabInfo = TABS.find((t) => t.key === tab) || TABS[0];

  return (
    <div className="max-w-6xl mx-auto">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-white">📂 לוגים</h1>
        <p className="text-sm text-slate-400 mt-1">
          כל פעולה במערכת נרשמת כאן ולא נמחקת. <b className="text-cyan-300">זה הזיכרון של המערכת</b> — ממנו לומדים ומשתפרים.
        </p>
      </header>

      <div className="flex flex-wrap gap-1 bg-slate-900/60 border border-slate-800 rounded-xl p-1 mb-6">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <Link
              key={t.key}
              href={`/learn/logs?tab=${t.key}`}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                active ? "bg-cyan-500 text-slate-950" : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
            >
              <span>{t.label}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${active ? "bg-slate-950/30 text-slate-950" : "bg-slate-800 text-slate-500"}`}>
                {counts[t.key].toLocaleString()}
              </span>
            </Link>
          );
        })}
      </div>

      <div className="text-xs text-slate-400 mb-3">{tabInfo.hint} · מציג {rows.length} מתוך {total.toLocaleString()}</div>

      {rows.length === 0 ? (
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-10 text-center">
          <div className="text-4xl mb-3">📭</div>
          <p className="text-sm text-slate-400">אין עדיין לוגים בקטגוריה הזו.</p>
        </div>
      ) : (
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
          {tab === "snapshots" && <SnapshotsTable rows={rows} />}
          {tab === "versions" && <VersionsTable rows={rows} />}
          {tab === "improvements" && <ImprovementsTable rows={rows} />}
          {tab === "usage" && <UsageTable rows={rows} />}
          {tab === "jobs" && <JobsTable rows={rows} />}
          {tab === "images" && <ImagesTable rows={rows} />}
          {tab === "videos" && <VideosTable rows={rows} />}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <div className="text-xs text-slate-500">עמוד {page} מתוך {totalPages}</div>
          <div className="flex gap-1" dir="ltr">
            {page > 1 && (
              <Link
                href={`/learn/logs?tab=${tab}&page=${page - 1}`}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-3 py-1.5 rounded"
              >
                ‹ הקודם
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/learn/logs?tab=${tab}&page=${page + 1}`}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-3 py-1.5 rounded"
              >
                הבא ›
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2 text-right text-[10px] font-semibold text-slate-400 uppercase tracking-wider ${className}`}>{children}</th>;
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 text-xs text-slate-300 ${className}`}>{children}</td>;
}
function fmt(d: Date | string) {
  const date = new Date(d);
  return date.toLocaleString("he-IL", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function SnapshotsTable({ rows }: { rows: any[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-slate-800/60">
        <tr>
          <Th>זמן</Th><Th>Sources</Th><Th>Nodes</Th><Th>ממוצע טכ׳</Th><Th>% timecodes</Th><Th>סיכום שינוי</Th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-800">
        {rows.map((r) => (
          <tr key={r.id} className="hover:bg-slate-800/30">
            <Td className="font-mono text-slate-500">{fmt(r.takenAt)}</Td>
            <Td>{r.sourcesCount}</Td>
            <Td>{r.nodesCount}</Td>
            <Td className="font-mono">{r.avgTechniques}</Td>
            <Td className="font-mono">{r.timecodePct}%</Td>
            <Td className="text-slate-400">{r.summary || "—"}</Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function VersionsTable({ rows }: { rows: any[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-slate-800/60">
        <tr>
          <Th>זמן</Th><Th>מקור</Th><Th>v#</Th><Th>Trigger</Th><Th>שינויים</Th><Th>סיבה</Th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-800">
        {rows.map((r) => {
          const d = r.diff as any;
          return (
            <tr key={r.id} className="hover:bg-slate-800/30">
              <Td className="font-mono text-slate-500">{fmt(r.createdAt)}</Td>
              <Td><Link href={`/learn/sources/${r.sourceId}`} className="text-cyan-400 hover:underline">{r.sourceId.slice(-8)}</Link></Td>
              <Td><span className="bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded text-[10px] font-bold">v{r.version}</span></Td>
              <Td className="text-slate-400">{r.triggeredBy || "—"}</Td>
              <Td className="font-mono text-[10px]">
                {d?.linesAdded ? <span className="text-emerald-400">+{d.linesAdded}</span> : null}
                {d?.linesRemoved ? <span className="text-red-400 mr-1">−{d.linesRemoved}</span> : null}
                {!d && "—"}
              </Td>
              <Td className="text-slate-400 italic max-w-md truncate">{r.reason || "—"}</Td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ImprovementsTable({ rows }: { rows: any[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-slate-800/60">
        <tr>
          <Th>זמן</Th><Th>סטטוס</Th><Th>נבדקו</Th><Th>שודרגו</Th><Th>עלות</Th><Th>סיכום</Th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-800">
        {rows.map((r) => (
          <tr key={r.id} className="hover:bg-slate-800/30">
            <Td className="font-mono text-slate-500">{fmt(r.startedAt)}</Td>
            <Td>{r.status === "complete" ? "✓" : r.status === "failed" ? "⚠" : "⏳"} {r.status}</Td>
            <Td>{r.sourcesExamined}</Td>
            <Td className="text-emerald-300 font-bold">{r.sourcesImproved}</Td>
            <Td className="font-mono text-amber-300">${r.totalCostUsd.toFixed(4)}</Td>
            <Td className="text-slate-400">{r.summary || "—"}</Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function UsageTable({ rows }: { rows: any[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-slate-800/60">
        <tr>
          <Th>זמן</Th><Th>פעולה</Th><Th>מודל</Th><Th>in/out</Th><Th>תמונות</Th><Th>מקור</Th><Th>עלות</Th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-800">
        {rows.map((r) => (
          <tr key={r.id} className={`hover:bg-slate-800/30 ${r.errored ? "bg-red-500/5" : ""}`}>
            <Td className="font-mono text-slate-500">{fmt(r.createdAt)}</Td>
            <Td>{r.operation}</Td>
            <Td className="font-mono text-[10px]">{r.model.replace("-20251001", "")}</Td>
            <Td>{r.inputTokens}/{r.outputTokens}</Td>
            <Td>{r.imagesOut || "—"}</Td>
            <Td>{r.sourceId ? <Link href={`/learn/sources/${r.sourceId}`} className="text-cyan-400 hover:underline">{r.sourceId.slice(-6)}</Link> : "—"}</Td>
            <Td className="font-mono text-amber-300">{r.errored ? "⚠" : `$${r.usdCost.toFixed(6)}`}</Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function JobsTable({ rows }: { rows: any[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-slate-800/60">
        <tr>
          <Th>זמן</Th><Th>פעולה</Th><Th>סטטוס</Th><Th>התקדמות</Th><Th>שלב</Th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-800">
        {rows.map((r) => (
          <tr key={r.id} className="hover:bg-slate-800/30">
            <Td className="font-mono text-slate-500">{fmt(r.startedAt)}</Td>
            <Td>{r.operation}</Td>
            <Td>{r.status === "complete" ? "✓" : r.status === "failed" ? "⚠" : "⏳"} {r.status}</Td>
            <Td className="font-mono">{r.completedItems}/{r.totalItems || "?"}</Td>
            <Td className="text-slate-400">{r.currentStep || "—"} {r.currentMessage && <span className="text-[10px] text-slate-500">· {r.currentMessage}</span>}</Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ImagesTable({ rows }: { rows: any[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-slate-800/60">
        <tr>
          <Th>זמן</Th><Th>Preview</Th><Th>מודל</Th><Th>מקור</Th><Th>עלות</Th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-800">
        {rows.map((r) => (
          <tr key={r.id} className="hover:bg-slate-800/30">
            <Td className="font-mono text-slate-500">{fmt(r.createdAt)}</Td>
            <Td>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={r.blobUrl} alt="" className="w-16 h-10 object-cover rounded" />
            </Td>
            <Td className="font-mono text-[10px]">{r.model}</Td>
            <Td><Link href={`/learn/sources/${r.sourceId}`} className="text-cyan-400 hover:underline">{r.sourceId.slice(-6)}</Link></Td>
            <Td className="font-mono text-amber-300">${r.usdCost.toFixed(4)}</Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function VideosTable({ rows }: { rows: any[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-slate-800/60">
        <tr>
          <Th>זמן</Th><Th>סטטוס</Th><Th>מודל</Th><Th>משך</Th><Th>יחס</Th><Th>מקור</Th><Th>עלות</Th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-800">
        {rows.map((r) => (
          <tr key={r.id} className="hover:bg-slate-800/30">
            <Td className="font-mono text-slate-500">{fmt(r.createdAt)}</Td>
            <Td>{r.status === "complete" ? "✓" : r.status === "failed" ? "⚠" : "⏳"} {r.status}</Td>
            <Td className="font-mono text-[10px]">{r.model.replace("veo-3.1-", "").replace("-preview", "")}</Td>
            <Td>{r.durationSec}s</Td>
            <Td>{r.aspectRatio}</Td>
            <Td><Link href={`/learn/sources/${r.sourceId}`} className="text-cyan-400 hover:underline">{r.sourceId.slice(-6)}</Link></Td>
            <Td className="font-mono text-amber-300">${r.usdCost.toFixed(2)}</Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
