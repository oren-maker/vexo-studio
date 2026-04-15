// Client-side helper: read admin key from localStorage and build fetch headers.
// The user sets their admin key once via /admin or localStorage.setItem("adminKey", "...").

export function getAdminKey(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("adminKey");
}

export function adminHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const key = getAdminKey();
  if (!key) return extra;
  return { ...extra, "x-admin-key": key };
}
