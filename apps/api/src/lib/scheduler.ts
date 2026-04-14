import { prisma } from "@vexo/db";
import { getQueue, QUEUE_NAMES } from "@vexo/queue";

interface Logger { info(...args: unknown[]): void; warn(...args: unknown[]): void; }

export function startScheduler(log: Logger) {
  const tickMs = 60_000; // 1 minute

  async function tick() {
    try {
      // 1. Episodes scheduled for publish whose time has come
      const due = await prisma.episode.findMany({
        where: {
          status: { in: ["READY_FOR_PUBLISH", "REVIEW", "DRAFT"] },
          scheduledPublishAt: { lte: new Date(), not: null },
          publishedAt: null,
        },
        select: { id: true, title: true, season: { select: { series: { select: { project: { select: { organizationId: true } } } } } } },
      });
      for (const ep of due) {
        const orgId = ep.season.series.project.organizationId;
        await getQueue(QUEUE_NAMES.PUBLISHING).add("scheduled-publish", {
          episodeId: ep.id, organizationId: orgId, source: "SCHEDULER",
        });
        log.info({ episodeId: ep.id, title: ep.title }, "scheduled publish queued");
      }

      // 2. Calendar entries due
      const calEntries = await prisma.contentCalendarEntry.findMany({
        where: { status: "SCHEDULED", scheduledAt: { lte: new Date() } },
      });
      for (const e of calEntries) {
        if (e.episodeId) {
          await getQueue(QUEUE_NAMES.PUBLISHING).add("calendar-publish", {
            episodeId: e.episodeId, projectId: e.projectId, source: "CALENDAR",
          });
        }
        await prisma.contentCalendarEntry.update({ where: { id: e.id }, data: { status: "PUBLISHED", publishedAt: new Date() } });
      }
    } catch (e: unknown) {
      log.warn({ err: (e as Error).message }, "scheduler tick failed");
    }
  }

  setInterval(tick, tickMs);
  log.info({ tickMs }, "scheduler started");
}
