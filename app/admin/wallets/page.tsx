"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/page-shell";
import { T, useTr } from "@/components/translator";
import { useLang } from "@/lib/i18n";

const CATS = ["VIDEO", "IMAGE", "AUDIO", "DUBBING", "MUSIC", "SUBTITLE", "DISTRIBUTION"] as const;

type Provider = { id: string; name: string; category: string; isActive: boolean; apiUrl?: string | null; wallet?: Wallet | null };
type Wallet = {
  id: string; availableCredits: number; totalCreditsAdded: number; reservedCredits: number;
  lowBalanceThreshold: number | null; criticalBalanceThreshold: number | null;
};
type Tx = { id: string; transactionType: string; amount: number; unitType: string; description: string | null; createdAt: string };

export default function BudgetsTokensPage() {
  const lang = useLang();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [creatingProvider, setCreatingProvider] = useState(false);
  const [providerForm, setProviderForm] = useState({ name: "", category: "VIDEO", apiUrl: "", apiKey: "" });
  const [topup, setTopup] = useState<{ provider: Provider; mode: "add" | "reduce" } | null>(null);
  const [txOpen, setTxOpen] = useState<{ provider: Provider; rows: Tx[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busySync, setBusySync] = useState<string | null>(null);
  const placeholderAmount = useTr("Amount");
  const placeholderNote = useTr("Note (optional)");

  async function load() {
    try { setProviders(await api<Provider[]>("/api/v1/providers")); }
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

      <GeminiTextRow />


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
              <option>USD</option><option>CREDITS</option><option>TOKENS</option>
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
          <thead className="text-start text-[11px] uppercase tracking-widest text-text-muted">
            <tr className="border-b border-bg-main">
              <th className="py-2 text-start"><T>Provider</T></th>
              <th className="py-2 text-start"><T>Category</T></th>
              <th className="py-2 text-end"><T>Available</T></th>
              <th className="py-2 text-end"><T>Reserved</T></th>
              <th className="py-2 text-end"><T>Total added</T></th>
              <th className="py-2"><T>Status</T></th>
              <th></th>
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
                  <td className="py-3 font-medium">{p.name}</td>
                  <td className="py-3 text-xs"><T>{p.category}</T></td>
                  <td className="py-3 text-end num">${avail.toFixed(2)}</td>
                  <td className="py-3 text-end num text-text-muted">${(w?.reservedCredits ?? 0).toFixed(2)}</td>
                  <td className="py-3 text-end num text-text-muted">${(w?.totalCreditsAdded ?? 0).toFixed(2)}</td>
                  <td className="py-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cls}`}>{status}</span></td>
                  <td className="py-3 text-end space-x-2 rtl:space-x-reverse whitespace-nowrap">
                    <button disabled={busySync === p.id} onClick={() => syncProvider(p)} className="text-xs text-accent hover:underline disabled:opacity-50">⟳ <T>Sync</T></button>
                    <button onClick={() => setTopup({ provider: p, mode: "add" })} className="text-xs text-status-okText hover:underline">+ <T>Top up</T></button>
                    <button onClick={() => setTopup({ provider: p, mode: "reduce" })} className="text-xs text-status-errText hover:underline">- <T>Deduct</T></button>
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
