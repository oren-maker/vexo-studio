// Bridged client-side auth headers for migrated vexo-learn components.
// Instead of reading an admin key from localStorage (old vexo-learn pattern),
// inject the vexo-studio JWT so the bridged requireAdmin() on the server
// accepts the request.

import { getAccessToken } from "@/lib/api";

export function getAdminKey(): string | null {
  return getAccessToken();
}

export function adminHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = getAccessToken();
  if (!token) return extra;
  return { ...extra, Authorization: `Bearer ${token}` };
}
