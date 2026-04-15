import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/learn/db";
import StatusBadge from "@/components/learn/status-badge";
import AutoRefresh from "@/components/learn/auto-refresh";
import SuggestSimilar from "@/components/learn/suggest-similar";
import DownloadPdfButton from "@/components/learn/download-pdf-button";
import RetryAnalysisButton from "@/components/learn/retry-analysis-button";
import GenerateImageButton from "@/components/learn/generate-image-button";
import GenerateVideoButton from "@/components/learn/generate-video-button";
import GeneratedImagesGallery from "@/components/learn/generated-images-gallery";
import GeneratedVideosGallery from "@/components/learn/generated-videos-gallery";
import PromptLineage from "@/components/learn/prompt-lineage";
import PromptVersionsLog from "@/components/learn/prompt-versions-log";
import StarRating from "@/components/learn/star-rating";
import RegenerateFromUrlButton from "@/components/learn/regenerate-from-url-button";

export const dynamic = "force-dynamic";

export default async function SourceDetail({ params }: { params: { id: string } }) {
  const source = await prisma.learnSource.findUnique({
    where: { id: params.id },
    include: { analysis: { include: { knowledgeNodes: true } } },
  });
  if (!source) notFound();
  prisma.learnSource.update({ where: { id: source.id }, data: { viewCount: { increment: 1 } } }).catch(() => {});

  const isLive = source.status === "pending" || source.status === "processing";

  return (
    <div className="max-w-5xl mx-auto">
      {isLive && <AutoRefresh intervalMs={5000} />}

      <div className="mb-5 flex items-center justify-between">
        <Link href="/learn/sources" className="text-xs text-slate-400 hover:text-cyan-400">
          ← חזרה למקורות
        </Link>
        <div className="flex gap-2 flex-wrap">
          <GenerateImageButton sourceId={source.id} />
          <GenerateVideoButton sourceId={source.id} />
          <DownloadPdfButton sourceId={source.id} hasCached={!!source.pdfBlobUrl} />
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-6 mb-8">
        <div className="md:w-1/3">
          {source.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={source.thumbnail} alt="" className="w-full rounded-xl border border-slate-800" />
          ) : (
            <div className="aspect-video bg-slate-900 rounded-xl border border-slate-800 flex items-center justify-center text-5xl text-slate-700">🎬</div>
          )}
          {/* Prompt-management buttons under the thumbnail */}
          <div className="mt-3 flex flex-col gap-2 items-stretch">
            <Link
              href={`/learn/sources/${source.id}/logs`}
              className="text-xs bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 px-3 py-1.5 rounded-lg text-center"
            >
              📂 לוגים של הפרומפט
            </Link>
            <RegenerateFromUrlButton sourceId={source.id} hasUrl={!!source.url} />
          </div>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <StatusBadge status={source.status} />
            <span className="text-[11px] text-slate-500">{source.type}</span>
            <StarRating sourceId={source.id} initialRating={source.userRating} size="md" />
            <span className="text-[11px] text-slate-400 bg-slate-800/60 border border-slate-700 px-2 py-0.5 rounded">👁 {source.viewCount.toLocaleString()} צפיות</span>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">
            {source.title || "ממתין ל-metadata..."}
          </h1>
          {source.url && (
            <a href={source.url} target="_blank" className="text-xs text-cyan-400 hover:underline break-all">
              {source.url}
            </a>
          )}
          <div className="mt-4 bg-slate-900/60 border border-slate-800 rounded-lg p-3">
            <div className="text-[11px] text-slate-500 uppercase mb-1">פרומפט מקורי</div>
            <div className="text-sm text-slate-200 whitespace-pre-wrap">{source.prompt}</div>
          </div>
          <div className="mt-4">
            <PromptVersionsLog sourceId={source.id} />
          </div>
          {source.status === "failed" && source.blobUrl && (
            <div className="mt-3 bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
              <div className="text-amber-300 text-sm font-semibold mb-1">⚠ הניתוח נכשל בריצה הראשונה</div>
              <div className="text-xs text-slate-400 mb-3">
                הוידאו כבר ב-Blob — לחץ &quot;נסה שוב&quot; כדי להריץ את הפייפליין מחדש (Gemini ואז Claude כ-fallback).
                אם שוב נכשל — ה-quota של Gemini אוזל, נסה מאוחר יותר.
              </div>
              <RetryAnalysisButton sourceId={source.id} />
            </div>
          )}
          {source.error && (
            <details className="mt-3 bg-red-500/5 border border-red-500/20 rounded-lg p-3 text-xs">
              <summary className="text-red-300 cursor-pointer">פרטי שגיאה מהריצה הקודמת</summary>
              <div className="mt-2 text-slate-400 break-words">{source.error}</div>
            </details>
          )}
          {isLive && (
            <div className="mt-3 text-sm text-amber-300 flex items-center gap-2">
              <span className="animate-pulse">⚙️</span>
              Pipeline רץ ברקע... הדף יתרענן אוטומטית.
            </div>
          )}
        </div>
      </div>

      {source.analysis && (
        <section className="space-y-6">
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-cyan-300 uppercase tracking-wider mb-3">תיאור הסרטון</h2>
            <p className="text-slate-200 leading-relaxed">{source.analysis.description}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Stat label="סגנון" value={source.analysis.style || "—"} />
            <Stat label="מצב רוח" value={source.analysis.mood || "—"} />
            <Stat label="רמת קושי" value={source.analysis.difficulty || "—"} />
          </div>

          {source.analysis.promptAlignment != null && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex items-center gap-3">
              <div className="text-sm text-slate-400">התאמה לפרומפט:</div>
              <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-l from-cyan-400 to-blue-500"
                  style={{ width: `${source.analysis.promptAlignment * 10}%` }}
                />
              </div>
              <div className="font-bold text-cyan-300">{source.analysis.promptAlignment}/10</div>
            </div>
          )}

          <ListSection title="טכניקות" items={source.analysis.techniques} color="cyan" />
          <ListSection title="How-To" items={source.analysis.howTo} color="blue" numbered />
          <ListSection title="תובנות" items={source.analysis.insights} color="emerald" />
          <TagsSection tags={source.analysis.tags} />

          {source.analysis.knowledgeNodes.length > 0 && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6">
              <h2 className="text-sm font-semibold text-cyan-300 uppercase tracking-wider mb-3">
                Knowledge Nodes ({source.analysis.knowledgeNodes.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {source.analysis.knowledgeNodes.map((n) => (
                  <div key={n.id} className="bg-slate-950/50 rounded-lg p-3 border border-slate-800">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] uppercase text-cyan-400 font-semibold">{n.type}</span>
                      <span className="text-[10px] text-slate-500">
                        {Math.round(n.confidence * 100)}% · {n.sentToDirector ? "✅ נשלח" : "⏳ בהמתנה"}
                      </span>
                    </div>
                    <div className="text-sm font-medium text-white">{n.title}</div>
                    <div className="text-xs text-slate-400 line-clamp-2 mt-1">{n.body}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      <div className="mt-6">
        <GeneratedImagesGallery sourceId={source.id} />
        <GeneratedVideosGallery sourceId={source.id} />
        <PromptLineage sourceId={source.id} />
        <SuggestSimilar sourceId={source.id} sourceTitle={source.title} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
      <div className="text-[11px] text-slate-500 uppercase mb-1">{label}</div>
      <div className="text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

function ListSection({ title, items, color, numbered }: { title: string; items: string[]; color: "cyan" | "blue" | "emerald"; numbered?: boolean }) {
  if (items.length === 0) return null;
  const colorMap = {
    cyan: "text-cyan-300 border-cyan-500/30 bg-cyan-500/5",
    blue: "text-blue-300 border-blue-500/30 bg-blue-500/5",
    emerald: "text-emerald-300 border-emerald-500/30 bg-emerald-500/5",
  };
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6">
      <h2 className="text-sm font-semibold text-cyan-300 uppercase tracking-wider mb-3">{title}</h2>
      <ul className="space-y-2">
        {items.map((it, i) => (
          <li key={i} className={`flex gap-3 items-start text-sm text-slate-200 p-3 rounded border ${colorMap[color]}`}>
            {numbered && <span className="font-bold shrink-0">{i + 1}.</span>}
            {!numbered && <span className="shrink-0">•</span>}
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TagsSection({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6">
      <h2 className="text-sm font-semibold text-cyan-300 uppercase tracking-wider mb-3">תגיות</h2>
      <div className="flex flex-wrap gap-2">
        {tags.map((t) => (
          <span key={t} className="text-xs bg-cyan-500/10 text-cyan-300 px-3 py-1 rounded-full border border-cyan-500/20">
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
