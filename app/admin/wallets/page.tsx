"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/page-shell";
import { T, useTr } from "@/components/translator";
import { useLang } from "@/lib/i18n";

const CATS = ["VIDEO", "IMAGE", "TEXT", "AUDIO", "DUBBING", "MUSIC", "SUBTITLE", "DISTRIBUTION"] as const;

type Provider = { id: string; name: string; category: string; isActive: boolean; apiUrl?: string | null; wallet?: Wallet | null; totalSpent?: number; totalCalls?: number };
type Wallet = {
  id: string; availableCredits: number; totalCreditsAdded: number; reservedCredits: number;
  lowBalanceThreshold: number | null; criticalBalanceThreshold: number | null;
};
type Tx = { id: string; transactionType: string; amount: number; unitType: string; description: string | null; createdAt: string };
type LearningSummary = {
  totals: { callCount: number; usdCost: number; inputTokens: number; outputTokens: number; imagesOut: number };
  byEngine: Array<{ engine: string; callCount: number; usdCost: number; tokens: number; imagesOut: number }>;
  byOperation: Array<{ operation: string; callCount: number; usdCost: number }>;
  last7days: Array<{ day: string; usd: number; calls: number }>;
};

export default function BudgetsTokensPage() {
  const lang = useLang();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [learning, setLearning] = useState<LearningSummary | null>(null);
  const [creatingProvider, setCreatingProvider] = useState(false);
  const [providerForm, setProviderForm] = useState({ name: "", category: "VIDEO", apiUrl: "", apiKey: "" });
  const [topup, setTopup] = useState<{ provider: Provider; mode: "add" | "reduce" } | null>(null);
  const [txOpen, setTxOpen] = useState<{ provider: Provider; rows: Tx[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busySync, setBusySync] = useState<string | null>(null);
  const placeholderAmount = useTr("Amount");
  const placeholderNote = useTr("Note (optional)");

  useEffect(() => {
    api<LearningSummary>("/api/v1/learn/tokens-summary").then(setLearning).catch(() => {});
  }, []);

  async function load() {
    try {
      const ps = await api<Provider[]>("/api/v1/providers");
      // Auto-create the three providers we always want visible (Gemini, fal,
      // OpenAI) on first load, so the user sees the full picture even before
      // any spend has been recorded.
      const have = new Set(ps.map((p) => p.name.toLowerCase()));
      const need: { name: string; category: string; apiUrl: string }[] = [];
      if (!have.has("openai")) need.push({ name: "OpenAI", category: "VIDEO", apiUrl: "https://api.openai.com" });
      if (!Array.from(have).some((n) => n.includes("gemini") || n.includes("google"))) need.push({ name: "Google Gemini", category: "TEXT", apiUrl: "https://generativelanguage.googleapis.com" });
      if (!Array.from(have).some((n) => n.includes("fal"))) need.push({ name: "fal.ai", category: "VIDEO", apiUrl: "https://fal.run" });
      for (const p of need) {
        try {
          const created = await api<{ id: string }>("/api/v1/providers", { method: "POST", body: { ...p, isActive: true } });
          await api("/api/v1/finance/wallets", { method: "POST", body: { providerId: created.id, initialCredits: 0, isTrackingEnabled: true } }).catch(() => {});
        } catch { /* probably exists already due to race */ }
      }
      setProviders(need.length > 0 ? await api<Provider[]>("/api/v1/providers") : ps);
    }
    catch (e: unknown) { setErr((e as Error).message); }
  }
  useEffect(() => { load(); }, []);

  async function createProvider(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      const created = await api<{ id: string }>("/api/v1/providers", { method: "POST", body: { ...providerForm, isActive: true } });
      // Auto-create wallet with 0 balance
      try { await api("/api/v1/finance/wallets", { method: "POST", body: { providerId: created.id, initialCredits: 0, isTrackingEnabled: true } }); } catch { /* maybe exists */ }
      setProviderForm({ name: "", category: "VIDEO", apiUrl: "", apiKey: "" });
      setCreatingProvider(false);
      load();
    } catch (e: unknown) { setErr((e as Error).message); }
  }

  async function ensureWallet(p: Provider): Promise<Wallet> {
    if (p.wallet) return p.wallet;
    return await api<Wallet>("/api/v1/finance/wallets", { method: "POST", body: { providerId: p.id, initialCredits: 0, isTrackingEnabled: true } });
  }

  async function adjust(e: React.FormEvent) {
    e.preventDefault();
    if (!topup) return;
    setErr(null);
    const f = e.currentTarget as HTMLFormElement;
    const amount = Number((f.elements.namedItem("amount") as HTMLInputElement).value);
    const description = (f.elements.namedItem("description") as HTMLInputElement).value;
    const unit = (f.elements.namedItem("unit") as HTMLSelectElement).value;
    try {
      const wallet = await ensureWallet(topup.provider);
      await api(`/api/v1/finance/wallets/${wallet.id}/${topup.mode}`, { method: "POST", body: { amount, unitType: unit, description: description || undefined } });
      setTopup(null); load();
    } catch (e: unknown) { setErr((e as Error).message); }
  }

  async function syncProvider(p: Provider) {
    setBusySync(p.id);
    try {
      const r = await api<{ balance: number; usageThisMonth: number; source?: string }>(`/api/v1/providers/${p.id}/sync`, { method: "POST" });
      alert((lang === "he" ? `סונכרן ${p.name}\nיתרה: ` : `Synced ${p.name}\nBalance: `) + `$${r.balance.toFixed(2)}` + (r.usageThisMonth ? `\n${lang === "he" ? "שימוש החודש" : "Usage this month"}: $${r.usageThisMonth.toFixed(2)}` : ""));
      load();
    } catch (e: unknown) { alert((e as Error).message); }
    finally { setBusySync(null); }
  }

  async function showTx(p: Provider) {
    if (!p.wallet) { alert(lang === "he" ? "אין ארנק לספק זה" : "No wallet for this provider"); return; }
    const rows = await api<Tx[]>(`/api/v1/finance/wallets/${p.wallet.id}/transactions`);
    setTxOpen({ provider: p, rows });
  }

  async function disableProvider(p: Provider) {
    if (!confirm(lang === "he" ? `להשבית את ${p.name}?` : `Disable ${p.name}?`)) return;
    try { await api(`/api/v1/providers/${p.id}`, { method: "DELETE" }); load(); }
    catch (e: unknown) { alert((e as Error).message); }
  }

  return (
    <Card title={lang === "he" ? "תקציבים וטוקנים" : "Budgets & Tokens"} subtitle={lang === "he" ? "ניהול ספקי AI ויתרות הקרדיט שלהם — סנכרון, טעינה, היסטוריה" : "Manage AI providers and their credit balances — sync, top up, history"}>
      {err && <div className="text-status-errText text-sm mb-3">{err}</div>}

      {providers.length > 0 && (() => {
        const totalAdded = providers.reduce((s, p) => s + (p.wallet?.totalCreditsAdded ?? 0), 0);
        const totalAvail = providers.reduce((s, p) => s + (p.wallet?.availableCredits ?? 0), 0);
        const providersSpent = providers.reduce((s, p) => s + (p.totalSpent ?? 0), 0);
        const learningSpent = learning?.totals.usdCost ?? 0;
        const unifiedSpent = providersSpent + learningSpent;
        // Math identity: totalCapacity = availableCredits + everything spent
        // initialSeed = totalCapacity - API topups (credits manually seeded, e.g. Google credit topup)
        const totalCapacity = totalAvail + unifiedSpent;
        const initialSeed = Math.max(0, totalCapacity - totalAdded);
        // Available net of learning costs (since learning isn't deducted from any wallet today)
        const availableNet = totalAvail - learningSpent;
        return (
          <>
            {/* Capacity row — the math now adds up: capacity = topups + initial seed; spent comes off that */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="bg-bg-main rounded-lg p-3 text-center">
                <div className="text-[11px] text-text-muted uppercase tracking-wider">{lang === "he" ? "סה״כ קרדיט במערכת" : "Total system credit"}</div>
                <div className="text-2xl font-bold num mt-1 text-slate-900">${totalCapacity.toFixed(2)}</div>
                <div className="text-[10px] text-text-muted mt-1">
                  {lang === "he" ? "API topups" : "API topups"}: ${totalAdded.toFixed(2)}
                  {initialSeed > 0 && <> · {lang === "he" ? "יתרה התחלתית" : "initial seed"}: ${initialSeed.toFixed(2)}</>}
                </div>
              </div>
              <div className="bg-status-okBg rounded-lg p-3 text-center">
                <div className="text-[11px] text-status-okText uppercase tracking-wider">{lang === "he" ? "נשאר אחרי הכל" : "Net available"}</div>
                <div className="text-2xl font-bold num mt-1 text-status-okText">${availableNet.toFixed(2)}</div>
                <div className="text-[10px] text-text-muted mt-1">
                  {lang === "he" ? "ארנק:" : "Wallet:"} ${totalAvail.toFixed(2)} − {lang === "he" ? "למידה:" : "learning:"} ${learningSpent.toFixed(2)}
                </div>
              </div>
              <div className="bg-status-errBg rounded-lg p-3 text-center">
                <div className="text-[11px] text-status-errText uppercase tracking-wider">{lang === "he" ? "ספקים — בוזבז" : "Providers — spent"}</div>
                <div className="text-2xl font-bold num mt-1 text-status-errText">−${providersSpent.toFixed(4)}</div>
                <div className="text-[10px] text-text-muted mt-1">{lang === "he" ? "וידאו · תמונות · TTS" : "video · image · TTS"}</div>
              </div>
              <div className="bg-purple-500/10 rounded-lg p-3 text-center border border-purple-500/30">
                <div className="text-[11px] text-purple-700 uppercase tracking-wider font-semibold">{lang === "he" ? "למידה — בוזבז" : "Learning — spent"}</div>
                <div className="text-2xl font-bold num mt-1 text-purple-700">−${learningSpent.toFixed(4)}</div>
                <div className="text-[10px] text-text-muted mt-1">{learning?.totals.callCount ?? 0} {lang === "he" ? "קריאות AI" : "AI calls"}</div>
              </div>
            </div>

            {/* Unified total — single readable number */}
            <div className="bg-slate-900 border border-cyan-500/40 rounded-lg p-5 mb-4 text-center">
              <div className="text-[11px] text-cyan-300 uppercase tracking-wider font-semibold">{lang === "he" ? "סה״כ הוצאת מערכת (ספקים + למידה)" : "Unified system spend (providers + learning)"}</div>
              <div className="text-5xl font-black num mt-2 text-white" style={{ textShadow: "0 0 18px rgba(34,211,238,0.35)" }}>−${unifiedSpent.toFixed(4)}</div>
              <div className="text-sm text-slate-300 mt-3">
                {lang === "he" ? "ספקים" : "Providers"}: <span className="text-rose-300 font-semibold">${providersSpent.toFixed(4)}</span>
                <span className="mx-2 text-slate-600">+</span>
                {lang === "he" ? "למידה" : "Learning"}: <span className="text-purple-300 font-semibold">${learningSpent.toFixed(4)}</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-2">
                {lang === "he" ? "מתוך קיבולת של" : "Of total capacity"} ${totalCapacity.toFixed(2)} · {Math.round((unifiedSpent / Math.max(totalCapacity, 0.0001)) * 100)}% {lang === "he" ? "נוצל" : "used"}
              </div>
            </div>

            {/* Learning breakdown — only if learning has data */}
            {learning && learning.byEngine.length > 0 && (
              <div className="bg-bg-main rounded-lg p-4 mb-4">
                <div className="text-[11px] text-text-muted uppercase tracking-wider mb-3 font-semibold">
                  💡 {lang === "he" ? "פירוט עלויות למידה (Gemini / Claude / nano-banana)" : "Learning costs breakdown"}
                  {" "}— <a href="/learn/tokens" className="text-cyan-500 hover:underline">{lang === "he" ? "פתח דף תובנות" : "open detailed view"}</a>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {learning.byEngine
                    .filter((e) => e.engine && e.engine !== "unknown" && e.engine !== "other") // never show "לא ידוע"
                    .sort((a, b) => b.usdCost - a.usdCost)
                    .map((e) => (
                      <div key={e.engine} className="bg-white rounded p-2 border border-bg-main">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-semibold capitalize">{e.engine.replace("-", " ")}</span>
                          <span className="text-sm font-bold text-purple-600 num">${e.usdCost.toFixed(4)}</span>
                        </div>
                        <div className="text-[10px] text-text-muted mt-0.5">
                          {e.callCount} {lang === "he" ? "קריאות" : "calls"}
                          {e.tokens > 0 && ` · ${(e.tokens / 1000).toFixed(0)}K tokens`}
                          {e.imagesOut > 0 && ` · ${e.imagesOut} ${lang === "he" ? "תמונות" : "imgs"}`}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </>
        );
      })()}

      <div className="flex justify-between items-center mb-4">
        <span className="text-xs text-text-muted">{providers.length} <T>providers</T></span>
        <button onClick={() => setCreatingProvider(true)} className="px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-semibold">+ <T>Add provider</T></button>
      </div>

      {creatingProvider && (
        <form onSubmit={createProvider} className="bg-bg-main rounded-lg p-4 mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input required placeholder={lang === "he" ? "שם הספק (e.g. fal.ai)" : "Provider name (e.g. fal.ai)"} value={providerForm.name} onChange={(e) => setProviderForm({ ...providerForm, name: e.target.value })} className="px-3 py-2 rounded-lg border border-bg-main bg-white" />
            <select value={providerForm.category} onChange={(e) => setProviderForm({ ...providerForm, category: e.target.value })} className="px-3 py-2 rounded-lg border border-bg-main bg-white">
              {CATS.map((c) => <option key={c}>{c}</option>)}
            </select>
            <input placeholder={lang === "he" ? "API URL (אופציונלי)" : "API URL (optional)"} value={providerForm.apiUrl} onChange={(e) => setProviderForm({ ...providerForm, apiUrl: e.target.value })} className="px-3 py-2 rounded-lg border border-bg-main bg-white" />
            <input placeholder={lang === "he" ? "מפתח API (יוצפן)" : "API key (encrypted)"} value={providerForm.apiKey} onChange={(e) => setProviderForm({ ...providerForm, apiKey: e.target.value })} className="px-3 py-2 rounded-lg border border-bg-main bg-white" />
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold"><T>Create</T></button>
            <button type="button" onClick={() => setCreatingProvider(false)} className="px-4 py-2 rounded-lg border border-bg-main text-sm"><T>Cancel</T></button>
          </div>
        </form>
      )}

      {topup && (
        <form onSubmit={adjust} className="bg-bg-main rounded-lg p-4 mb-4 space-y-3">
          <div className="text-sm font-semibold">
            {topup.mode === "add" ? <T>Top up wallet</T> : <T>Deduct from wallet</T>}: <span className="text-accent">{topup.provider.name}</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <input name="amount" type="number" step="0.01" min="0.01" required placeholder={placeholderAmount} className="px-3 py-2 rounded-lg border border-bg-main bg-white" autoFocus />
            <select name="unit" defaultValue="USD" className="px-3 py-2 rounded-lg border border-bg-main bg-white">
              <option value="USD">USD</option>
              <option value="CREDITS">CREDITS</option>
              <option value="TOKENS">TOKENS</option>
            </select>
            <input name="description" placeholder={placeholderNote} className="px-3 py-2 rounded-lg border border-bg-main bg-white" />
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold">{topup.mode === "add" ? <T>Add</T> : <T>Deduct</T>}</button>
            <button type="button" onClick={() => setTopup(null)} className="px-4 py-2 rounded-lg border border-bg-main text-sm"><T>Cancel</T></button>
          </div>
        </form>
      )}

      {providers.length === 0 ? (
        <div className="text-text-muted text-sm py-8 text-center">
          <div className="text-3xl mb-2">🪙</div>
          <T>No providers yet. Add one to start tracking spend.</T>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-start text-[10px] uppercase tracking-widest text-text-muted">
            <tr className="border-b border-bg-main">
              <th className="py-2 px-3 text-start"><T>Provider</T></th>
              <th className="py-2 text-start text-text-muted"><T>Category</T></th>
              <th className="py-2 text-end"><T>Available</T></th>
              <th className="py-2 text-end">{lang === "he" ? "סה\"כ הוצאה" : "Spent"}</th>
              <th className="py-2 text-end"><T>Total added</T></th>
              <th className="py-2"><T>Status</T></th>
              <th className="pe-3"></th>
            </tr>
          </thead>
          <tbody>
            {providers.map((p) => {
              const w = p.wallet;
              const avail = w?.availableCredits ?? 0;
              const isCrit = w?.criticalBalanceThreshold != null && avail <= w.criticalBalanceThreshold;
              const isLow = !isCrit && w?.lowBalanceThreshold != null && avail <= w.lowBalanceThreshold;
              const status = !w ? "NO WALLET" : isCrit ? "CRITICAL" : isLow ? "LOW" : p.isActive ? "OK" : "INACTIVE";
              const cls = !w ? "bg-bg-main text-text-muted" : isCrit ? "bg-status-errBg text-status-errText" : isLow ? "bg-status-warningBg text-status-warnText" : p.isActive ? "bg-status-okBg text-status-okText" : "bg-bg-main text-text-muted";
              return (
                <tr key={p.id} className={`border-b border-bg-main ${!p.isActive ? "opacity-60" : ""}`}>
                  <td className="py-3 px-3 font-medium">{p.name}</td>
                  <td className="py-3 text-text-muted text-xs">{p.category}</td>
                  <td className="py-3 text-end num">${avail.toFixed(2)}</td>
                  <td className="py-3 text-end num text-status-errText" title={`${p.totalCalls ?? 0} ${lang === "he" ? "פעולות" : "operations"}`}>−${(p.totalSpent ?? 0).toFixed(4)}</td>
                  <td className="py-3 text-end num text-text-muted">${(w?.totalCreditsAdded ?? 0).toFixed(2)}</td>
                  <td className="py-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cls}`}>{status}</span></td>
                  <td className="py-3 pe-3 text-end space-x-2 rtl:space-x-reverse whitespace-nowrap">
                    <button onClick={() => setTopup({ provider: p, mode: "add" })} className="text-xs text-status-okText hover:underline">+ <T>Top up</T></button>
                    {/google|openai|fal/i.test(p.name) && <button disabled={busySync === p.id} onClick={() => syncProvider(p)} className="text-xs text-accent hover:underline disabled:opacity-50">⟳ <T>Sync</T></button>}
                    <button onClick={async () => { try { const r = await api<{ totalSpent: number; newAvailable: number }>(`/api/v1/providers/${p.id}/reconcile`, { method: "POST" }); alert((lang === "he" ? `יושר: סה"כ הוצאה $${r.totalSpent.toFixed(4)}, יתרה חדשה $${r.newAvailable.toFixed(2)}` : `Reconciled: spent $${r.totalSpent.toFixed(4)}, new balance $${r.newAvailable.toFixed(2)}`)); load(); } catch (e) { alert((e as Error).message); } }} className="text-xs text-accent hover:underline">⚖ {lang === "he" ? "השוואה" : "Reconcile"}</button>
                    <button onClick={() => showTx(p)} className="text-xs text-accent hover:underline"><T>History</T></button>
                    {p.isActive && <button onClick={() => disableProvider(p)} className="text-xs text-status-errText hover:underline"><T>Disable</T></button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {txOpen && (
        <div className="mt-6 bg-bg-main rounded-lg p-4">
          <div className="flex justify-between mb-3">
            <div className="font-semibold text-sm"><T>Transactions</T> · {txOpen.provider.name}</div>
            <button onClick={() => setTxOpen(null)} className="text-xs text-text-muted">✕</button>
          </div>
          {txOpen.rows.length === 0 ? <div className="text-text-muted text-sm"><T>No transactions yet.</T></div> : (
            <table className="w-full text-xs">
              <thead><tr className="text-text-muted">
                <th className="text-start py-1"><T>When</T></th>
                <th className="text-start py-1"><T>Type</T></th>
                <th className="text-end py-1"><T>Amount</T></th>
                <th className="text-end py-1"><T>Unit</T></th>
                <th className="text-start py-1"><T>Note</T></th>
              </tr></thead>
              <tbody>
                {txOpen.rows.map((t) => (
                  <tr key={t.id} className="border-t border-bg-card">
                    <td className="py-1 text-text-muted">{new Date(t.createdAt).toLocaleString()}</td>
                    <td className="py-1"><span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${t.transactionType === "ADD" ? "bg-status-okBg text-status-okText" : "bg-status-errBg text-status-errText"}`}>{t.transactionType}</span></td>
                    <td className={`py-1 text-end num font-bold ${t.transactionType === "ADD" ? "text-status-okText" : "text-status-errText"}`}>{t.transactionType === "ADD" ? "+" : "-"}${t.amount.toFixed(2)}</td>
                    <td className="py-1 text-end">{t.unitType}</td>
                    <td className="py-1 text-text-secondary">{t.description ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </Card>
  );
}

type SourceStat = { calls: number; cost: number; in: number; out: number };
function GeminiTextRow() {
  const [data, setData] = useState<{ provider: string; pricingNote: string; totalCost: number; totalCalls: number; inputTokens: number; outputTokens: number; lastUsedAt: string | null; bySource?: { google: SourceStat; fal: SourceStat } } | null>(null);
  const [falBalance, setFalBalance] = useState<number | null>(null);
  const lang = useLang();
  const he = lang === "he";

  useEffect(() => {
    api<typeof data>("/api/v1/finance/text-ai-usage").then(setData).catch(() => {});
    api<{ id: string; name: string; wallet?: { availableCredits: number } | null }[]>("/api/v1/providers").then((ps) => {
      const fal = ps.find((p) => p.name.toLowerCase().includes("fal"));
      setFalBalance(fal?.wallet?.availableCredits ?? null);
    }).catch(() => {});
  }, []);

  // Render even when no usage yet — so the user can see the provider is wired up.
  const d = data ?? { provider: "Gemini 2.5 Flash (paid)", pricingNote: "$0.075 per 1M input · $0.30 per 1M output", totalCost: 0, totalCalls: 0, inputTokens: 0, outputTokens: 0, lastUsedAt: null, bySource: { google: { calls: 0, cost: 0, in: 0, out: 0 }, fal: { calls: 0, cost: 0, in: 0, out: 0 } } };
  const google = d.bySource?.google ?? { calls: 0, cost: 0, in: 0, out: 0 };
  const fal = d.bySource?.fal ?? { calls: 0, cost: 0, in: 0, out: 0 };
  return (
    <div className="bg-bg-main rounded-lg p-3 mb-4 space-y-2">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm flex items-center gap-2">
            <span>🤖 {he ? "Gemini טקסט (בתשלום דרך fal)" : "Gemini text (paid via fal)"}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/15 text-accent">{he ? "בתשלום · ספירה אוטומטית" : "Paid · auto-tracked"}</span>
          </div>
          <div className="text-[11px] text-text-muted mt-0.5">{d.pricingNote}</div>
        </div>
        <div className="text-end shrink-0 text-xs">
          <div className="text-text-muted">{he ? "בוצעו" : "Calls"}</div>
          <div className="font-bold num">{d.totalCalls}</div>
        </div>
        <div className="text-end shrink-0 text-xs">
          <div className="text-text-muted">{he ? "טוקנים" : "Tokens"}</div>
          <div className="font-bold num">{d.inputTokens.toLocaleString()} → {d.outputTokens.toLocaleString()}</div>
        </div>
        <div className="text-end shrink-0 text-xs">
          <div className="text-text-muted">{he ? "סך נוצל" : "Spent"}</div>
          <div className="font-bold num text-status-errText">−${d.totalCost.toFixed(4)}</div>
        </div>
      </div>
      <div className="border-t border-bg-card pt-2 grid grid-cols-2 gap-2 text-xs">
        <div className="bg-bg-card rounded-lg p-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold">{he ? "🔵 Google Gemini ישיר" : "🔵 Google Gemini direct"}</span>
            <span className="num font-bold">${google.cost.toFixed(4)}</span>
          </div>
          <div className="text-[10px] text-text-muted mt-1">{google.calls} {he ? "קריאות · " : "calls · "}{google.in.toLocaleString()} → {google.out.toLocaleString()} {he ? "טוקנים" : "tokens"}</div>
          <div className="text-[10px] text-text-muted">{he ? "מחויב מ-Google Cloud Billing" : "Billed to Google Cloud Billing"}</div>
        </div>
        <div className="bg-bg-card rounded-lg p-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold">{he ? "🟣 Gemini דרך fal" : "🟣 Gemini via fal"}</span>
            <span className="num font-bold">${fal.cost.toFixed(4)}</span>
          </div>
          <div className="text-[10px] text-text-muted mt-1">{fal.calls} {he ? "קריאות · " : "calls · "}{fal.in.toLocaleString()} → {fal.out.toLocaleString()} {he ? "טוקנים" : "tokens"}</div>
          <div className="text-[10px] text-text-muted">{he ? "ירד מארנק fal.ai" : "Deducted from fal.ai wallet"}{falBalance !== null ? ` · ${he ? "יתרה" : "balance"}: $${falBalance.toFixed(2)}` : ""}</div>
        </div>
      </div>
    </div>
  );
}
