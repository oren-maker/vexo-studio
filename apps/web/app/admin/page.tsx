function Kpi({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-bg-card rounded-card shadow-card p-5 border border-bg-main">
      <div className="text-xs uppercase tracking-widest text-text-muted">{label}</div>
      <div className="mt-2 text-3xl font-bold num" style={{ color }}>{value}</div>
    </div>
  );
}

export default function AdminDashboard() {
  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Kpi label="Total cost" value="$0" color="#e03a4e" />
        <Kpi label="Total revenue" value="$0" color="#1db868" />
        <Kpi label="Net profit" value="$0" color="#0091d4" />
        <Kpi label="Active projects" value="0" color="#1a2540" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-bg-card rounded-card shadow-card p-6 border border-bg-main">
          <h2 className="text-lg font-semibold mb-2">Welcome to VEXO Studio</h2>
          <p className="text-text-secondary text-sm mb-3">
            Multi-tenant scaffold (v2) is ready. Bring up infra and seed:
          </p>
          <pre className="text-xs bg-bg-main rounded p-3 overflow-x-auto">{`docker compose up -d postgres redis
npm run db:generate && npm run db:migrate && npm run db:seed
npm run dev`}</pre>
        </div>
        <div className="bg-bg-card rounded-card shadow-card p-6 border border-bg-main">
          <h2 className="text-lg font-semibold mb-3">Phase 1 status</h2>
          <ul className="text-sm space-y-1 text-text-secondary">
            <li>✓ Organizations + multi-tenancy</li>
            <li>✓ Auth + JWT + Refresh + 2FA (TOTP)</li>
            <li>✓ Roles & Permissions (24 perms × 7 roles)</li>
            <li>✓ Sessions management</li>
            <li>✓ API Keys (SHA-256 hashed)</li>
            <li>✓ Webhooks (outbound + incoming HMAC)</li>
            <li>✓ In-app Notifications + SSE stream</li>
            <li>✓ Health + Ready endpoints</li>
            <li>✓ Rate limiting (Redis-backed)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
