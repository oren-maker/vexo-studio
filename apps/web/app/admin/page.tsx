function Kpi({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-bg-card rounded-card shadow-card p-5 border border-bg-main">
      <div className="text-xs uppercase tracking-widest text-text-muted">{label}</div>
      <div className={`mt-2 text-3xl font-bold num`} style={{ color }}>{value}</div>
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
      <div className="bg-bg-card rounded-card shadow-card p-6 border border-bg-main">
        <h2 className="text-lg font-semibold mb-2">Welcome to VEXO Studio</h2>
        <p className="text-text-secondary text-sm">
          Foundation scaffold ready. Run <code className="px-1 bg-bg-main rounded">docker compose up -d</code>,
          then <code className="px-1 bg-bg-main rounded">npm run db:migrate</code> and{" "}
          <code className="px-1 bg-bg-main rounded">npm run db:seed</code>.
        </p>
      </div>
    </div>
  );
}
