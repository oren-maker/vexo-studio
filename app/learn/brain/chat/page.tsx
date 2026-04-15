import Link from "next/link";
import BrainChatUI from "@/components/learn/brain/brain-chat-ui";

export const dynamic = "force-dynamic";

export default function BrainChatPage({ searchParams }: { searchParams: { id?: string } }) {
  return (
    <div className="max-w-4xl mx-auto">
      <header className="mb-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/learn/brain" className="text-xs text-slate-400 hover:text-cyan-400">← חזרה למוח</Link>
          <h1 className="text-3xl font-bold text-white mt-1">💬 דבר עם המוח</h1>
          <p className="text-sm text-slate-400 mt-1">
            שאל שאלות, תן משוב, או הצע כיוונים. כל שיחה נשמרת והמוח יקרא אותן בדוח היומי.
          </p>
        </div>
      </header>
      <BrainChatUI initialChatId={searchParams.id} />
    </div>
  );
}
