import { prisma } from "@vexo/db";
import { PLAN_LIMITS, type OrgPlanName } from "@vexo/shared";

export async function assertProjectQuota(orgId: string) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  const limits = PLAN_LIMITS[org.plan as OrgPlanName];
  const count = await prisma.project.count({ where: { organizationId: orgId, status: { not: "ARCHIVED" } } });
  if (count >= limits.maxProjects) {
    throw Object.assign(new Error(`plan ${org.plan} project limit reached (${limits.maxProjects})`), { statusCode: 402 });
  }
}

export async function assertEpisodeQuota(orgId: string, seriesId: string) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  const limits = PLAN_LIMITS[org.plan as OrgPlanName];
  const count = await prisma.episode.count({ where: { season: { seriesId, series: { project: { organizationId: orgId } } } } });
  if (count >= limits.maxEpisodes) {
    throw Object.assign(new Error(`plan ${org.plan} episode limit reached (${limits.maxEpisodes})`), { statusCode: 402 });
  }
}

export async function assertProjectInOrg(projectId: string, orgId: string) {
  const p = await prisma.project.findFirst({ where: { id: projectId, organizationId: orgId } });
  if (!p) throw Object.assign(new Error("project not found"), { statusCode: 404 });
  return p;
}
