import type { FastifyPluginAsync } from "fastify";
import argon2 from "argon2";
import crypto from "node:crypto";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import { prisma } from "@vexo/db";
import {
  LoginSchema,
  RefreshSchema,
  TotpVerifySchema,
  TotpChallengeSchema,
  TotpDisableSchema,
} from "@vexo/shared";
import { encrypt, decrypt } from "../lib/crypto";

const REFRESH_TTL_DAYS = 30;
const ENFORCE_2FA_ROLES = new Set(["SUPER_ADMIN", "ADMIN"]);

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function userPrivileged(userId: string): Promise<boolean> {
  const memberships = await prisma.organizationUser.findMany({
    where: { userId },
    include: { role: true },
  });
  return memberships.some((m) => ENFORCE_2FA_ROLES.has(m.role.name));
}

async function issueRefreshToken(userId: string, ip?: string, ua?: string, device?: string) {
  const raw = crypto.randomBytes(48).toString("base64url");
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 86_400_000);
  await prisma.userSession.create({
    data: {
      userId,
      refreshTokenHash: hashToken(raw),
      expiresAt,
      ipAddress: ip,
      userAgent: ua?.slice(0, 200),
      deviceName: device,
    },
  });
  return raw;
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  // POST /login
  app.post(
    "/login",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (req, reply) => {
      const body = LoginSchema.parse(req.body);
      const user = await prisma.user.findUnique({ where: { email: body.email } });
      if (!user || !user.isActive) return reply.unauthorized("invalid credentials");
      const ok = await argon2.verify(user.passwordHash, body.password);
      if (!ok) return reply.unauthorized("invalid credentials");

      // 2FA gate
      if (user.totpEnabled) {
        const challenge = await prisma.totpChallenge.create({
          data: {
            userId: user.id,
            token: crypto.randomBytes(24).toString("base64url"),
            expiresAt: new Date(Date.now() + 5 * 60_000),
          },
        });
        return { requiresTotpChallenge: true, challengeId: challenge.id };
      }

      // Privileged users without 2FA: allow login but flag setup required
      const privileged = await userPrivileged(user.id);
      const accessToken = await reply.jwtSign({ sub: user.id }, { expiresIn: "15m" });
      const refreshToken = await issueRefreshToken(
        user.id,
        req.ip,
        req.headers["user-agent"],
        (req.headers["x-device-name"] as string) ?? undefined,
      );
      await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      return { accessToken, refreshToken, requires2faSetup: privileged };
    },
  );

  // POST /2fa/challenge — verify TOTP after login
  app.post("/2fa/challenge", async (req, reply) => {
    const body = TotpChallengeSchema.parse(req.body);
    const challenge = await prisma.totpChallenge.findUnique({ where: { id: body.challengeId } });
    if (!challenge || challenge.used || challenge.expiresAt < new Date()) {
      return reply.unauthorized("invalid challenge");
    }
    const user = await prisma.user.findUniqueOrThrow({ where: { id: challenge.userId } });
    if (!user.totpSecret) return reply.unauthorized("totp not configured");
    const valid = authenticator.check(body.token, decrypt(user.totpSecret));
    if (!valid) return reply.unauthorized("invalid token");

    await prisma.totpChallenge.update({ where: { id: challenge.id }, data: { used: true } });
    const accessToken = await reply.jwtSign({ sub: user.id }, { expiresIn: "15m" });
    const refreshToken = await issueRefreshToken(user.id, req.ip, req.headers["user-agent"]);
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return { accessToken, refreshToken };
  });

  // POST /refresh
  app.post("/refresh", async (req, reply) => {
    const { refreshToken } = RefreshSchema.parse(req.body);
    const session = await prisma.userSession.findFirst({
      where: {
        refreshTokenHash: hashToken(refreshToken),
        expiresAt: { gt: new Date() },
        isActive: true,
      },
    });
    if (!session) return reply.unauthorized("invalid refresh token");
    const accessToken = await reply.jwtSign({ sub: session.userId }, { expiresIn: "15m" });
    return { accessToken };
  });

  // POST /logout
  app.post("/logout", { preHandler: [app.requireAuth] }, async (req) => {
    await prisma.userSession.updateMany({
      where: { userId: req.currentUser!.id, isActive: true },
      data: { isActive: false },
    });
    return { ok: true };
  });

  // GET /me
  app.get("/me", { preHandler: [app.requireAuth] }, async (req) => {
    const u = await prisma.user.findUnique({
      where: { id: req.currentUser!.id },
      select: {
        id: true, email: true, username: true, fullName: true,
        totpEnabled: true,
        organizations: {
          include: { organization: { select: { id: true, name: true, slug: true, plan: true } }, role: { select: { name: true } } },
        },
      },
    });
    return {
      user: u,
      currentOrganizationId: req.organizationId,
      memberships: req.currentUser!.memberships.map((m) => ({
        organizationId: m.organizationId,
        roleName: m.roleName,
        isOwner: m.isOwner,
        permissions: [...m.permissions],
      })),
    };
  });

  // ----- 2FA management -----

  // POST /2fa/setup — generate secret + QR code (not yet enabled)
  app.post("/2fa/setup", { preHandler: [app.requireAuth] }, async (req) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.currentUser!.id } });
    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri(user.email, "VEXO Studio", secret);
    const qrDataUrl = await QRCode.toDataURL(otpauth);
    await prisma.user.update({
      where: { id: user.id },
      data: { totpSecret: encrypt(secret), totpEnabled: false },
    });
    return { secret, otpauth, qrDataUrl };
  });

  // POST /2fa/verify — confirm token + enable
  app.post("/2fa/verify", { preHandler: [app.requireAuth] }, async (req, reply) => {
    const body = TotpVerifySchema.parse(req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.currentUser!.id } });
    if (!user.totpSecret) return reply.badRequest("call /2fa/setup first");
    const valid = authenticator.check(body.token, decrypt(user.totpSecret));
    if (!valid) return reply.badRequest("invalid token");
    await prisma.user.update({
      where: { id: user.id },
      data: { totpEnabled: true, totpVerifiedAt: new Date() },
    });
    return { ok: true };
  });

  // POST /2fa/disable
  app.post("/2fa/disable", { preHandler: [app.requireAuth] }, async (req, reply) => {
    const body = TotpDisableSchema.parse(req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.currentUser!.id } });
    const passOk = await argon2.verify(user.passwordHash, body.password);
    if (!passOk) return reply.unauthorized("invalid password");
    if (!user.totpSecret) return reply.badRequest("totp not enabled");
    const valid = authenticator.check(body.token, decrypt(user.totpSecret));
    if (!valid) return reply.badRequest("invalid token");
    if (await userPrivileged(user.id)) {
      return reply.forbidden("2FA cannot be disabled for ADMIN/SUPER_ADMIN");
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { totpEnabled: false, totpSecret: null, totpVerifiedAt: null },
    });
    return { ok: true };
  });

  // ----- Sessions -----

  app.get("/sessions", { preHandler: [app.requireAuth] }, async (req) =>
    prisma.userSession.findMany({
      where: { userId: req.currentUser!.id, isActive: true, expiresAt: { gt: new Date() } },
      select: {
        id: true, deviceName: true, ipAddress: true, userAgent: true,
        createdAt: true, expiresAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
  );

  app.delete<{ Params: { id: string } }>(
    "/sessions/:id",
    { preHandler: [app.requireAuth] },
    async (req) => {
      await prisma.userSession.updateMany({
        where: { id: req.params.id, userId: req.currentUser!.id },
        data: { isActive: false },
      });
      return { ok: true };
    },
  );
};
