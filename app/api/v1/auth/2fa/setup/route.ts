import { NextRequest } from "next/server";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { authenticate, isAuthResponse } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const ctx = await authenticate(req);
    if (isAuthResponse(ctx)) return ctx;
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.user.id } });
    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri(user.email, "VEXO Studio", secret);
    const qrDataUrl = await QRCode.toDataURL(otpauth);
    await prisma.user.update({ where: { id: user.id }, data: { totpSecret: encrypt(secret), totpEnabled: false } });
    return ok({ secret, otpauth, qrDataUrl });
  } catch (e) { return handleError(e); }
}
