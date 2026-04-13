import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center" style={{ background: "var(--sidebar-bg-gradient)" }}>
      <div className="text-center">
        <h1 className="text-7xl font-bold tracking-tight text-white">
          VEXO <span className="text-accent-cyan">STUDIO</span>
        </h1>
        <p className="mt-4 text-sidebar-text">AI-powered video production platform</p>
        <div className="mt-10 flex gap-4 justify-center">
          <Link href="/login" className="px-6 py-3 rounded-card bg-accent text-white font-semibold hover:bg-accent-light transition">
            Sign in
          </Link>
          <Link href="/admin" className="px-6 py-3 rounded-card border border-sidebar-text/30 text-sidebar-text hover:bg-white/5 transition">
            Admin
          </Link>
        </div>
      </div>
    </main>
  );
}
