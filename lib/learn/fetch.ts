// Authenticated fetch wrapper for all migrated vexo-learn client-side code.
// Auto-injects the vexo-studio JWT so every /api/v1/learn/* call passes auth.
import { getAccessToken } from "@/lib/api";

export function learnFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = getAccessToken();
  const headers = new Headers(init?.headers);
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(input, { ...init, headers });
}
