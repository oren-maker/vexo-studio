import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, isAuthResponse } from "@/lib/auth";

export const runtime = "nodejs";

// Fast character lookup for @-mention autocomplete in the chat.
// Returns up to 8 matches on name prefix (case-insensitive) scoped to the
// authenticated user's orgs. Returns empty array on short queries (<1 char).
export async function GET(req: NextRequest) {
  const ctxOrRes = await authenticate(req);
  if (isAuthResponse(ctxOrRes)) return ctxOrRes;

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 1) return NextResponse.json({ ok: true, results: [] });

  const rows = await prisma.character.findMany({
    where: {
      name: { contains: q, mode: "insensitive" },
      project: { organizationId: ctxOrRes.organizationId },
    },
    select: {
      id: true,
      name: true,
      roleType: true,
      media: { take: 1, orderBy: { createdAt: "asc" }, select: { fileUrl: true } },
      project: { select: { name: true } },
    },
    take: 8,
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    ok: true,
    results: rows.map((r) => ({
      id: r.id,
      name: r.name,
      roleType: r.roleType,
      projectName: r.project.name,
      avatarUrl: r.media[0]?.fileUrl ?? null,
    })),
  });
}
