export default function WebhooksPage() {
  return (
    <div className="bg-bg-card rounded-card shadow-card p-6 border border-bg-main">
      <h2 className="text-lg font-semibold mb-1">Webhooks</h2>
      <p className="text-text-secondary text-sm mb-6">
        Subscribe to platform events: <code className="px-1 bg-bg-main rounded">episode.published</code>,{" "}
        <code className="px-1 bg-bg-main rounded">job.completed</code>,{" "}
        <code className="px-1 bg-bg-main rounded">job.failed</code>, and more.
      </p>
      <div className="rounded-lg border border-dashed border-bg-main p-10 text-center">
        <div className="text-3xl mb-2">🔗</div>
        <div className="font-semibold mb-1">No endpoints configured</div>
        <div className="text-text-muted text-sm mb-4">All deliveries are signed with HMAC-SHA256.</div>
        <button className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent-light">Add endpoint</button>
      </div>
    </div>
  );
}
