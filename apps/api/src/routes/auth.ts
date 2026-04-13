import type { FastifyPluginAsync } from "fastify";
import argon2 from "argon2";
import crypto from "node:crypto";
import { prisma } from "@vexo/db";
import { LoginSchema, RefreshSchema } from "@vexo/shared";

const REFRESH_TTL_DAYS = 30;

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post("/login", async (req, reply) => {
    const body = LoginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user || !user.isActive) return reply.unauthorized("invalid credentials");
    const ok = await argon2.verify(user.passwordHash, body.password);
    if (!ok) return reply.unauthorized("invalid credentials");

    const accessToken = await reply.jwtSign({ sub: user.id }, { expiresIn: "15m" });
    const refreshTokenRaw = crypto.randomBytes(48).toString("base64url");
    const refreshTokenHash = hashToken(refreshTokenRaw);
    const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 86_400_000);

    await prisma.userSession.create({
      data: {
        userId: user.id,
        refreshTokenHash,
        expiresAt,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"]?.slice(0, 200),
      },
    });
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    return { accessToken, refreshToken: refreshTokenRaw };
  });

  app.post("/refresh", async (req, reply) => {
    const { refreshToken } = RefreshSchema.parse(req.body);
    const session = await prisma.userSession.findFirst({
      where: { refreshTokenHash: hashToken(refreshToken), expiresAt: { gt: new Date() } },
    });
    if (!session) return reply.unauthorized("invalid refresh token");
    const accessToken = await reply.jwtSign({ sub: session.userId }, { expiresIn: "15m" });
    return { accessToken };
  });

  app.post("/logout", { preHandler: [app.requireAuth] }, async (req) => {
    await prisma.userSession.deleteMany({ where: { userId: req.currentUser!.id } });
    return { ok: true };
  });

  app.get("/me", { preHandler: [app.requireAuth] }, async (req) => {
    const u = await prisma.user.findUnique({
      where: { id: req.currentUser!.id },
      select: { id: true, email: true, username: true, fullName: true, role: { select: { name: true } } },
    });
    return { user: u, permissions: [...req.currentUser!.permissions] };
  });
};
