// Re-export the main vexo-studio Prisma client so the migrated vexo-learn
// code uses ONE shared connection pool (no double client / no exhaustion).
export { prisma } from "@/lib/prisma";
