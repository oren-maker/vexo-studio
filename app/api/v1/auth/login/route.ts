import { NextRequest, NextResponse } from "next/server";
import argon2 from "argon2";
import { prisma } from "@/lib/prisma";
import { LoginSchema } from "@/lib/schemas/auth";
import { signAccessToken } from "@/lib/auth";
import { hashSha256, randomToken } from "@/lib/crypto";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REFRESH_TTL_DAYS = 30;
const ENFORCE_2FA_ROLES = new Set(["SUPER_ADMIN", "ADMIN"]);

async function userPrivileged(userId: string) {
  const ms = await prisma.organizationUser.findMany({ where: { userId }, include: { role: true } });
  return ms.some((m) => ENFORCE_2FA_ROLES.has(m.role.name));
}

async function issueRefresh(userId: string, ip?: string, ua?: string, device?: string) {
  const raw = randomToken();
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 86_400_000);
  await prisma.userSession.create({
    data: { userId, refreshTokenHash: hashSha256(raw), expiresAt, ipAddress: ip, userAgent: ua?.slice(0, 200), deviceName: device },
  });
  return raw;
}

export async function POST(req: NextRequest) {
  try {
    const body = LoginSchema.parse(await req.json());
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user || !user.isActive) return NextResponse.json({ statusCode: 401, error: "Unauthorized", message: "invalid credentials" }, { status: 401 });
    const valid = await argon2.verify(user.passwordHash, body.password);
    if (!valid) return NextResponse.json({ statusCode: 401, error: "Unauthorized", message: "invalid credentials" }, { status: 401 });

    if (user.totpEnabled) {
      const challenge = await prisma.totpChallenge.create({
        data: { userId: user.id, token: randomToken(24), expiresAt: new Date(Date.now() + 5 * 60_000) },
      });
      return ok({ requiresTotpChallenge: true, challengeId: challenge.id });
    }

    const privileged = await userPrivileged(user.id);
    const accessToken = signAccessToken(user.id);
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? undefined;
    const ua = req.headers.get("user-agent") ?? undefined;
    const device = req.headers.get("x-device-name") ?? undefined;
    const refreshToken = await issueRefresh(user.id, ip, ua, device);
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return ok({ accessToken, refreshToken, requires2faSetup: privileged });
  } catch (e) { return handleError(e); }
}
