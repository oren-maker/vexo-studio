/**
 * Embeds the full vexo-learn app inside an iframe so the user can drive it
 * without leaving vexo-studio. The URL comes from VEXO_LEARN_URL — already
 * set in production env (used by the reference-prompts proxy).
 */
import { AuthGuard } from "@/components/auth-guard";

export default function LearnPage() {
  const url = process.env.VEXO_LEARN_URL ?? "";
  if (!url) {
    return (
      <div className="p-8 text-center text-text-muted">
        <div className="text-3xl mb-2">⚠</div>
        VEXO_LEARN_URL not configured.
      </div>
    );
  }
  return (
    <AuthGuard>
      <div className="fixed inset-0 flex flex-col">
        <div className="px-4 py-2 bg-bg-card border-b border-bg-main flex items-center justify-between text-sm shrink-0">
          <div className="font-semibold">🧠 VEXO Learn</div>
          <div className="flex gap-3 text-xs">
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">↗ פתח בלשונית חדשה</a>
            <a href="/admin" className="text-text-muted hover:text-accent">← חזרה ל-Studio</a>
          </div>
        </div>
        <iframe
          src={url}
          className="flex-1 w-full border-0"
          title="VEXO Learn"
          allow="clipboard-read; clipboard-write; fullscreen"
        />
      </div>
    </AuthGuard>
  );
}
