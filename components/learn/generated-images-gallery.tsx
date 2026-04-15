import Link from "next/link";
import { prisma } from "@/lib/learn/db";

export default async function GeneratedImagesGallery({ sourceId }: { sourceId: string }) {
  const images = await prisma.generatedImage.findMany({
    where: { sourceId },
    orderBy: { createdAt: "desc" },
  });

  if (images.length === 0) return null;

  const versionIds = Array.from(new Set(images.map((i) => i.promptVersionId).filter(Boolean) as string[]));
  const versionMap: Record<string, number> = {};
  if (versionIds.length > 0) {
    const versions = await prisma.promptVersion.findMany({
      where: { id: { in: versionIds } },
      select: { id: true, version: true },
    });
    for (const v of versions) versionMap[v.id] = v.version;
  }

  const totalCost = images.reduce((s, i) => s + i.usdCost, 0);
  const currentCount = images.filter((i) => !i.promptVersionId).length;
  const oldCount = images.length - currentCount;

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 mb-4">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-sm font-semibold text-cyan-300 uppercase tracking-wider flex items-center gap-2">
          🎨 תמונות שחוללו ({images.length})
          {oldCount > 0 && (
            <span className="text-[10px] bg-amber-500/15 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded normal-case">
              {currentCount} מהפרומפט הנוכחי · {oldCount} מפרומפטים קודמים
            </span>
          )}
        </h2>
        <span className="text-xs text-slate-400">עלות מצטברת: <b className="text-amber-300">${totalCost.toFixed(4)}</b></span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {images.map((img) => {
          const isOld = !!img.promptVersionId;
          const oldVersionNum = img.promptVersionId ? versionMap[img.promptVersionId] : null;
          return (
            <figure key={img.id} className={`rounded-lg overflow-hidden border ${isOld ? "bg-slate-950/30 border-amber-500/30 opacity-90" : "bg-slate-950/50 border-slate-800"}`}>
              {isOld && oldVersionNum != null && (
                <Link
                  href={`/learn/sources/${sourceId}/logs?version=${oldVersionNum}`}
                  className="block bg-amber-500/10 hover:bg-amber-500/20 border-b border-amber-500/30 px-3 py-1.5 text-[11px] text-amber-300 transition"
                >
                  📜 חוללה מהפרומפט הקודם <b>v{oldVersionNum}</b> · לחץ לצפייה →
                </Link>
              )}
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.blobUrl} alt="" className="w-full h-48 object-cover" />
                <div className="absolute top-2 left-2 right-2 flex items-start justify-between pointer-events-none">
                  <span className="text-[10px] font-mono bg-slate-950/85 text-cyan-300 px-2 py-1 rounded backdrop-blur border border-cyan-500/30">
                    {img.model}
                  </span>
                  <span className="text-[10px] font-mono bg-slate-950/85 text-amber-300 px-2 py-1 rounded backdrop-blur border border-amber-500/30">
                    ${img.usdCost.toFixed(4)}
                  </span>
                </div>
              </div>
              <figcaption className="p-2 text-[10px] text-slate-500 flex items-center justify-between">
                <span>
                  {new Date(img.createdAt).toLocaleDateString("he-IL")} · {new Date(img.createdAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                </span>
                <a href={img.blobUrl} target="_blank" download className="text-cyan-400 hover:underline">
                  ⬇ הורד
                </a>
              </figcaption>
            </figure>
          );
        })}
      </div>
    </div>
  );
}
