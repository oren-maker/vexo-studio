import { PrismaClient, OrgPlan } from "@prisma/client";
import bcrypt from "bcryptjs";

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
  "manage_api_keys",
  "manage_webhooks",
  "manage_organization",
  "manage_templates",
  "manage_calendar",
  "view_audience_insights",
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
    "manage_calendar",
    "manage_templates",
    "view_finance",
    "view_logs",
    "view_audience_insights",
  ],
  CONTENT_EDITOR: [
    "edit_project",
    "generate_assets",
    "approve_scene",
    "manage_music",
    "manage_subtitles",
    "manage_calendar",
  ],
  AI_OPERATOR: ["generate_assets", "manage_ai_director", "view_logs"],
  FINANCE_VIEWER: ["view_finance"],
  VIEWER: ["view_logs", "view_audience_insights"],
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

  console.log("[seed] default organization");
  const orgSlug = "vexo-default";
  const org = await prisma.organization.upsert({
    where: { slug: orgSlug },
    update: {},
    create: {
      name: "VEXO Default",
      slug: orgSlug,
      plan: OrgPlan.STUDIO,
      maxProjects: 9999,
      maxEpisodes: 9999,
      whitelabelEnabled: true,
    },
  });

  console.log("[seed] super admin");
  const superAdminRole = await prisma.role.findUniqueOrThrow({ where: { name: "SUPER_ADMIN" } });
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@vexo.studio";
  const username = process.env.SEED_ADMIN_USERNAME ?? "admin";
  const fullName = process.env.SEED_ADMIN_FULLNAME ?? "Super Admin";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "Vexo@2025!";
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, isActive: true, fullName, username },
    create: { email, username, fullName, passwordHash, isActive: true },
  });

  await prisma.organizationUser.upsert({
    where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
    update: { roleId: superAdminRole.id, isOwner: true },
    create: { organizationId: org.id, userId: user.id, roleId: superAdminRole.id, isOwner: true },
  });

  console.log(`[seed] done. super admin: ${email} / org slug: ${org.slug}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
