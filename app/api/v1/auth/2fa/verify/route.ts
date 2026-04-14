import { NextRequest, NextResponse } from "next/server";
import { authenticator } from "otplib";
import { prisma } from "@/lib/prisma";
import { TotpVerifySchema } from "@/lib/schemas/auth";
import { authenticate, isAuthResponse } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const ctx = await authenticate(req);
    if (isAuthResponse(ctx)) return ctx;
    const body = TotpVerifySchema.parse(await req.json());
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.user.id } });
    if (!user.totpSecret) return NextResponse.json({ statusCode: 400, error: "BadRequest", message: "call /2fa/setup first" }, { status: 400 });
    const valid = authenticator.check(body.token, decrypt(user.totpSecret));
    if (!valid) return NextResponse.json({ statusCode: 400, error: "BadRequest", message: "invalid token" }, { status: 400 });
    await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: true, totpVerifiedAt: new Date() } });
    return ok({ ok: true });
  } catch (e) { return handleError(e); }
}
