import { PrismaClient } from "@prisma/client";
import { getRequestActor } from "./request-context";

declare global {
  // eslint-disable-next-line no-var
  var __vexoPrisma: PrismaClient | undefined;
}

// Models we want auto-audited. Skipping noisy / system tables and high-frequency
// billing tables (CreditWallet/Provider — every chargeUsd hits them and audit
// writes were stalling AI calls). Billing already has its own CreditTransaction log.
const AUDITED_MODELS = new Set([
  "Project", "Series", "Season", "Episode", "Scene", "SceneFrame",
  "Character", "CharacterMedia", "EpisodeCharacter",
  "MusicTrack", "ThumbnailVariant", "ContentCalendarEntry",
  "Webhook", "ApiKey", "Role", "OrganizationUser",
]);

function bestEntityId(args: unknown): string {
  const a = args as { where?: { id?: string }; data?: { id?: string } };
  return a?.where?.id ?? a?.data?.id ?? "unknown";
}

function safeJson(v: unknown): unknown {
  // Trim huge blobs so audit rows stay sane
  try {
    const s = JSON.stringify(v, (_, val) => typeof val === "string" && val.length > 2000 ? val.slice(0, 2000) + "…[trimmed]" : val);
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}

function basePrisma(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

const _prisma = global.__vexoPrisma ?? basePrisma();

if (process.env.NODE_ENV !== "production") global.__vexoPrisma = _prisma;

// Extended client with auto-audit on writes for whitelisted models.
export const prisma = _prisma.$extends({
  query: {
    $allModels: {
      async create({ model, args, query }) {
        const result = await query(args);
        if (AUDITED_MODELS.has(model)) {
          fireAudit(model, "CREATE", null, result, bestEntityId({ data: result }));
        }
        return result;
      },
      async update({ model, args, query }) {
        const result = await query(args);
        if (AUDITED_MODELS.has(model)) {
          fireAudit(model, "UPDATE", args.data, result, bestEntityId(args));
        }
        return result;
      },
      async upsert({ model, args, query }) {
        const result = await query(args);
        if (AUDITED_MODELS.has(model)) {
          fireAudit(model, "UPSERT", args.update, result, bestEntityId(args));
        }
        return result;
      },
      async delete({ model, args, query }) {
        const result = await query(args);
        if (AUDITED_MODELS.has(model)) {
          fireAudit(model, "DELETE", result, null, bestEntityId(args));
        }
        return result;
      },
      async deleteMany({ model, args, query }) {
        const result = await query(args);
        if (AUDITED_MODELS.has(model)) {
          fireAudit(model, "DELETE_MANY", args.where, { count: (result as { count?: number })?.count ?? 0 }, "bulk");
        }
        return result;
      },
    },
  },
}) as unknown as PrismaClient;

function fireAudit(model: string, action: string, oldValue: unknown, newValue: unknown, entityId: string) {
  // Fire-and-forget. Reads actor from AsyncLocalStorage that authenticate() set.
  const actor = getRequestActor();
  if (!actor) return; // No request context (cron, seed, etc.) — skip
  _prisma.auditLog.create({
    data: {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      entityType: model,
      entityId,
      action,
      oldValue: (safeJson(oldValue) ?? undefined) as object | undefined,
      newValue: (safeJson(newValue) ?? undefined) as object | undefined,
      ipAddress: actor.ipAddress,
    },
  }).catch(() => { /* never throw from audit path */ });
}
