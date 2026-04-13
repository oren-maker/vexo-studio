"use client";
import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("admin@vexo.studio");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
    const res = await fetch(`${apiBase}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      setErr("Invalid credentials");
      return;
    }
    const data = await res.json();
    document.cookie = `vexo_at=${data.accessToken}; path=/`;
    window.location.href = "/admin";
  }

  return (
    <main className="min-h-screen grid place-items-center" style={{ background: "var(--sidebar-bg-gradient)" }}>
      <form onSubmit={submit} className="bg-white rounded-card shadow-card p-8 w-[380px]">
        <h1 className="text-2xl font-bold mb-1">VEXO <span className="text-accent">STUDIO</span></h1>
        <p className="text-text-secondary text-sm mb-6">Sign in to continue</p>
        <label className="block text-sm font-medium mb-1">Email</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-bg-main mb-3" />
        <label className="block text-sm font-medium mb-1">Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-bg-main mb-4" />
        {err && <div className="text-status-errText text-sm mb-3">{err}</div>}
        <button className="w-full py-2 rounded-lg bg-accent text-white font-semibold hover:bg-accent-light transition">Sign in</button>
      </form>
    </main>
  );
}
