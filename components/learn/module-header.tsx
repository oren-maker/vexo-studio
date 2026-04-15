import Link from "next/link";
import { prisma } from "@/lib/learn/db";

export default async function ModuleHeader({
  title,
  operations,
  logsTab,
  extra,
}: {
  title: string;
  operations: string[];
  logsTab?: string;
  extra?: React.ReactNode;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [todayAgg, totalAgg] = await Promise.all([
    prisma.apiUsage.aggregate({
      where: { operation: { in: operations as any }, createdAt: { gte: today } },
      _sum: { usdCost: true },
      _count: true,
    }),
    prisma.apiUsage.aggregate({
      where: { operation: { in: operations as any } },
      _sum: { usdCost: true },
    }),
  ]);
  const todayUsd = todayAgg._sum.usdCost || 0;
  const todayCount = todayAgg._count || 0;
  const totalUsd = totalAgg._sum.usdCost || 0;

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap mb-4 bg-slate-900/40 border border-slate-800 rounded-xl px-4 py-3">
      <div className="flex items-center gap-4 flex-wrap text-xs">
        <span className="text-sm font-semibold text-white">{title}</span>
        <span className="text-amber-300">
          💰 <span className="font-mono">${todayUsd.toFixed(4)}</span>{" "}
          <span className="text-slate-500">היום ({todayCount} פעולות)</span>
        </span>
        <span className="text-emerald-300">
          💵 <span className="font-mono">${totalUsd.toFixed(2)}</span>{" "}
          <span className="text-slate-500">סה&quot;כ</span>
        </span>
        {extra}
      </div>
      {logsTab && (
        <Link
          href={`/learn/logs?tab=${logsTab}`}
          className="text-xs bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 px-3 py-1.5 rounded"
        >
          📂 לוגים
        </Link>
      )}
    </div>
  );
}
