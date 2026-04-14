import { prisma } from "./prisma";

export async function auditLog(opts: {
  organizationId: string;
  actorUserId: string;
  entityType: string;
  entityId: string;
  action: string;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string;
}) {
  await prisma.auditLog.create({
    data: {
      organizationId: opts.organizationId,
      actorUserId: opts.actorUserId,
      entityType: opts.entityType,
      entityId: opts.entityId,
      action: opts.action,
      oldValue: (opts.oldValue ?? undefined) as object | undefined,
      newValue: (opts.newValue ?? undefined) as object | undefined,
      ipAddress: opts.ipAddress,
    },
  });
}
