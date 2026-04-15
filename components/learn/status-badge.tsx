const MAP: Record<string, { label: string; cls: string }> = {
  pending: { label: "ממתין", cls: "bg-slate-700/40 text-slate-300" },
  processing: { label: "מעבד", cls: "bg-amber-500/20 text-amber-300 border border-amber-500/30" },
  complete: { label: "הושלם", cls: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" },
  failed: { label: "נכשל", cls: "bg-red-500/20 text-red-300 border border-red-500/30" },
};

export default function StatusBadge({ status }: { status: string }) {
  const s = MAP[status] || { label: status, cls: "bg-slate-700 text-slate-200" };
  return (
    <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${s.cls}`}>
      {s.label}
    </span>
  );
}
