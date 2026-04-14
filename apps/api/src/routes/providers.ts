import type { FastifyPluginAsync } from "fastify";
import { prisma } from "@vexo/db";
import { CreateProviderSchema, UpdateProviderSchema } from "@vexo/shared";
import { encrypt } from "../lib/crypto";

export const providerRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", { preHandler: [app.requirePermission("manage_providers")] }, async (req) =>
    prisma.provider.findMany({
      where: { organizationId: req.organizationId },
      include: { wallet: true },
      orderBy: { name: "asc" },
    }),
  );

  app.post("/", { preHandler: [app.requirePermission("manage_providers")] }, async (req, reply) => {
    const body = CreateProviderSchema.parse(req.body);
    const provider = await prisma.provider.create({
      data: {
        organizationId: req.organizationId!,
        name: body.name,
        category: body.category,
        apiUrl: body.apiUrl,
        apiKeyEncrypted: body.apiKey ? encrypt(body.apiKey) : undefined,
        isActive: body.isActive,
        notes: body.notes,
      },
    });
    reply.code(201);
    return provider;
  });

  app.patch<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [app.requirePermission("manage_providers")] },
    async (req, reply) => {
      const existing = await prisma.provider.findFirst({
        where: { id: req.params.id, organizationId: req.organizationId },
      });
      if (!existing) return reply.notFound();
      const body = UpdateProviderSchema.parse(req.body);
      return prisma.provider.update({
        where: { id: req.params.id },
        data: {
          name: body.name,
          category: body.category,
          apiUrl: body.apiUrl,
          apiKeyEncrypted: body.apiKey ? encrypt(body.apiKey) : undefined,
          isActive: body.isActive,
          notes: body.notes,
        },
      });
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [app.requirePermission("manage_providers")] },
    async (req, reply) => {
      const existing = await prisma.provider.findFirst({
        where: { id: req.params.id, organizationId: req.organizationId },
      });
      if (!existing) return reply.notFound();
      await prisma.provider.update({ where: { id: req.params.id }, data: { isActive: false } });
      return { ok: true };
    },
  );

  // POST /providers/:id/test — validateConnection() stub
  app.post<{ Params: { id: string } }>(
    "/:id/test",
    { preHandler: [app.requirePermission("manage_providers")] },
    async (req, reply) => {
      const provider = await prisma.provider.findFirst({
        where: { id: req.params.id, organizationId: req.organizationId },
      });
      if (!provider) return reply.notFound();
      // TODO: dispatch to ProviderAdapter.validateConnection()
      return { ok: true, provider: provider.name, status: "stub-not-implemented" };
    },
  );
};
