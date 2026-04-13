import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import sensible from "@fastify/sensible";
import jwt from "@fastify/jwt";
import { authRoutes } from "./routes/auth";
import { userRoutes } from "./routes/users";
import { roleRoutes } from "./routes/roles";
import { providerRoutes } from "./routes/providers";
import { walletRoutes } from "./routes/wallets";
import { authPlugin } from "./middleware/auth";

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
  await app.register(jwt, {
    secret: {
      private: process.env.JWT_ACCESS_SECRET ?? "dev-access",
      public: process.env.JWT_ACCESS_SECRET ?? "dev-access",
    },
  });
  await app.register(authPlugin);

  app.get("/health", async () => ({ status: "ok", service: "vexo-api" }));

  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(userRoutes, { prefix: "/api/users" });
  await app.register(roleRoutes, { prefix: "/api/roles" });
  await app.register(providerRoutes, { prefix: "/api/providers" });
  await app.register(walletRoutes, { prefix: "/api/finance/wallets" });

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen({ port, host: "0.0.0.0" });
  app.log.info(`vexo-api listening on :${port}`);
}

bootstrap().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
