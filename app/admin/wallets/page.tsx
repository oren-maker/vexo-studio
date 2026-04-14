"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/page-shell";
import { T, useTr } from "@/components/translator";

type Provider = { id: string; name: string; category: string; isActive: boolean };
type Wallet = {
  id: string; availableCredits: number; totalCreditsAdded: number; reservedCredits: number;
  lowBalanceThreshold: number | null; criticalBalanceThreshold: number | null;
  provider: { id: string; name: string; category: string };
};
type Tx = { id: string; transactionType: string; amount: number; unitType: string; description: string | null; createdAt: string };

export default function WalletsPage() {
  const [items, setItems] = useState<Wallet[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [creating, setCreating] = useState(false);
  const [topup, setTopup] = useState<{ wallet: Wallet; mode: "add" | "reduce" } | null>(null);
  const [txOpen, setTxOpen] = useState<{ wallet: Wallet; rows: Tx[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const placeholderAmount = useTr("Amount");
  const placeholderNote = useTr("Note (optional)");

  async function load() {
    try {
      setItems(await api<Wallet[]>("/api/v1/finance/wallets"));
      setProviders(await api<Provider[]>("/api/v1/providers"));
    } catch (e: unknown) { setErr((e as Error).message); }
  }
  useEffect(() => { load(); }, []);

  const providersWithoutWallet = providers.filter((p) => p.isActive && !items.some((w) => w.provider.id === p.id));

  async function createWallet(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const f = e.currentTarget as HTMLFormElement;
    const providerId = (f.elements.namedItem("providerId") as HTMLSelectElement).value;
    const initial = Number((f.elements.namedItem("initial") as HTMLInputElement).value || 0);
    const low = Number((f.elements.namedItem("low") as HTMLInputElement).value || 0);
    const crit = Number((f.elements.namedItem("crit") as HTMLInputElement).value || 0);
    try {
      await api("/api/v1/finance/wallets", {
        method: "POST",
        body: { providerId, initialCredits: initial, lowBalanceThreshold: low > 0 ? low : undefined, criticalBalanceThreshold: crit > 0 ? crit : undefined, isTrackingEnabled: true },
      });
      setCreating(false); load();
    } catch (e: unknown) { setErr((e as Error).message); }
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
      await api(`/api/v1/finance/wallets/${topup.wallet.id}/${topup.mode}`, { method: "POST", body: { amount, unitType: unit, description: description || undefined } });
      setTopup(null); load();
    } catch (e: unknown) { setErr((e as Error).message); }
  }

  async function showTx(w: Wallet) {
    const rows = await api<Tx[]>(`/api/v1/finance/wallets/${w.id}/transactions`);
    setTxOpen({ wallet: w, rows });
  }

  return (
    <Card title="Budgets & Wallets" subtitle="Per-provider credit balances. Top up, deduct, view transaction history.">
      {err && <div className="text-status-errText text-sm mb-3">{err}</div>}

      <div className="flex justify-between items-center mb-4">
        <span className="text-xs text-text-muted">{items.length} <T>wallets</T></span>
        <button
          onClick={() => setCreating(true)}
          disabled={providersWithoutWallet.length === 0}
          className="px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50"
          title={providersWithoutWallet.length === 0 ? "All active providers already have wallets" : ""}
        >+ <T>Create wallet</T></button>
      </div>

      {creating && (
        <form onSubmit={createWallet} className="bg-bg-main rounded-lg p-4 mb-4 space-y-3">
          {providersWithoutWallet.length === 0 ? (
            <div className="text-sm text-text-muted"><T>No providers available. Create a provider first.</T></div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                  <span className="block text-xs text-text-muted mb-1"><T>Provider</T></span>
                  <select name="providerId" required className="w-full px-3 py-2 rounded-lg border border-bg-main bg-white">
                    {providersWithoutWallet.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.category})</option>)}
                  </select>
                </label>
                <label className="text-sm">
                  <span className="block text-xs text-text-muted mb-1"><T>Initial credits</T></span>
                  <input name="initial" type="number" step="0.01" min="0" defaultValue="0" className="w-full px-3 py-2 rounded-lg border border-bg-main bg-white" />
                </label>
                <label className="text-sm">
                  <span className="block text-xs text-text-muted mb-1"><T>Low balance threshold</T></span>
                  <input name="low" type="number" step="0.01" min="0" placeholder="0" className="w-full px-3 py-2 rounded-lg border border-bg-main bg-white" />
                </label>
                <label className="text-sm">
                  <span className="block text-xs text-text-muted mb-1"><T>Critical balance threshold</T></span>
                  <input name="crit" type="number" step="0.01" min="0" placeholder="0" className="w-full px-3 py-2 rounded-lg border border-bg-main bg-white" />
                </label>
              </div>
              <div className="flex gap-2">
                <button className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold"><T>Create</T></button>
                <button type="button" onClick={() => setCreating(false)} className="px-4 py-2 rounded-lg border border-bg-main text-sm"><T>Cancel</T></button>
              </div>
            </>
          )}
        </form>
      )}

      {topup && (
        <form onSubmit={adjust} className="bg-bg-main rounded-lg p-4 mb-4 space-y-3">
          <div className="text-sm font-semibold">
            {topup.mode === "add" ? <T>Top up wallet</T> : <T>Deduct from wallet</T>}: <span className="text-accent">{topup.wallet.provider.name}</span>
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

      {items.length === 0 ? (
        <div className="text-text-muted text-sm py-8 text-center">
          <div className="text-3xl mb-2">🪙</div>
          <T>No wallets yet. Create a provider, then create a wallet to track spend.</T>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-start text-[11px] uppercase tracking-widest text-text-muted">
            <tr className="border-b border-bg-main">
              <th className="py-2 text-start"><T>Provider</T></th>
              <th className="py-2 text-start"><T>Category</T></th>
              <th className="py-2 text-end"><T>Available</T></th>
              <th className="py-2 text-end"><T>Reserved</T></th>
              <th className="py-2 text-end"><T>Added</T></th>
              <th className="py-2"><T>Status</T></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((w) => {
              const isCrit = w.criticalBalanceThreshold != null && w.availableCredits <= w.criticalBalanceThreshold;
              const isLow = !isCrit && w.lowBalanceThreshold != null && w.availableCredits <= w.lowBalanceThreshold;
              const status = isCrit ? "CRITICAL" : isLow ? "LOW" : "OK";
              const cls = isCrit ? "bg-status-errBg text-status-errText" : isLow ? "bg-status-warningBg text-status-warnText" : "bg-status-okBg text-status-okText";
              return (
                <tr key={w.id} className="border-b border-bg-main">
                  <td className="py-3 font-medium">{w.provider.name}</td>
                  <td className="py-3 text-xs"><T>{w.provider.category}</T></td>
                  <td className="py-3 text-end num">{w.availableCredits.toFixed(2)}</td>
                  <td className="py-3 text-end num text-text-muted">{w.reservedCredits.toFixed(2)}</td>
                  <td className="py-3 text-end num text-text-muted">{w.totalCreditsAdded.toFixed(2)}</td>
                  <td className="py-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cls}`}>{status}</span></td>
                  <td className="py-3 text-end space-x-2 rtl:space-x-reverse whitespace-nowrap">
                    <button onClick={() => setTopup({ wallet: w, mode: "add" })} className="text-xs text-status-okText hover:underline">+ <T>Top up</T></button>
                    <button onClick={() => setTopup({ wallet: w, mode: "reduce" })} className="text-xs text-status-errText hover:underline">- <T>Deduct</T></button>
                    <button onClick={() => showTx(w)} className="text-xs text-accent hover:underline"><T>History</T></button>
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
            <div className="font-semibold text-sm"><T>Transactions</T> · {txOpen.wallet.provider.name}</div>
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
                    <td className={`py-1 text-end num font-bold ${t.transactionType === "ADD" ? "text-status-okText" : "text-status-errText"}`}>{t.transactionType === "ADD" ? "+" : "-"}{t.amount.toFixed(2)}</td>
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
