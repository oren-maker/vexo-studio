import type { FastifyPluginAsync } from "fastify";
import crypto from "node:crypto";
import { prisma } from "@vexo/db";
import { CreateWebhookSchema } from "@vexo/shared";

export const webhookRoutes: FastifyPluginAsync = async (app) => {
  // ---------- Outbound webhook endpoints ----------
  app.get(
    "/endpoints",
    { preHandler: [app.requirePermission("manage_webhooks")] },
    async (req) =>
      prisma.webhookEndpoint.findMany({
        where: { organizationId: req.organizationId },
        orderBy: { createdAt: "desc" },
      }),
  );

  app.post(
    "/endpoints",
    { preHandler: [app.requirePermission("manage_webhooks")] },
    async (req, reply) => {
      const body = CreateWebhookSchema.parse(req.body);
      const secret = `whsec_${crypto.randomBytes(24).toString("base64url")}`;
      const created = await prisma.webhookEndpoint.create({
        data: {
          organizationId: req.organizationId!,
          url: body.url,
          secret,
          events: body.events,
          isActive: body.isActive,
        },
      });
      reply.code(201);
      return { ...created, secret }; // plaintext secret shown once
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/endpoints/:id",
    { preHandler: [app.requirePermission("manage_webhooks")] },
    async (req) => {
      await prisma.webhookEndpoint.updateMany({
        where: { id: req.params.id, organizationId: req.organizationId },
        data: { isActive: false },
      });
      return { ok: true };
    },
  );

  app.get<{ Params: { id: string } }>(
    "/endpoints/:id/deliveries",
    { preHandler: [app.requirePermission("manage_webhooks")] },
    async (req, reply) => {
      const endpoint = await prisma.webhookEndpoint.findFirst({
        where: { id: req.params.id, organizationId: req.organizationId },
      });
      if (!endpoint) return reply.notFound();
      return prisma.webhookDelivery.findMany({
        where: { endpointId: req.params.id },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
    },
  );

  // ---------- Incoming provider callbacks ----------
  app.post<{ Params: { providerId: string } }>(
    "/incoming/:providerId",
    async (req, reply) => {
      const provider = await prisma.provider.findUnique({ where: { id: req.params.providerId } });
      if (!provider) return reply.notFound();

      const signature = (req.headers["x-signature"] as string) ?? null;
      const rawBody = JSON.stringify(req.body);

      // HMAC-SHA256 verification stub (use provider-specific secret in production)
      const verified = signature
        ? crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(
              crypto.createHmac("sha256", process.env.ENCRYPTION_KEY ?? "").update(rawBody).digest("hex"),
            ),
          )
        : false;

      const incoming = await prisma.incomingWebhook.create({
        data: {
          providerId: provider.id,
          eventType: (req.headers["x-event-type"] as string) ?? "unknown",
          payload: req.body as object,
          signature,
          verified,
          processed: false,
        },
      });

      // TODO: enqueue to `incoming-webhook` queue for processing
      return { received: true, id: incoming.id, verified };
    },
  );
};
