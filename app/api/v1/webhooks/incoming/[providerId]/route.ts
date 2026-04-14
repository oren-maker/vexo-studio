import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { providerId: string } }) {
  try {
    const provider = await prisma.provider.findUnique({ where: { id: params.providerId } });
    if (!provider) return NextResponse.json({ statusCode: 404, error: "NotFound", message: "provider not found" }, { status: 404 });
    const signature = req.headers.get("x-signature") ?? null;
    const body = await req.json();
    const rawBody = JSON.stringify(body);
    const verified = signature
      ? crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(crypto.createHmac("sha256", process.env.ENCRYPTION_KEY ?? "").update(rawBody).digest("hex")))
      : false;
    const incoming = await prisma.incomingWebhook.create({
      data: {
        providerId: provider.id,
        eventType: req.headers.get("x-event-type") ?? "unknown",
        payload: body as object, signature, verified, processed: false,
      },
    });
    return ok({ received: true, id: incoming.id, verified });
  } catch (e) { return handleError(e); }
}
