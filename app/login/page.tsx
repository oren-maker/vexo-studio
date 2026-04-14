"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, setAccessToken } from "@/lib/api";

type LoginResp =
  | { accessToken: string; refreshToken: string; requires2faSetup?: boolean }
  | { requiresTotpChallenge: true; challengeId: string };

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@vexo.studio");
  const [password, setPassword] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [totp, setTotp] = useState("");
  const [remember, setRemember] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      if (challengeId) {
        const data = await api<{ accessToken: string }>("/api/v1/auth/2fa/challenge", {
          method: "POST",
          body: { challengeId, token: totp },
        });
        setAccessToken(data.accessToken, remember);
        router.push("/admin");
        return;
      }
      const data = await api<LoginResp>("/api/v1/auth/login", {
        method: "POST",
        body: { email, password },
      });
      if ("requiresTotpChallenge" in data && data.requiresTotpChallenge) {
        setChallengeId(data.challengeId);
      } else if ("accessToken" in data) {
        setAccessToken(data.accessToken, remember);
        router.push("/admin");
      }
    } catch (e: unknown) {
      setErr((e as Error).message ?? "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen grid place-items-center" style={{ background: "var(--sidebar-bg-gradient)" }}>
      <form onSubmit={submit} className="bg-white rounded-card shadow-card p-8 w-[380px]">
        <h1 className="text-2xl font-bold mb-1">VEXO <span className="text-accent">STUDIO</span></h1>
        <p className="text-text-secondary text-sm mb-6">{challengeId ? "Enter your 6-digit code" : "Sign in to continue"}</p>

        {!challengeId ? (
          <>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-bg-main mb-3" autoComplete="username" />
            <label className="block text-sm font-medium mb-1">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-bg-main mb-4" autoComplete="current-password" required />
          </>
        ) : (
          <>
            <label className="block text-sm font-medium mb-1">Authenticator code</label>
            <input value={totp} onChange={(e) => setTotp(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="123456" inputMode="numeric" pattern="[0-9]{6}" required className="w-full px-3 py-2 rounded-lg border border-bg-main mb-4 text-center text-2xl tracking-widest font-mono" autoFocus />
          </>
        )}

        {!challengeId && (
          <label className="flex items-center gap-2 text-sm text-text-secondary mb-4 cursor-pointer select-none">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="accent-accent" />
            זכור אותי למשך 30 יום
          </label>
        )}
        {err && <div className="text-status-errText text-sm mb-3">{err}</div>}
        <button disabled={busy} className="w-full py-2 rounded-lg bg-accent text-white font-semibold hover:bg-accent-light disabled:opacity-50">{busy ? "Working…" : challengeId ? "Verify" : "Sign in"}</button>
        {challengeId && (
          <button type="button" onClick={() => { setChallengeId(null); setTotp(""); }} className="w-full mt-2 py-2 rounded-lg border border-bg-main text-text-secondary text-sm">Back</button>
        )}
      </form>
    </main>
  );
}
