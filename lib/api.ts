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

export function setAccessToken(token: string | null, remember = true) {
  if (typeof document === "undefined") return;
  if (token) {
    // remember=true → persist 30 days (survives browser restart). false → session cookie.
    const maxAge = remember ? `; max-age=${30 * 86400}` : "";
    document.cookie = `vexo_at=${encodeURIComponent(token)}; path=/; SameSite=Lax${maxAge}`;
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
    // Stop here — don't parse the body or throw, since navigation is imminent.
    // Throw a benign sentinel the caller's catch will swallow without an alert.
    throw Object.assign(new Error(""), { statusCode: 401, silent: true });
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      try { data = JSON.parse(text); } catch { /* fall through to text */ }
    }
    if (data === null) {
      // Non-JSON response (HTML error page from Vercel timeout, etc.)
      const snippet = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
      const looksLikeTimeout = /FUNCTION_INVOCATION_TIMEOUT|An error occurred with your deployment/i.test(text);
      const message = looksLikeTimeout ? "Server timed out. Try again in a moment." : (snippet || `HTTP ${res.status}`);
      if (!res.ok) throw Object.assign(new Error(message), { statusCode: res.status, error: "ServerError" });
      throw Object.assign(new Error(message), { statusCode: 502, error: "InvalidResponse" });
    }
  }
  if (!res.ok) {
    const err = (data as ApiError) ?? { statusCode: res.status, error: "Error", message: res.statusText };
    throw Object.assign(new Error(err.message), err);
  }
  return data as T;
}
