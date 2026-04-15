import Link from "next/link";
import { prisma } from "@/lib/learn/db";

export default async function ConnectedSystemsBanner() {
  const [snapshots, prompts, guides, nodes] = await Promise.all([
    prisma.insightsSnapshot.count(),
    prisma.learnSource.count(),
    prisma.guide.count(),
    prisma.knowledgeNode.count(),
  ]);

  return (
    <div className="bg-gradient-to-r from-cyan-500/5 via-purple-500/5 to-pink-500/5 border border-slate-700 rounded-xl p-4 mb-6">
      <div className="text-[10px] uppercase text-slate-400 mb-3 font-semibold flex items-center gap-2">
        🔗 המערכות שמזינות את המוח
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Link href="/learn/consciousness" className="bg-slate-900/60 hover:bg-slate-900/90 border border-amber-500/30 hover:border-amber-500/60 rounded-lg p-3 transition group">
          <div className="text-xs text-amber-300 font-bold mb-1 flex items-center gap-1">
            👁 תודעה
            <span className="text-[9px] text-slate-500 group-hover:text-slate-300">→</span>
          </div>
          <div className="text-2xl font-black text-white">{snapshots.toLocaleString()}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">snapshots שעתיים</div>
        </Link>

        <Link href="/learn/sources" className="bg-slate-900/60 hover:bg-slate-900/90 border border-cyan-500/30 hover:border-cyan-500/60 rounded-lg p-3 transition group">
          <div className="text-xs text-cyan-300 font-bold mb-1 flex items-center gap-1">
            📚 פרומפטים
            <span className="text-[9px] text-slate-500 group-hover:text-slate-300">→</span>
          </div>
          <div className="text-2xl font-black text-white">{prompts.toLocaleString()}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">זיכרון מנותח</div>
        </Link>

        <Link href="/guides" className="bg-slate-900/60 hover:bg-slate-900/90 border border-purple-500/30 hover:border-purple-500/60 rounded-lg p-3 transition group">
          <div className="text-xs text-purple-300 font-bold mb-1 flex items-center gap-1">
            📖 מדריכים
            <span className="text-[9px] text-slate-500 group-hover:text-slate-300">→</span>
          </div>
          <div className="text-2xl font-black text-white">{guides.toLocaleString()}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">ידע מובנה</div>
        </Link>

        <Link href="/learn/knowledge" className="bg-slate-900/60 hover:bg-slate-900/90 border border-emerald-500/30 hover:border-emerald-500/60 rounded-lg p-3 transition group">
          <div className="text-xs text-emerald-300 font-bold mb-1 flex items-center gap-1">
            💡 Knowledge
            <span className="text-[9px] text-slate-500 group-hover:text-slate-300">→</span>
          </div>
          <div className="text-2xl font-black text-white">{nodes.toLocaleString()}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">nodes ל-Director</div>
        </Link>
      </div>
      <div className="text-[10px] text-slate-500 mt-3 text-center">
        המוח קורא כל יום ב-01:00 את המערכות הללו ומחבר זהות יומית עם Gemini 2.5 Pro
      </div>
    </div>
  );
}
