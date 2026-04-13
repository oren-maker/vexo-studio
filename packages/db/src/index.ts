import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __vexoPrisma: PrismaClient | undefined;
}

export const prisma =
  global.__vexoPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.__vexoPrisma = prisma;
}

export * from "@prisma/client";
