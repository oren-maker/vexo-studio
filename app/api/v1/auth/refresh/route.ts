import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { RefreshSchema } from "@/lib/schemas/auth";
import { signAccessToken } from "@/lib/auth";
import { hashSha256 } from "@/lib/crypto";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { refreshToken } = RefreshSchema.parse(await req.json());
    const session = await prisma.userSession.findFirst({
      where: { refreshTokenHash: hashSha256(refreshToken), expiresAt: { gt: new Date() }, isActive: true },
    });
    if (!session) return NextResponse.json({ statusCode: 401, error: "Unauthorized", message: "invalid refresh token" }, { status: 401 });
    return ok({ accessToken: signAccessToken(session.userId) });
  } catch (e) { return handleError(e); }
}
