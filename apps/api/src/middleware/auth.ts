import fp from "fastify-plugin";
import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@vexo/db";

declare module "fastify" {
  interface FastifyRequest {
    currentUser?: {
      id: string;
      email: string;
      roleName: string;
      permissions: Set<string>;
    };
  }
  interface FastifyInstance {
    requireAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requirePermission: (
      key: string,
    ) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string };
  }
}

import { FastifyPluginAsync } from "fastify";

const plugin: FastifyPluginAsync = async (app) => {
  app.decorate("requireAuth", async (req, reply) => {
    try {
      await req.jwtVerify();
      const userId = (req.user as { sub: string }).sub;
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { role: { include: { permissions: { include: { permission: true } } } } },
      });
      if (!user || !user.isActive) return reply.unauthorized();
      req.currentUser = {
        id: user.id,
        email: user.email,
        roleName: user.role.name,
        permissions: new Set(user.role.permissions.map((rp) => rp.permission.key)),
      };
    } catch {
      return reply.unauthorized();
    }
  });

  app.decorate("requirePermission", (key: string) => async (req, reply) => {
    await app.requireAuth(req, reply);
    if (!req.currentUser?.permissions.has(key)) {
      return reply.forbidden(`missing permission: ${key}`);
    }
  });
};

export const authPlugin = fp(plugin, { name: "vexo-auth" });
