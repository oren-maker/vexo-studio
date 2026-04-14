import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@vexo/db";
import { assertProjectInOrg } from "../lib/plan-limits";
import { Revenue } from "../services";
import { auditLog } from "../lib/audit";

const CostCreate = z.object({
  entityType: z.string(),
  entityId: z.string(),
  costCategory: z.enum(["TOKEN","GENERATION","SERVER","STORAGE","MANUAL"]),
  description: z.string().optional(),
  unitCost: z.number().nonnegative(),
  quantity: z.number().positive().default(1),
  totalCost: z.number().nonnegative(),
  sourceType: z.enum(["JOB","MANUAL","SYSTEM"]).default("MANUAL"),
});

const RevenueCreate = z.object({
  entityType: z.string(),
  entityId: z.string(),
  platform: z.string(),
  sourceType: z.enum(["AD","SUBSCRIPTION","SPONSORSHIP","OTHER"]),
  description: z.string().optional(),
  amount: z.number().nonnegative(),
  currency: z.string().default("USD"),
  occurredAt: z.string().datetime(),
});

const SplitCreate = z.object({
  entityType: z.string(),
  entityName: z.string(),
  percentage: z.number().min(0).max(100),
  payoutMethod: z.string().optional(),
  notes: z.string().optional(),
});

export const financeProjectRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { id: string } }>("/projects/:id/finance/summary", { preHandler: [app.requirePermission("view_finance")] }, async (req) => {
    await assertProjectInOrg(req.params.id, req.organizationId!);
    const [profit, roi, splits] = await Promise.all([
      Revenue.calculateProfit(req.params.id),
      Revenue.calculateROI(req.params.id),
      Revenue.calculateSplitPayouts(req.params.id),
    ]);
    return { profit, roi, splits };
  });

  app.get<{ Params: { id: string } }>("/projects/:id/finance/costs", { preHandler: [app.requirePermission("view_finance")] }, async (req) => {
    await assertProjectInOrg(req.params.id, req.organizationId!);
    return prisma.costEntry.findMany({ where: { projectId: req.params.id }, orderBy: { createdAt: "desc" }, take: 200 });
  });

  app.post<{ Params: { id: string } }>("/projects/:id/finance/costs", { preHandler: [app.requirePermission("manage_finance")] }, async (req, reply) => {
    await assertProjectInOrg(req.params.id, req.organizationId!);
    const body = CostCreate.parse(req.body);
    const created = await prisma.costEntry.create({
      data: { ...body, projectId: req.params.id, createdByUserId: req.currentUser!.id },
    });
    await auditLog({ organizationId: req.organizationId!, actorUserId: req.currentUser!.id, entityType: "COST_ENTRY", entityId: created.id, action: "CREATE", newValue: created });
    reply.code(201);
    return created;
  });

  app.get<{ Params: { id: string } }>("/projects/:id/finance/revenues", { preHandler: [app.requirePermission("view_finance")] }, async (req) => {
    await assertProjectInOrg(req.params.id, req.organizationId!);
    return prisma.revenueEntry.findMany({ where: { projectId: req.params.id }, orderBy: { occurredAt: "desc" }, take: 200 });
  });

  app.post<{ Params: { id: string } }>("/projects/:id/finance/revenues", { preHandler: [app.requirePermission("manage_finance")] }, async (req, reply) => {
    await assertProjectInOrg(req.params.id, req.organizationId!);
    const body = RevenueCreate.parse(req.body);
    const created = await prisma.revenueEntry.create({
      data: { ...body, projectId: req.params.id, occurredAt: new Date(body.occurredAt) },
    });
    await auditLog({ organizationId: req.organizationId!, actorUserId: req.currentUser!.id, entityType: "REVENUE_ENTRY", entityId: created.id, action: "CREATE", newValue: created });
    reply.code(201);
    return created;
  });

  app.get<{ Params: { id: string } }>("/projects/:id/finance/splits", { preHandler: [app.requirePermission("view_finance")] }, async (req) => {
    await assertProjectInOrg(req.params.id, req.organizationId!);
    return prisma.revenueSplit.findMany({ where: { projectId: req.params.id } });
  });

  app.post<{ Params: { id: string } }>("/projects/:id/finance/splits", { preHandler: [app.requirePermission("manage_finance")] }, async (req, reply) => {
    await assertProjectInOrg(req.params.id, req.organizationId!);
    const body = SplitCreate.parse(req.body);
    const created = await prisma.revenueSplit.create({ data: { ...body, projectId: req.params.id } });
    reply.code(201);
    return created;
  });
};
