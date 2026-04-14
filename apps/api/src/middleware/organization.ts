import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";

declare module "fastify" {
  interface FastifyRequest {
    organizationId?: string;
  }
}

/**
 * Resolves the current organization for the request.
 * Order:
 *   1. `X-Organization-Id` header
 *   2. First membership (default org)
 * Sets `req.organizationId`. Validates that the user is a member.
 */
const plugin: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", async (req, reply) => {
    if (!req.currentUser) return; // unauthenticated routes
    const headerOrg = (req.headers["x-organization-id"] as string | undefined)?.trim();
    const memberships = req.currentUser.memberships;
    if (!memberships.length) return;

    if (headerOrg) {
      const m = memberships.find((mm) => mm.organizationId === headerOrg);
      if (!m) return reply.forbidden("not a member of organization");
      req.organizationId = m.organizationId;
    } else {
      req.organizationId = memberships[0].organizationId;
    }
  });
};

export const orgPlugin = fp(plugin, { name: "vexo-org", dependencies: ["vexo-auth"] });
