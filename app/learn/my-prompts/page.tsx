import Link from "next/link";
import { prisma } from "@/lib/learn/db";
import GenerateButton from "@/components/learn/generate-more-button";
import MyPromptCard from "@/components/learn/my-prompt-card";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MINE_TAGS = ["corpus-generator", "gemini-compose", "manual", "bulk-import", "json-import", "csv-import"];

export default async function MyPromptsPage() {
  const [mine, total, byTag] = await Promise.all([
    prisma.learnSource.findMany({
      where: { addedBy: { in: MINE_TAGS } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.learnSource.count({ where: { addedBy: { in: MINE_TAGS } } }),
    prisma.learnSource.groupBy({
      by: ["addedBy"],
      _count: true,
      where: { addedBy: { in: MINE_TAGS } },
    }),
  ]);

  const generatedCount = byTag.find((t) => t.addedBy === "corpus-generator")?._count || 0;
  const composedCount = byTag.find((t) => t.addedBy === "gemini-compose")?._count || 0;
  const manualCount = (byTag.find((t) => t.addedBy === "manual")?._count || 0)
    + (byTag.find((t) => t.addedBy === "bulk-import")?._count || 0)
    + (byTag.find((t) => t.addedBy === "json-import")?._count || 0)
    + (byTag.find((t) => t.addedBy === "csv-import")?._count || 0);

  return (
    <div className="max-w-5xl mx-auto">
      <header className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">הפרומפטים שלי</h1>
          <p className="text-sm text-slate-400 mt-1">
            פרומפטים שנוצרו בעזרת המערכת — אוטומטית מהמאגר או ידנית.
          </p>
        </div>
        <GenerateButton />
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat value={total} label="סה״כ" accent="white" />
        <Stat value={generatedCount} label="נוצרו מהמאגר" accent="cyan" hint="לפי signatures + co-occurrence" />
        <Stat value={composedCount} label="חוללו ב-AI" accent="purple" hint="/learn/compose" />
        <Stat value={manualCount} label="ידני / ייבוא" accent="emerald" />
      </div>

      {mine.length === 0 ? (
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-10 text-center">
          <div className="text-5xl mb-3">✨</div>
          <h2 className="text-lg font-semibold text-white mb-1">אין עדיין פרומפטים שלך</h2>
          <p className="text-sm text-slate-400 mb-5">לחץ על הכפתור למעלה כדי ליצור 20 פרומפטים שלמדו מהמאגר.</p>
          <Link href="/learn/compose" className="text-cyan-400 hover:underline text-sm">
            או — חולל ידנית בעמוד החולל ←
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {mine.map((p) => (
            <MyPromptCard key={p.id} source={{
              id: p.id,
              title: p.title,
              prompt: p.prompt,
              addedBy: p.addedBy,
              createdAt: p.createdAt.toISOString(),
              blobUrl: p.blobUrl,
              thumbnail: p.thumbnail,
            }} />
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ value, label, accent, hint }: { value: number; label: string; accent: "white" | "cyan" | "purple" | "emerald"; hint?: string }) {
  const colorMap = {
    white: "text-white",
    cyan: "text-cyan-300",
    purple: "text-purple-300",
    emerald: "text-emerald-300",
  };
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
      <div className={`text-3xl font-black ${colorMap[accent]}`}>{value.toLocaleString()}</div>
      <div className="text-sm text-slate-300 mt-1">{label}</div>
      {hint && <div className="text-[11px] text-slate-500 mt-1">{hint}</div>}
    </div>
  );
}
