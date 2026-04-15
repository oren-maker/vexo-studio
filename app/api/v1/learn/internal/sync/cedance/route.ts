import { NextRequest, NextResponse } from "next/server";
import { syncCeDanceRepo } from "@/lib/learn/github-cedance";

export const maxDuration = 300;

function checkAuth(req: NextRequest) {
  const key = req.headers.get("x-internal-key");
  return key && key === process.env.INTERNAL_API_KEY;
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { owner, repo, path } = body;
  if (!owner || !repo || !path) {
    return NextResponse.json(
      { error: "owner, repo, path נדרשים", hint: "דוגמה: {owner:'x', repo:'y', path:'prompts'}" },
      { status: 400 }
    );
  }
  try {
    const result = await syncCeDanceRepo({
      owner,
      repo,
      path,
      token: process.env.GITHUB_TOKEN || undefined,
    });
    return NextResponse.json(result);
  } catch (e: any) {
    console.error("[internal sync cedance]", e);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
