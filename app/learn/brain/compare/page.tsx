"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { learnFetch } from "@/lib/learn/fetch";
import { adminHeaders } from "@/lib/learn/admin-key";
import { MarkdownInline } from "@/components/learn/markdown-inline";

// Side-by-side comparison of both brains answering the same question.
// Fires two parallel POSTs, times each independently, renders both panels.
// Chats are saved with brainMode so they show up in the logs filter.

type Turn = {
  id: string;
  question: string;
  vexo?: { text: string; ms: number; chatId?: string; error?: string };
  obsidian?: { text: string; ms: number; chatId?: string; error?: string };
};

export default function CompareBrainsPage() {
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [vexoChatId, setVexoChatId] = useState<string | null>(null);
  const [obsidianChatId, setObsidianChatId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [turns]);

  async function askBoth() {
    const q = input.trim();
    if (!q || busy) return;
    setBusy(true);
    setInput("");
    const turnId = `t-${Date.now()}`;
    setTurns((ts) => [...ts, { id: turnId, question: q }]);

    async function hit(mode: "vexo" | "obsidian", chatId: string | null) {
      const started = Date.now();
      try {
        const res = await learnFetch("/api/v1/learn/brain/chat", {
          method: "POST",
          headers: adminHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({ message: q, chatId: chatId ?? undefined, brainMode: mode }),
        });
        const data = await res.json();
        const ms = Date.now() - started;
        if (!res.ok) return { text: "", ms, error: data?.error || `HTTP ${res.status}` };
        return { text: String(data.reply ?? ""), ms, chatId: data.chatId as string | undefined };
      } catch (e) {
        return { text: "", ms: Date.now() - started, error: (e as Error).message };
      }
    }

    const [vexoRes, obsidianRes] = await Promise.all([
      hit("vexo", vexoChatId),
      hit("obsidian", obsidianChatId),
    ]);
    if (vexoRes.chatId) setVexoChatId(vexoRes.chatId);
    if (obsidianRes.chatId) setObsidianChatId(obsidianRes.chatId);

    setTurns((ts) => ts.map((t) => t.id === turnId ? { ...t, vexo: vexoRes, obsidian: obsidianRes } : t));
    setBusy(false);
  }

  function resetChats() {
    setTurns([]); setVexoChatId(null); setObsidianChatId(null);
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4" dir="rtl">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">⚖️ השוואת מוחות</h1>
          <p className="text-sm text-slate-400 mt-1">שאלה אחת → שתי תשובות, זמן תגובה לכל אחד. שני המוחות רצים על Gemini 3 Flash, אותו LLM.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={resetChats} className="text-xs px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200">✨ שיחה חדשה</button>
          <Link href="/learn/brain/chat/logs" className="text-xs px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300">📂 לוגים</Link>
        </div>
      </header>

      {turns.length === 0 && (
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-8 text-center text-sm text-slate-400">
          כתוב שאלה למטה ותקבל שתי תשובות בו-זמנית.
        </div>
      )}

      {turns.map((t) => (
        <div key={t.id} className="space-y-3">
          {/* User question — centered */}
          <div className="flex justify-center">
            <div className="max-w-[80%] bg-slate-800 border border-slate-700 rounded-2xl px-4 py-2 text-sm text-slate-100">
              {t.question}
            </div>
          </div>

          {/* Two panels */}
          <div className="grid md:grid-cols-2 gap-3">
            <Panel label="🎬 Vexo brain" color="cyan" res={t.vexo} href={t.vexo?.chatId ? `/learn/brain/chat?id=${t.vexo.chatId}&mode=vexo` : undefined} />
            <Panel label="📓 Obsidian brain" color="purple" res={t.obsidian} href={t.obsidian?.chatId ? `/learn/brain/chat?id=${t.obsidian.chatId}&mode=obsidian` : undefined} />
          </div>
        </div>
      ))}

      <div ref={endRef} />

      <div className="sticky bottom-4 bg-slate-900 border border-slate-700 rounded-xl p-3 flex gap-2 items-end">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); askBoth(); } }}
          placeholder="שאל את שני המוחות בו-זמנית... (Enter לשליחה)"
          rows={2}
          className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 resize-none outline-none"
          disabled={busy}
        />
        <button onClick={askBoth} disabled={busy || !input.trim()} className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold px-5 py-2 rounded-lg text-sm">
          {busy ? "חושב..." : "שלח לשניהם"}
        </button>
      </div>
    </div>
  );
}

function Panel({ label, color, res, href }: { label: string; color: "cyan" | "purple"; res?: Turn["vexo"]; href?: string }) {
  const borderClass = color === "cyan" ? "border-cyan-500/30" : "border-purple-500/30";
  const labelClass = color === "cyan" ? "text-cyan-300" : "text-purple-300";
  return (
    <div className={`bg-slate-900/40 border ${borderClass} rounded-xl p-4`}>
      <div className="flex items-center justify-between mb-2">
        <div className={`text-xs font-bold ${labelClass}`}>{label}</div>
        {res && <div className="text-[10px] text-slate-400 font-mono">{(res.ms / 1000).toFixed(2)}s</div>}
      </div>
      {!res ? (
        <div className="text-sm text-slate-500 italic">חושב...</div>
      ) : res.error ? (
        <div className="text-xs text-rose-300">⚠ {res.error}</div>
      ) : (
        <div className="text-sm text-slate-100 leading-relaxed">
          <MarkdownInline text={res.text} />
        </div>
      )}
      {href && (
        <Link href={href} className="text-[10px] text-slate-500 hover:text-slate-300 mt-2 inline-block">
          המשך בשיחה נפרדת ←
        </Link>
      )}
    </div>
  );
}
