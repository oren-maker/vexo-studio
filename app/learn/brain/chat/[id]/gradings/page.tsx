import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/learn/db";

export const dynamic = "force-dynamic";

function verdictBadge(v: string) {
  if (v === "pass") return <span className="inline-block bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded text-xs font-semibold">✓ pass</span>;
  if (v === "fail") return <span className="inline-block bg-red-500/15 text-red-300 border border-red-500/40 px-2 py-0.5 rounded text-xs font-semibold">✗ fail</span>;
  return <span className="inline-block bg-slate-500/15 text-slate-300 border border-slate-500/40 px-2 py-0.5 rounded text-xs font-semibold">— n/a</span>;
}

export default async function ChatGradingsPage({ params }: { params: { id: string } }) {
  const chat = await prisma.brainChat.findUnique({
    where: { id: params.id },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!chat) notFound();

  const gradings = await prisma.brainGrading.findMany({
    where: { chatId: params.id },
    orderBy: { createdAt: "asc" },
  });

  // Group by brainMessageId; within each group sort by attemptNumber
  const byMessage = new Map<string, typeof gradings>();
  for (const g of gradings) {
    const list = byMessage.get(g.brainMessageId) ?? [];
    list.push(g);
    byMessage.set(g.brainMessageId, list);
  }

  const brainMessages = chat.messages.filter((m) => m.role === "brain");

  return (
    <div className="max-w-5xl mx-auto p-4" dir="rtl">
      <div className="mb-5 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-white">⚖️ Gradings · {chat.title || chat.id.slice(-8)}</h1>
          <div className="text-xs text-slate-400 mt-1">
            {gradings.length} grader decisions across {brainMessages.length} brain messages · mode: {chat.brainMode}
          </div>
        </div>
        <div className="flex gap-2 text-xs">
          <Link href={`/learn/brain/chat/${params.id}`} className="text-cyan-400 hover:underline">← חזרה לשיחה</Link>
          <Link href="/learn/brain/chat/logs" className="text-slate-400 hover:text-cyan-300">כל הלוגים ←</Link>
        </div>
      </div>

      {brainMessages.length === 0 ? (
        <div className="text-center text-slate-400 py-12 border border-slate-800 rounded-xl">
          אין עדיין הודעות מוח בשיחה הזאת
        </div>
      ) : (
        <div className="space-y-4">
          {brainMessages.map((msg) => {
            const chain = byMessage.get(msg.id) ?? [];
            return (
              <div key={msg.id} className="border border-slate-800 rounded-xl bg-slate-900/50 p-4">
                <div className="text-xs text-slate-500 mb-2">
                  brain message · {msg.createdAt.toLocaleString("he-IL")}
                </div>
                <div className="text-sm text-slate-200 mb-3 line-clamp-3 whitespace-pre-wrap">{msg.content.slice(0, 400)}{msg.content.length > 400 ? "..." : ""}</div>
                {chain.length === 0 ? (
                  <div className="text-xs text-slate-500 italic">לא רץ grader (brain-mode=obsidian? הודעה קצרה? אין RAG hits?)</div>
                ) : (
                  <div className="space-y-2">
                    {chain.map((g) => (
                      <div key={g.id} className="bg-slate-950/60 border border-slate-800 rounded p-3">
                        <div className="flex items-center gap-2 flex-wrap mb-1.5">
                          <span className="text-xs font-mono text-slate-400">ניסיון {g.attemptNumber}</span>
                          {verdictBadge(g.verdict)}
                          <span className="text-[10px] text-slate-500">
                            {g.ragSourceCount} sources · {g.graderLatencyMs ?? "?"}ms · ${g.graderCostUsd.toFixed(5)}
                          </span>
                        </div>
                        <div className="text-xs text-slate-300 mb-1">{g.reasoning}</div>
                        {g.rewrittenQuestion && (
                          <div className="text-[11px] text-amber-300 bg-amber-500/5 border-l-2 border-amber-500/40 pl-2 py-1 mt-1.5">
                            <span className="opacity-70">שאלה משוכתבת:</span> {g.rewrittenQuestion}
                          </div>
                        )}
                        {g.answerSnippet && (
                          <details className="mt-1.5 text-[10px] text-slate-500">
                            <summary className="cursor-pointer hover:text-slate-300">snippet של התשובה שנבדקה</summary>
                            <pre className="mt-1 whitespace-pre-wrap bg-slate-900 p-2 rounded">{g.answerSnippet}</pre>
                          </details>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
