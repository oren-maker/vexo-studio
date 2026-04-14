export default function NotificationsPage() {
  return (
    <div className="bg-bg-card rounded-card shadow-card p-6 border border-bg-main">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold">Notifications</h2>
          <p className="text-text-secondary text-sm">In-app activity from your organization (real-time via SSE).</p>
        </div>
        <button className="text-sm text-accent hover:underline">Mark all as read</button>
      </div>
      <div className="rounded-lg border border-dashed border-bg-main p-10 text-center">
        <div className="text-3xl mb-2">🔔</div>
        <div className="font-semibold mb-1">You're all caught up</div>
        <div className="text-text-muted text-sm">New activity will appear here in real time.</div>
      </div>
    </div>
  );
}
