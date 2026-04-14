import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

const ChannelConnect = z.object({
  channelName: z.string(), channelId: z.string(),
  accessToken: z.string(), refreshToken: z.string().optional(),
  tokenExpiry: z.string().datetime().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "manage_distribution"); if (f) return f;
    const body = ChannelConnect.parse(await req.json());
    const channel = await prisma.channelIntegration.create({
      data: {
        organizationId: ctx.organizationId, provider: "YOUTUBE",
        channelName: body.channelName, channelId: body.channelId,
        accessTokenEncrypted: encrypt(body.accessToken),
        refreshTokenEncrypted: body.refreshToken ? encrypt(body.refreshToken) : null,
        tokenExpiry: body.tokenExpiry ? new Date(body.tokenExpiry) : null,
        createdByUserId: ctx.user.id,
      },
    });
    return ok({ id: channel.id }, 201);
  } catch (e) { return handleError(e); }
}
