import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";

const prisma = new PrismaClient();

const ROLE_NAMES = [
  "SUPER_ADMIN",
  "ADMIN",
  "DIRECTOR",
  "CONTENT_EDITOR",
  "AI_OPERATOR",
  "FINANCE_VIEWER",
  "VIEWER",
];

const PERMISSION_KEYS = [
  "manage_users",
  "manage_roles",
  "manage_providers",
  "manage_tokens",
  "view_finance",
  "manage_finance",
  "create_project",
  "edit_project",
  "delete_project",
  "manage_distribution",
  "generate_assets",
  "approve_scene",
  "publish_episode",
  "manage_ai_director",
  "view_logs",
  "manage_music",
  "manage_subtitles",
  "manage_dubbing",
];

const ROLE_PERMISSION_MAP: Record<string, string[]> = {
  SUPER_ADMIN: PERMISSION_KEYS,
  ADMIN: PERMISSION_KEYS.filter((p) => p !== "manage_roles"),
  DIRECTOR: [
    "create_project",
    "edit_project",
    "generate_assets",
    "approve_scene",
    "publish_episode",
    "manage_ai_director",
    "manage_music",
    "manage_subtitles",
    "manage_dubbing",
    "view_finance",
    "view_logs",
  ],
  CONTENT_EDITOR: ["edit_project", "generate_assets", "approve_scene", "manage_music", "manage_subtitles"],
  AI_OPERATOR: ["generate_assets", "manage_ai_director", "view_logs"],
  FINANCE_VIEWER: ["view_finance"],
  VIEWER: ["view_logs"],
};

async function main() {
  console.log("[seed] permissions");
  for (const key of PERMISSION_KEYS) {
    await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key, description: key.replace(/_/g, " ") },
    });
  }

  console.log("[seed] roles");
  for (const name of ROLE_NAMES) {
    await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name, description: `${name} role` },
    });
  }

  console.log("[seed] role-permissions");
  for (const [roleName, permKeys] of Object.entries(ROLE_PERMISSION_MAP)) {
    const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
    for (const key of permKeys) {
      const perm = await prisma.permission.findUniqueOrThrow({ where: { key } });
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        update: {},
        create: { roleId: role.id, permissionId: perm.id },
      });
    }
  }

  console.log("[seed] super admin");
  const superAdminRole = await prisma.role.findUniqueOrThrow({ where: { name: "SUPER_ADMIN" } });
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@vexo.studio";
  const username = process.env.SEED_ADMIN_USERNAME ?? "admin";
  const fullName = process.env.SEED_ADMIN_FULLNAME ?? "Super Admin";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "Vexo@2025!";
  const passwordHash = await argon2.hash(password);

  await prisma.user.upsert({
    where: { email },
    update: { passwordHash, isActive: true, roleId: superAdminRole.id, fullName, username },
    create: { email, username, fullName, passwordHash, isActive: true, roleId: superAdminRole.id },
  });

  console.log(`[seed] done. super admin: ${email}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
