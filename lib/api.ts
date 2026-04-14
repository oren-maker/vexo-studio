"use client";

// Same-origin by default (web + API live in the same Next.js app).
// Override with NEXT_PUBLIC_API_BASE_URL only when targeting a remote backend.
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

export type ApiError = { statusCode: number; error: string; message: string };

export function getAccessToken(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)vexo_at=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function setAccessToken(token: string | null) {
  if (typeof document === "undefined") return;
  if (token) {
    document.cookie = `vexo_at=${encodeURIComponent(token)}; path=/; SameSite=Lax`;
  } else {
    document.cookie = `vexo_at=; path=/; max-age=0`;
  }
}

export function getCurrentOrgId(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)vexo_org=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function setCurrentOrgId(orgId: string | null) {
  if (typeof document === "undefined") return;
  if (orgId) document.cookie = `vexo_org=${encodeURIComponent(orgId)}; path=/; SameSite=Lax`;
  else document.cookie = `vexo_org=; path=/; max-age=0`;
}

export async function api<T = unknown>(path: string, opts: RequestInit & { body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string> ?? {}),
  };
  const token = getAccessToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const orgId = getCurrentOrgId();
  if (orgId) headers["X-Organization-Id"] = orgId;

  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers,
    body: opts.body && typeof opts.body !== "string" ? JSON.stringify(opts.body) : (opts.body as BodyInit | undefined),
  });

  if (res.status === 401 && typeof window !== "undefined" && !path.includes("/auth/")) {
    setAccessToken(null);
    window.location.href = "/login";
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = (data as ApiError) ?? { statusCode: res.status, error: "Error", message: res.statusText };
    throw Object.assign(new Error(err.message), err);
  }
  return data as T;
}
