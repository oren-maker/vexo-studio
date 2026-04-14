"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { useMe } from "@/components/auth-guard";
import { Card } from "@/components/page-shell";

export default function TwoFactorPage() {
  const { me } = useMe();
  const [setup, setSetup] = useState<{ secret: string; otpauth: string; qrDataUrl: string } | null>(null);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const enabled = me?.user?.totpEnabled;

  async function start() {
    setErr(null); setMsg(null);
    try { setSetup(await api("/api/v1/auth/2fa/setup", { method: "POST" })); } catch (e: unknown) { setErr((e as Error).message); }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await api("/api/v1/auth/2fa/verify", { method: "POST", body: { token: code } });
      setMsg("2FA enabled — sign out and sign back in to use it.");
      setSetup(null); setCode("");
    } catch (e: unknown) { setErr((e as Error).message); }
  }

  return (
    <Card title="Two-Factor Authentication" subtitle="Adds a one-time code from an authenticator app to your sign-in.">
      <div className="rounded-lg p-4 mb-6 text-sm" style={{ background: "#eef2ff", border: "1px solid #818cf8" }}>
        Optional. Recommended for any account with admin permissions.
      </div>

      {msg && <div className="text-status-okText text-sm mb-3">{msg}</div>}
      {err && <div className="text-status-errText text-sm mb-3">{err}</div>}

      {enabled && !setup ? (
        <div className="text-sm text-status-okText flex items-center gap-2"><span>✓</span><span>2FA is enabled.</span></div>
      ) : !setup ? (
        <button onClick={start} className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold">Set up 2FA</button>
      ) : (
        <div className="space-y-4">
          <div>
            <div className="text-sm font-semibold mb-2">1. Scan this QR with your authenticator</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={setup.qrDataUrl} alt="QR" className="w-44 h-44 border border-bg-main rounded" />
            <div className="text-xs text-text-muted mt-2">Or enter manually: <code className="bg-bg-main px-2 py-0.5 rounded font-mono">{setup.secret}</code></div>
          </div>
          <form onSubmit={verify} className="space-y-2">
            <div className="text-sm font-semibold">2. Enter the 6-digit code from your app</div>
            <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} pattern="[0-9]{6}" required placeholder="123456" className="w-44 px-3 py-2 rounded-lg border border-bg-main text-center text-2xl tracking-widest font-mono" autoFocus />
            <div><button className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold">Verify & enable</button></div>
          </form>
        </div>
      )}
    </Card>
  );
}
