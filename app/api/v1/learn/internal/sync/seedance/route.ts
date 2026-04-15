import { NextRequest, NextResponse } from "next/server";
import { syncSeedanceRepo } from "@/lib/learn/seedance-parser";

export const maxDuration = 300;

function checkAuth(req: NextRequest) {
  const key = req.headers.get("x-internal-key");
  return key && key === process.env.INTERNAL_API_KEY;
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const result = await syncSeedanceRepo();
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
