import { NextRequest, NextResponse } from "next/server";
import argon2 from "argon2";
import { authenticator } from "otplib";
import { prisma } from "@/lib/prisma";
import { TotpDisableSchema } from "@/lib/schemas/auth";
import { authenticate, isAuthResponse } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENFORCE_2FA_ROLES = new Set(["SUPER_ADMIN", "ADMIN"]);

export async function POST(req: NextRequest) {
  try {
    const ctx = await authenticate(req);
    if (isAuthResponse(ctx)) return ctx;
    const body = TotpDisableSchema.parse(await req.json());
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.user.id } });
    const passOk = await argon2.verify(user.passwordHash, body.password);
    if (!passOk) return NextResponse.json({ statusCode: 401, error: "Unauthorized", message: "invalid password" }, { status: 401 });
    if (!user.totpSecret) return NextResponse.json({ statusCode: 400, error: "BadRequest", message: "totp not enabled" }, { status: 400 });
    const valid = authenticator.check(body.token, decrypt(user.totpSecret));
    if (!valid) return NextResponse.json({ statusCode: 400, error: "BadRequest", message: "invalid token" }, { status: 400 });
    const privileged = ctx.user.memberships.some((m) => ENFORCE_2FA_ROLES.has(m.roleName));
    if (privileged) return NextResponse.json({ statusCode: 403, error: "Forbidden", message: "2FA cannot be disabled for ADMIN/SUPER_ADMIN" }, { status: 403 });
    await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: false, totpSecret: null, totpVerifiedAt: null } });
    return ok({ ok: true });
  } catch (e) { return handleError(e); }
}
