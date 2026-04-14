export default function ApiKeysPage() {
  return (
    <div className="bg-bg-card rounded-card shadow-card p-6 border border-bg-main">
      <h2 className="text-lg font-semibold mb-1">API Keys</h2>
      <p className="text-text-secondary text-sm mb-6">
        Programmatic access for the current organization. Keys are shown only once on creation.
      </p>
      <div className="rounded-lg border border-dashed border-bg-main p-10 text-center">
        <div className="text-3xl mb-2">🔑</div>
        <div className="font-semibold mb-1">No API keys yet</div>
        <div className="text-text-muted text-sm mb-4">Create a key to integrate with the VEXO Studio API.</div>
        <button className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent-light">Create API key</button>
      </div>
    </div>
  );
}
