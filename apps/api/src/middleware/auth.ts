import fp from "fastify-plugin";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@vexo/db";

declare module "fastify" {
  interface FastifyRequest {
    currentUser?: {
      id: string;
      email: string;
      totpEnabled: boolean;
      memberships: Array<{
        organizationId: string;
        roleName: string;
        permissions: Set<string>;
        isOwner: boolean;
      }>;
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

const ENFORCE_2FA_ROLES = new Set(["SUPER_ADMIN", "ADMIN"]);

const plugin: FastifyPluginAsync = async (app) => {
  app.decorate("requireAuth", async (req, reply) => {
    try {
      await req.jwtVerify();
      const userId = (req.user as { sub: string }).sub;
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          organizations: {
            include: { role: { include: { permissions: { include: { permission: true } } } } },
          },
        },
      });
      if (!user || !user.isActive) return reply.unauthorized();

      req.currentUser = {
        id: user.id,
        email: user.email,
        totpEnabled: user.totpEnabled,
        memberships: user.organizations.map((m) => ({
          organizationId: m.organizationId,
          roleName: m.role.name,
          permissions: new Set(m.role.permissions.map((rp) => rp.permission.key)),
          isOwner: m.isOwner,
        })),
      };

      // 2FA enforcement for ADMIN/SUPER_ADMIN
      const hasPrivilegedRole = req.currentUser.memberships.some((m) => ENFORCE_2FA_ROLES.has(m.roleName));
      if (hasPrivilegedRole && !user.totpEnabled) {
        // allow access only to 2FA setup endpoints
        if (!req.url.startsWith("/api/v1/auth/2fa/")) {
          return reply.forbidden("2FA setup required for privileged roles");
        }
      }
    } catch {
      return reply.unauthorized();
    }
  });

  app.decorate("requirePermission", (key: string) => async (req, reply) => {
    await app.requireAuth(req, reply);
    if (reply.sent) return;
    const orgId = req.organizationId;
    const member = req.currentUser?.memberships.find((m) => m.organizationId === orgId);
    if (!member?.permissions.has(key)) {
      return reply.forbidden(`missing permission: ${key}`);
    }
  });
};

export const authPlugin = fp(plugin, { name: "vexo-auth" });
