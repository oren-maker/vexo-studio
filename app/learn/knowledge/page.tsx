import Link from "next/link";
import { prisma } from "@/lib/learn/db";
import ReferenceManager from "@/components/learn/reference-manager";
import SystemDocs, { type DocsData } from "@/components/learn/system-docs";

export const dynamic = "force-dynamic";

const TYPES = ["technique", "style", "how_to", "insight"];

const typeColors: Record<string, string> = {
  technique: "bg-cyan-500/10 text-cyan-300 border-cyan-500/30",
  style: "bg-purple-500/10 text-purple-300 border-purple-500/30",
  how_to: "bg-blue-500/10 text-blue-300 border-blue-500/30",
  insight: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
};

type Tab = "knowledge" | "emotion" | "sound" | "cinematography" | "capability" | "docs";
const REFERENCE_KINDS = ["emotion", "sound", "cinematography", "capability"] as const;
const VALID_TABS = [...REFERENCE_KINDS, "docs"] as const;

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: { type?: string; tab?: string };
}) {
  const tab: Tab = (VALID_TABS as readonly string[]).includes(searchParams.tab ?? "")
    ? (searchParams.tab as Tab)
    : "knowledge";

  const [kCount, eCount, sCount, cCount, capCount] = await Promise.all([
    prisma.knowledgeNode.count(),
    prisma.brainReference.count({ where: { kind: "emotion" } }),
    prisma.brainReference.count({ where: { kind: "sound" } }),
    prisma.brainReference.count({ where: { kind: "cinematography" } }),
    prisma.brainReference.count({ where: { kind: "capability" } }),
  ]);

  return (
    <div className="max-w-6xl mx-auto">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-white">💡 ידע</h1>
        <p className="text-sm text-slate-400 mt-1">
          ה-RAG של הבמאי: רגשות, סאונד, זוויות צילום, יכולות המערכת ו-KnowledgeNodes שחולצו מסרטונים. המוח קורא את כל זה לפני כל תשובה.
        </p>
      </header>

      {/* Top tabs */}
      <div className="flex gap-1 mb-6 bg-slate-900/60 border border-slate-800 rounded-lg p-1 w-fit flex-wrap">
        <TabLink href="/learn/knowledge" active={tab === "knowledge"} label={`🧠 Knowledge (${kCount})`} />
        <TabLink href="/learn/knowledge?tab=emotion" active={tab === "emotion"} label={`😊 רגשות (${eCount})`} />
        <TabLink href="/learn/knowledge?tab=sound" active={tab === "sound"} label={`🔊 סאונד (${sCount})`} />
        <TabLink href="/learn/knowledge?tab=cinematography" active={tab === "cinematography"} label={`🎥 צילום (${cCount})`} />
        <TabLink href="/learn/knowledge?tab=capability" active={tab === "capability"} label={`⚙️ יכולות (${capCount})`} />
        <TabLink href="/learn/knowledge?tab=docs" active={tab === "docs"} label="📚 תיעוד" />
      </div>

      {tab === "knowledge" && <KnowledgeView type={searchParams.type} />}
      {tab === "emotion" && <ReferenceManager kind="emotion" />}
      {tab === "sound" && <ReferenceManager kind="sound" />}
      {tab === "cinematography" && <ReferenceManager kind="cinematography" />}
      {tab === "capability" && <ReferenceManager kind="capability" />}
      {tab === "docs" && <DocsView />}
    </div>
  );
}

async function DocsView() {
  const [
    guides,
    sources,
    knowledgeNodes,
    brainRefByKind,
    snapshotByKind,
    chats,
    messages,
    latestCache,
    upgradesByStatus,
    apiAgg,
    videos,
    images,
    promptVersions,
  ] = await Promise.all([
    prisma.guide.count(),
    prisma.learnSource.count(),
    prisma.knowledgeNode.count(),
    prisma.brainReference.groupBy({ by: ["kind"], _count: { _all: true } }),
    prisma.insightsSnapshot.groupBy({ by: ["kind"], _count: { _all: true } }),
    prisma.brainChat.count(),
    prisma.brainMessage.count(),
    prisma.dailyBrainCache.findFirst({ orderBy: { date: "desc" }, select: { identity: true, date: true } }),
    prisma.brainUpgradeRequest.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.apiUsage.aggregate({ _count: true, _sum: { usdCost: true } }),
    prisma.generatedVideo.count(),
    prisma.generatedImage.count(),
    prisma.promptVersion.count(),
  ]);

  const data: DocsData = {
    guides,
    sources,
    knowledgeNodes,
    brainRefByKind: Object.fromEntries(brainRefByKind.map((r) => [r.kind, r._count._all])),
    snapshotByKind: Object.fromEntries(snapshotByKind.map((r) => [r.kind, r._count._all])),
    chats,
    messages,
    latestIdentity: latestCache?.identity ?? null,
    latestIdentityDate: latestCache?.date ? new Date(latestCache.date).toLocaleDateString("he-IL") : null,
    upgradesByStatus: Object.fromEntries(upgradesByStatus.map((r) => [r.status, r._count._all])),
    apiCallCount: apiAgg._count,
    apiCostUsd: apiAgg._sum.usdCost ?? 0,
    videos,
    images,
    promptVersions,
  };

  return <SystemDocs data={data} />;
}

function TabLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`px-5 py-2 rounded text-sm font-medium transition whitespace-nowrap ${
        active ? "bg-cyan-500 text-slate-950" : "text-slate-400 hover:text-slate-200"
      }`}
    >
      {label}
    </Link>
  );
}

async function KnowledgeView({ type }: { type?: string }) {
  const nodes = await prisma.knowledgeNode.findMany({
    where: type ? { type } : {},
    orderBy: [{ confidence: "desc" }, { createdAt: "desc" }],
    take: 100,
  });

  const counts = await prisma.knowledgeNode.groupBy({
    by: ["type"],
    _count: { type: true },
  });
  const totalByType = Object.fromEntries(counts.map((c) => [c.type, c._count.type]));

  return (
    <>
      <div className="flex flex-wrap gap-2 mb-5">
        <a
          href="/learn/knowledge"
          className={`px-4 py-1.5 rounded-full text-xs border ${!type ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40" : "bg-slate-800 text-slate-400 border-slate-700"}`}
        >
          הכל ({nodes.length})
        </a>
        {TYPES.map((t) => (
          <a
            key={t}
            href={`/learn/knowledge?type=${t}`}
            className={`px-4 py-1.5 rounded-full text-xs border ${type === t ? typeColors[t] : "bg-slate-800 text-slate-400 border-slate-700"}`}
          >
            {t} ({totalByType[t] || 0})
          </a>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {nodes.map((n) => (
          <div key={n.id} className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded border ${typeColors[n.type] || "bg-slate-800"}`}>
                {n.type}
              </span>
              <div className="flex items-center gap-2 text-[10px] text-slate-500">
                <span>{Math.round(n.confidence * 100)}%</span>
                <span>{n.sentToDirector ? "✅" : "⏳"}</span>
              </div>
            </div>
            <div className="text-sm font-semibold text-white mb-1">{n.title}</div>
            <p className="text-xs text-slate-400 line-clamp-3">{n.body}</p>
            {n.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {n.tags.slice(0, 5).map((t) => (
                  <span key={t} className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {nodes.length === 0 && (
          <div className="col-span-full bg-slate-900/50 border border-slate-800 rounded-xl p-10 text-center text-slate-500">
            אין knowledge nodes עדיין. ניתוח מוצלח של סרטון יצור אותם אוטומטית.
          </div>
        )}
      </div>
    </>
  );
}
