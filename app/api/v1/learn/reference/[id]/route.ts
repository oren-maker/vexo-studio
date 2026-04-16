import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/learn/db";
import { requireAdmin } from "@/lib/learn/auth";

export const runtime = "nodejs";

// Snapshot current state BEFORE any mutation so rollback is possible.
async function snapshotRef(refId: string, changedBy: string, reason?: string) {
  const cur: any = await prisma.brainReference.findUnique({ where: { id: refId } });
  if (!cur) return;
  await (prisma as any).brainReferenceVersion.create({
    data: {
      referenceId: cur.id,
      version: cur.version ?? 1,
      kind: cur.kind,
      name: cur.name,
      shortDesc: cur.shortDesc,
      longDesc: cur.longDesc,
      tags: cur.tags,
      changedBy,
      reason: reason ?? null,
    },
  });
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;
  const item: any = await prisma.brainReference.findUnique({ where: { id: params.id } });
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });
  const versions: any[] = await (prisma as any).brainReferenceVersion.findMany({
    where: { referenceId: params.id },
    orderBy: { version: "desc" },
    take: 50,
  });
  return NextResponse.json({ item, versions });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;
  const body = await req.json();
  const data: Record<string, any> = {};
  if (typeof body.name === "string") data.name = body.name.trim();
  if (typeof body.shortDesc === "string") data.shortDesc = body.shortDesc.trim();
  if (typeof body.longDesc === "string") data.longDesc = body.longDesc.trim();
  if (Array.isArray(body.tags)) data.tags = body.tags.map((t: any) => String(t)).slice(0, 10);
  if (typeof body.order === "number") data.order = body.order;
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "no fields" }, { status: 400 });
  try {
    // 1. Snapshot current version so we can roll back later.
    await snapshotRef(params.id, String(body.changedBy || "user"), String(body.reason || ""));
    // 2. Bump version + apply changes.
    const cur: any = await prisma.brainReference.findUnique({ where: { id: params.id }, select: { version: true } });
    const item: any = await prisma.brainReference.update({
      where: { id: params.id },
      data: { ...data, version: (cur?.version ?? 1) + 1 },
    });
    return NextResponse.json({ item });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}

// Rollback endpoint via POST — body: { rollbackToVersion: number }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;
  const body = await req.json();
  const targetVersion = Number(body.rollbackToVersion);
  if (!targetVersion || targetVersion < 1) {
    return NextResponse.json({ error: "rollbackToVersion required" }, { status: 400 });
  }
  const snapshot: any = await (prisma as any).brainReferenceVersion.findFirst({
    where: { referenceId: params.id, version: targetVersion },
  });
  if (!snapshot) return NextResponse.json({ error: "version not found" }, { status: 404 });
  // Snapshot current BEFORE overwriting, then apply the historic values.
  await snapshotRef(params.id, "user", `rollback to v${targetVersion}`);
  const cur: any = await prisma.brainReference.findUnique({ where: { id: params.id }, select: { version: true } });
  const item: any = await prisma.brainReference.update({
    where: { id: params.id },
    data: {
      name: snapshot.name,
      shortDesc: snapshot.shortDesc,
      longDesc: snapshot.longDesc,
      tags: snapshot.tags,
      version: (cur?.version ?? 1) + 1,
    },
  });
  return NextResponse.json({ item, rolledBackTo: targetVersion });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;
  try {
    // Mark as invalid instead of hard delete — soft delete with validTo.
    // Set validTo=now, keep the row for audit. Next PATCH can revive by setting validTo=null.
    const item: any = await prisma.brainReference.update({
      where: { id: params.id },
      data: { validTo: new Date() } as any,
    });
    return NextResponse.json({ ok: true, softDeleted: true, item });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
