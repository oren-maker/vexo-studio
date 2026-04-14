"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/page-shell";

type Wallet = {
  id: string; availableCredits: number; totalCreditsAdded: number; reservedCredits: number;
  lowBalanceThreshold: number | null; criticalBalanceThreshold: number | null;
  provider: { id: string; name: string; category: string };
};

export default function WalletsPage() {
  const [items, setItems] = useState<Wallet[]>([]);
  useEffect(() => { api<Wallet[]>("/api/v1/finance/wallets").then(setItems).catch(() => {}); }, []);

  return (
    <Card title="Budgets & Wallets" subtitle="Per-provider credit balances">
      {items.length === 0 ? (
        <div className="text-text-muted text-sm">No wallets yet. Create a provider, then attach a wallet to track spend.</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-widest text-text-muted">
            <tr className="border-b border-bg-main">
              <th className="py-2">Provider</th><th className="py-2">Category</th><th className="py-2 text-right">Available</th>
              <th className="py-2 text-right">Reserved</th><th className="py-2 text-right">Added</th><th className="py-2">Status</th>
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
                  <td className="py-3 text-xs">{w.provider.category}</td>
                  <td className="py-3 text-right num">{w.availableCredits.toFixed(2)}</td>
                  <td className="py-3 text-right num text-text-muted">{w.reservedCredits.toFixed(2)}</td>
                  <td className="py-3 text-right num text-text-muted">{w.totalCreditsAdded.toFixed(2)}</td>
                  <td className="py-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cls}`}>{status}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Card>
  );
}
