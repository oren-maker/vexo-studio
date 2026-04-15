import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/learn/db";
import EditTimeline from "@/components/learn/video/edit-timeline";
import MergeEditLog from "@/components/learn/video/merge-edit-log";
import ClipReorder from "@/components/learn/video/clip-reorder";

export const dynamic = "force-dynamic";

export default async function JobResultPage({ params }: { params: { id: string } }) {
  const job = await prisma.mergeJob.findUnique({
    where: { id: params.id },
    include: { clips: { orderBy: { order: "asc" } }, transitions: true },
  });
  if (!job) notFound();

  const duration = job.completedAt ? Math.round((job.completedAt.getTime() - job.createdAt.getTime()) / 1000) : null;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-5 flex items-center gap-3 text-xs">
        <Link href="/video" className="text-slate-400 hover:text-cyan-400">← חזרה לפרויקטים</Link>
        <Link href="/video/merge" className="text-slate-400 hover:text-cyan-400">+ פרויקט חדש</Link>
      </div>

      <header className="mb-6">
        <h1 className="text-2xl font-bold text-white">פרויקט {job.id.slice(0, 8)}…</h1>
        <p className="text-xs text-slate-400 mt-1">
          {new Date(job.createdAt).toLocaleString("he-IL")} · engine: {job.engine}
          {duration !== null && ` · משך עיבוד ${duration}s`}
        </p>
      </header>

      {job.status === "complete" && job.outputUrl && (
        <section className="mb-6 bg-slate-900/60 border border-emerald-500/30 rounded-xl p-5">
          <video src={job.outputUrl} controls className="w-full rounded-lg" />
          <div className="mt-3 flex items-center justify-between">
            <div className="text-sm text-slate-300">
              {job.outputDuration ? `${job.outputDuration.toFixed(1)}s` : ""} · {job.clips.length} clips
              {job.costUsd > 0 && ` · עלות $${job.costUsd.toFixed(3)}`}
            </div>
            <a
              href={job.outputUrl}
              download
              className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold px-4 py-2 rounded-lg text-sm"
            >
              ⬇ הורד MP4
            </a>
          </div>
        </section>
      )}

      {job.status === "failed" && (
        <section className="mb-6 bg-red-500/10 border border-red-500/30 rounded-xl p-5">
          <div className="text-red-300 font-bold mb-1">⚠ הרינדור נכשל</div>
          <div className="text-xs text-slate-400 whitespace-pre-wrap">{job.errorMsg || "שגיאה לא ידועה"}</div>
        </section>
      )}

      {job.status !== "complete" && job.status !== "failed" && (
        <section className="mb-6 bg-slate-900/60 border border-amber-500/30 rounded-xl p-5">
          <div className="text-amber-300 text-sm">⚙️ סטטוס: {job.status}</div>
          <div className="text-xs text-slate-500 mt-1">חזור בעוד דקה ורענן את הדף</div>
        </section>
      )}

      {/* Premiere-style timeline */}
      <section className="mb-6">
        <h2 className="text-lg font-bold text-white mb-3">🎞 ציר זמן</h2>
        <EditTimeline
          clips={job.clips.map((c) => ({
            filename: c.filename,
            durationSec: c.durationSec,
            trimStart: c.trimStart,
            trimEnd: c.trimEnd,
            transition: c.transition,
            transitionDur: c.transitionDur,
          }))}
          transitions={job.transitions.map((t) => {
            const beforeIdx = job.clips.findIndex((c) => c.id === t.beforeClipId);
            return {
              beforeClipIndex: beforeIdx,
              type: t.type,
              durationSec: t.durationSec,
              status: t.status as any,
            };
          })}
          audioMode={job.audioMode as any}
          audioTrackUrl={job.audioTrackUrl}
          techSpecs={{ resolution: "1280x720", fps: 30, codec: "H.264 + AAC", aspectRatio: "16:9" }}
        />
      </section>

      {/* Edit log */}
      <section className="mb-6">
        <MergeEditLog jobId={job.id} />
      </section>

      <section>
        <ClipReorder
          jobId={job.id}
          initialClips={job.clips.map((c) => ({
            id: c.id,
            filename: c.filename,
            durationSec: c.durationSec,
            order: c.order,
          }))}
        />
      </section>
    </div>
  );
}
