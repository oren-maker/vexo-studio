// Bridged auth — accepts EITHER the legacy x-admin-key header (kept for
// internal scripts/cron) OR a vexo-studio JWT (Bearer + valid user). This
// makes every migrated vexo-learn route immediately usable from the main
// app without forcing the user to set localStorage.adminKey.

import { NextResponse, type NextRequest } from "next/server";
import { verifyAccessToken, loadUserContext } from "@/lib/auth";

export async function requireAdmin(req: Request): Promise<NextResponse | null> {
  // Path 1 — admin-key header
  const adminKeys = [
    process.env.ADMIN_API_KEY,
    process.env.ADMIN_API_KEY_2,
    process.env.ADMIN_API_KEY_3,
  ].filter(Boolean) as string[];
  const provided = req.headers.get("x-admin-key");
  if (provided && adminKeys.includes(provided)) return null;

  // Path 2 — vexo-studio JWT (Bearer or vexo_at cookie)
  const auth = req.headers.get("authorization") ?? "";
  let token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) {
    const cookie = req.headers.get("cookie") ?? "";
    const m = cookie.match(/(?:^|;\s*)vexo_at=([^;]+)/);
    if (m) token = decodeURIComponent(m[1]);
  }
  if (token) {
    const payload = verifyAccessToken(token);
    if (payload) {
      const user = await loadUserContext(payload.sub);
      if (user) return null; // any valid logged-in user passes
    }
  }

  // Dev fallback — when neither admin key nor JWT exists, allow in dev
  if (adminKeys.length === 0 && process.env.NODE_ENV === "development") return null;

  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
