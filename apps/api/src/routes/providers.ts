import type { FastifyPluginAsync } from "fastify";
import { prisma } from "@vexo/db";
import { CreateProviderSchema, UpdateProviderSchema } from "@vexo/shared";
import { encrypt } from "../lib/crypto";

export const providerRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", { preHandler: [app.requirePermission("manage_providers")] }, async () =>
    prisma.provider.findMany({ include: { wallet: true }, orderBy: { name: "asc" } }),
  );

  app.post("/", { preHandler: [app.requirePermission("manage_providers")] }, async (req, reply) => {
    const body = CreateProviderSchema.parse(req.body);
    const provider = await prisma.provider.create({
      data: {
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
    async (req) => {
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
    async (req) => {
      await prisma.provider.update({ where: { id: req.params.id }, data: { isActive: false } });
      return { ok: true };
    },
  );
};
