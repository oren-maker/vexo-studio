import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import sensible from "@fastify/sensible";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import IORedis from "ioredis";
import { prisma } from "@vexo/db";
import { connection as queueRedis } from "@vexo/queue";
import { authPlugin } from "./middleware/auth";
import { orgPlugin } from "./middleware/organization";
import { authRoutes } from "./routes/auth";
import { userRoutes } from "./routes/users";
import { roleRoutes } from "./routes/roles";
import { providerRoutes } from "./routes/providers";
import { walletRoutes } from "./routes/wallets";
import { organizationRoutes } from "./routes/organizations";
import { apiKeyRoutes } from "./routes/api-keys";
import { webhookRoutes } from "./routes/webhooks";
import { notificationRoutes } from "./routes/notifications";

const app = Fastify({
  logger: {
    transport:
      process.env.NODE_ENV === "development"
        ? { target: "pino-pretty", options: { colorize: true } }
        : undefined,
  },
});

async function bootstrap() {
  await app.register(helmet);
  await app.register(cors, { origin: process.env.CORS_ORIGIN ?? "*", credentials: true });
  await app.register(sensible);
  await app.register(rateLimit, {
    global: false,
    max: 300,
    timeWindow: "1 minute",
    redis: new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null }),
  });
  await app.register(jwt, {
    secret: process.env.JWT_ACCESS_SECRET ?? "dev-access",
  });
  await app.register(authPlugin);
  await app.register(orgPlugin);

  // Health (no auth)
  const healthHandler = async () => {
    const dbOk = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
    const redisOk = await queueRedis.ping().then((r) => r === "PONG").catch(() => false);
    return { status: dbOk && redisOk ? "ok" : "degraded", db: dbOk, redis: redisOk };
  };
  app.get("/api/v1/health", healthHandler);
  app.get("/api/v1/ready", healthHandler);
  app.get("/health", healthHandler);

  // v1 routes
  await app.register(authRoutes, { prefix: "/api/v1/auth" });
  await app.register(organizationRoutes, { prefix: "/api/v1/organizations" });
  await app.register(userRoutes, { prefix: "/api/v1/users" });
  await app.register(roleRoutes, { prefix: "/api/v1/roles" });
  await app.register(providerRoutes, { prefix: "/api/v1/providers" });
  await app.register(walletRoutes, { prefix: "/api/v1/finance/wallets" });
  await app.register(apiKeyRoutes, { prefix: "/api/v1/api-keys" });
  await app.register(webhookRoutes, { prefix: "/api/v1/webhooks" });
  await app.register(notificationRoutes, { prefix: "/api/v1/notifications" });

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen({ port, host: "0.0.0.0" });
  app.log.info(`vexo-api listening on :${port}`);
}

bootstrap().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
