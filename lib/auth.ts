import jwt from "jsonwebtoken";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "./prisma";

const ENFORCE_2FA_ROLES = new Set(["SUPER_ADMIN", "ADMIN"]);

export type AuthContext = {
  user: {
    id: string; email: string; totpEnabled: boolean;
    memberships: Array<{ organizationId: string; roleName: string; permissions: Set<string>; isOwner: boolean }>;
  };
  organizationId: string;
};

export function signAccessToken(userId: string): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error("JWT_ACCESS_SECRET not set");
  return jwt.sign({ sub: userId }, secret, { expiresIn: "30d" });
}

export function verifyAccessToken(token: string): { sub: string } | null {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) return null;
  try { return jwt.verify(token, secret) as { sub: string }; } catch { return null; }
}

export async function loadUserContext(userId: string): Promise<AuthContext["user"] | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    include: { organizations: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
  });
  if (!u || !u.isActive) return null;
  return {
    id: u.id,
    email: u.email,
    totpEnabled: u.totpEnabled,
    memberships: u.organizations.map((m) => ({
      organizationId: m.organizationId,
      roleName: m.role.name,
      permissions: new Set(m.role.permissions.map((rp) => rp.permission.key)),
      isOwner: m.isOwner,
    })),
  };
}

async function tryApiKeyAuth(req: NextRequest): Promise<AuthContext | null> {
  const auth = req.headers.get("authorization");
  if (!auth) return null;
  const m = auth.match(/^Bearer\s+(vexo_sk_[^\s]+)$/i);
  if (!m) return null;
  const { hashSha256 } = await import("./crypto");
  const key = await prisma.apiKey.findUnique({ where: { keyHash: hashSha256(m[1]) } });
  if (!key || !key.isActive || (key.expiresAt && key.expiresAt < new Date())) return null;
  await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
  return {
    user: {
      id: key.createdByUserId, email: "api-key", totpEnabled: true,
      memberships: [{ organizationId: key.organizationId, roleName: "API_KEY", permissions: new Set(key.scopes as string[]), isOwner: false }],
    },
    organizationId: key.organizationId,
  };
}

export async function authenticate(req: NextRequest): Promise<AuthContext | NextResponse> {
  // API key path
  const apiKeyCtx = await tryApiKeyAuth(req);
  if (apiKeyCtx) {
    try {
      const { setRequestActor } = await import("./request-context");
      setRequestActor({
        organizationId: apiKeyCtx.organizationId,
        userId: apiKeyCtx.user.id,
        ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || undefined,
      });
    } catch { /* ignore */ }
    return apiKeyCtx;
  }

  // JWT path: accept Bearer header (XHR) OR vexo_at cookie (direct navigation — e.g. PDF/TXT download links)
  const auth = req.headers.get("authorization") ?? "";
  let token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) {
    const cookie = req.headers.get("cookie") ?? "";
    const m = cookie.match(/(?:^|;\s*)vexo_at=([^;]+)/);
    if (m) token = decodeURIComponent(m[1]);
  }
  if (!token) return NextResponse.json({ statusCode: 401, error: "Unauthorized", message: "no token" }, { status: 401 });
  const payload = verifyAccessToken(token);
  if (!payload) return NextResponse.json({ statusCode: 401, error: "Unauthorized", message: "invalid token" }, { status: 401 });
  const user = await loadUserContext(payload.sub);
  if (!user) return NextResponse.json({ statusCode: 401, error: "Unauthorized", message: "user not found" }, { status: 401 });

  // Resolve org
  const headerOrg = req.headers.get("x-organization-id")?.trim();
  const membership = headerOrg ? user.memberships.find((m) => m.organizationId === headerOrg) : user.memberships[0];
  if (!membership) return NextResponse.json({ statusCode: 403, error: "Forbidden", message: "no organization" }, { status: 403 });

  // 2FA enforcement currently disabled (re-enable by setting REQUIRE_2FA=1)
  if (process.env.REQUIRE_2FA === "1") {
    const privileged = user.memberships.some((m) => ENFORCE_2FA_ROLES.has(m.roleName));
    if (privileged && !user.totpEnabled) {
      const url = new URL(req.url);
      if (!url.pathname.startsWith("/api/v1/auth/2fa/")) {
        return NextResponse.json({ statusCode: 403, error: "Forbidden", message: "2FA setup required for privileged roles" }, { status: 403 });
      }
    }
  }

  // Stash actor for the prisma audit extension
  try {
    const { setRequestActor } = await import("./request-context");
    setRequestActor({
      organizationId: membership.organizationId,
      userId: user.id,
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || undefined,
    });
  } catch { /* ignore — auditing is best-effort */ }

  return { user, organizationId: membership.organizationId };
}

export function requirePermission(ctx: AuthContext, key: string): NextResponse | null {
  const m = ctx.user.memberships.find((mm) => mm.organizationId === ctx.organizationId);
  if (!m?.permissions.has(key)) {
    return NextResponse.json({ statusCode: 403, error: "Forbidden", message: `missing permission: ${key}` }, { status: 403 });
  }
  return null;
}

export function isAuthResponse(v: AuthContext | NextResponse): v is NextResponse {
  return v instanceof NextResponse;
}
