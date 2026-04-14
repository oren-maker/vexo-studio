export default function SessionsPage() {
  return (
    <div className="bg-bg-card rounded-card shadow-card p-6 border border-bg-main">
      <h2 className="text-lg font-semibold mb-1">Active Sessions</h2>
      <p className="text-text-secondary text-sm mb-6">Devices currently signed in to your account.</p>
      <table className="w-full text-sm">
        <thead className="text-left text-[11px] uppercase tracking-widest text-text-muted">
          <tr className="border-b border-bg-main">
            <th className="py-2 font-semibold">Device</th>
            <th className="py-2 font-semibold">IP</th>
            <th className="py-2 font-semibold">Created</th>
            <th className="py-2 font-semibold text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-bg-main">
            <td className="py-3">Current session</td>
            <td className="py-3 text-text-secondary">—</td>
            <td className="py-3 text-text-secondary">—</td>
            <td className="py-3 text-right text-text-muted">Current</td>
          </tr>
        </tbody>
      </table>
      <button className="mt-6 text-sm text-status-errText hover:underline">Revoke all other sessions</button>
    </div>
  );
}
