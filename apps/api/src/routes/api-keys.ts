import type { FastifyPluginAsync } from "fastify";
import crypto from "node:crypto";
import { prisma } from "@vexo/db";
import { CreateApiKeySchema } from "@vexo/shared";

function hashKey(plain: string) {
  return crypto.createHash("sha256").update(plain).digest("hex");
}

export const apiKeyRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", { preHandler: [app.requirePermission("manage_api_keys")] }, async (req) =>
    prisma.apiKey.findMany({
      where: { organizationId: req.organizationId },
      select: {
        id: true, name: true, keyPrefix: true, scopes: true,
        lastUsedAt: true, expiresAt: true, isActive: true, createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
  );

  app.post("/", { preHandler: [app.requirePermission("manage_api_keys")] }, async (req, reply) => {
    const body = CreateApiKeySchema.parse(req.body);
    const raw = `vexo_sk_${crypto.randomBytes(24).toString("base64url")}`;
    const created = await prisma.apiKey.create({
      data: {
        organizationId: req.organizationId!,
        name: body.name,
        keyHash: hashKey(raw),
        keyPrefix: raw.slice(0, 16),
        scopes: body.scopes,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        createdByUserId: req.currentUser!.id,
      },
    });
    reply.code(201);
    // Plaintext key returned ONCE on creation
    return { id: created.id, name: created.name, key: raw, prefix: created.keyPrefix };
  });

  app.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [app.requirePermission("manage_api_keys")] },
    async (req) => {
      await prisma.apiKey.updateMany({
        where: { id: req.params.id, organizationId: req.organizationId },
        data: { isActive: false },
      });
      return { ok: true };
    },
  );
};
