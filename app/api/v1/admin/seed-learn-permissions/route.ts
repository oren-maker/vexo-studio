/**
 * POST /api/v1/admin/seed-learn-permissions
 * One-shot: creates access_learn + manage_learn permissions and assigns
 * them to SUPER_ADMIN, ADMIN, DIRECTOR roles. Safe to call multiple times.
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "manage_roles"); if (f) return f;

    const keys = ["access_learn", "manage_learn"];
    for (const key of keys) {
      await prisma.permission.upsert({
        where: { key },
        update: {},
        create: { key, description: key.replace(/_/g, " ") },
      });
    }

    const roleNames = ["SUPER_ADMIN", "ADMIN", "DIRECTOR"];
    let linked = 0;
    for (const roleName of roleNames) {
      const role = await prisma.role.findUnique({ where: { name: roleName } });
      if (!role) continue;
      for (const key of keys) {
        const perm = await prisma.permission.findUnique({ where: { key } });
        if (!perm) continue;
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
          update: {},
          create: { roleId: role.id, permissionId: perm.id },
        });
        linked++;
      }
    }

    return ok({ seeded: keys, linkedToRoles: roleNames, totalLinks: linked });
  } catch (e) { return handleError(e); }
}
