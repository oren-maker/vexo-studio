"use client";
import { useState } from "react";
import { api } from "@/lib/api";

type Mode = "generate" | "check";

export function AiAssistant() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("generate");
  const [prompt, setPrompt] = useState("");
  const [criteria, setCriteria] = useState("Clarity, narrative flow, character motivation");
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setBusy(true); setErr(null); setOut(null);
    try {
      if (mode === "generate") {
        const r = await api<{ content: string }>("/api/v1/ai/generate", { method: "POST", body: { prompt } });
        setOut(r.content);
      } else {
        const r = await api<{ score: number; issues: string[]; suggestions: string[] }>("/api/v1/ai/check", { method: "POST", body: { text: prompt, criteria } });
        setOut(`Score: ${(r.score * 100).toFixed(0)}%\n\nIssues:\n- ${r.issues.join("\n- ") || "none"}\n\nSuggestions:\n- ${r.suggestions.join("\n- ") || "none"}`);
      }
    } catch (e: unknown) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-accent text-white text-2xl shadow-card hover:bg-accent-light flex items-center justify-center z-20"
        aria-label="Open AI Assistant"
        title="AI Assistant (Groq)"
      >
        ✨
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/50 z-30 flex items-end justify-end p-6">
          <div className="bg-bg-card rounded-card shadow-card border border-bg-main w-full max-w-md flex flex-col" style={{ maxHeight: "80vh" }}>
            <div className="px-5 py-3 border-b border-bg-main flex items-center justify-between">
              <div>
                <div className="font-semibold">AI Assistant</div>
                <div className="text-[11px] text-text-muted">Powered by Groq · Llama 3.3 70B</div>
              </div>
              <button onClick={() => setOpen(false)} className="text-text-muted hover:text-text-primary">✕</button>
            </div>
            <div className="px-5 py-3 border-b border-bg-main flex gap-1 text-sm">
              <button onClick={() => setMode("generate")} className={`px-3 py-1 rounded-lg ${mode === "generate" ? "bg-accent text-white" : "bg-bg-main"}`}>Generate</button>
              <button onClick={() => setMode("check")} className={`px-3 py-1 rounded-lg ${mode === "check" ? "bg-accent text-white" : "bg-bg-main"}`}>Check</button>
            </div>
            <div className="px-5 py-4 flex-1 overflow-y-auto">
              <label className="block text-xs uppercase tracking-widest text-text-muted mb-1">{mode === "generate" ? "Prompt" : "Text to evaluate"}</label>
              <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} placeholder={mode === "generate" ? "Write 3 catchy episode titles about…" : "Paste a script, description or comment to score"} className="w-full px-3 py-2 rounded-lg border border-bg-main text-sm" />
              {mode === "check" && (
                <>
                  <label className="block text-xs uppercase tracking-widest text-text-muted mb-1 mt-3">Criteria</label>
                  <input value={criteria} onChange={(e) => setCriteria(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-bg-main text-sm" />
                </>
              )}
              <button disabled={busy || !prompt.trim()} onClick={run} className="mt-3 w-full px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50">
                {busy ? "Working…" : mode === "generate" ? "Generate" : "Evaluate"}
              </button>
              {err && <div className="mt-3 text-status-errText text-xs">{err}</div>}
              {out && (
                <div className="mt-4 bg-bg-main rounded-lg p-3 text-sm whitespace-pre-wrap font-mono">{out}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
