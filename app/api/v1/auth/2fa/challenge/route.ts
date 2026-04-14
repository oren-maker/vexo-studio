import { NextRequest, NextResponse } from "next/server";
import { authenticator } from "otplib";
import { prisma } from "@/lib/prisma";
import { TotpChallengeSchema } from "@/lib/schemas/auth";
import { signAccessToken } from "@/lib/auth";
import { decrypt, hashSha256, randomToken } from "@/lib/crypto";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = TotpChallengeSchema.parse(await req.json());
    const ch = await prisma.totpChallenge.findUnique({ where: { id: body.challengeId } });
    if (!ch || ch.used || ch.expiresAt < new Date()) {
      return NextResponse.json({ statusCode: 401, error: "Unauthorized", message: "invalid challenge" }, { status: 401 });
    }
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ch.userId } });
    if (!user.totpSecret) return NextResponse.json({ statusCode: 401, error: "Unauthorized", message: "totp not configured" }, { status: 401 });
    const valid = authenticator.check(body.token, decrypt(user.totpSecret));
    if (!valid) return NextResponse.json({ statusCode: 401, error: "Unauthorized", message: "invalid token" }, { status: 401 });
    await prisma.totpChallenge.update({ where: { id: ch.id }, data: { used: true } });

    const accessToken = signAccessToken(user.id);
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? undefined;
    const ua = req.headers.get("user-agent") ?? undefined;
    const raw = randomToken();
    await prisma.userSession.create({
      data: { userId: user.id, refreshTokenHash: hashSha256(raw), expiresAt: new Date(Date.now() + 30 * 86_400_000), ipAddress: ip, userAgent: ua?.slice(0, 200) },
    });
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return ok({ accessToken, refreshToken: raw });
  } catch (e) { return handleError(e); }
}
