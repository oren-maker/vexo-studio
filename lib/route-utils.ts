import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function handleError(e: unknown): NextResponse {
  if (e instanceof ZodError) {
    return NextResponse.json({ statusCode: 400, error: "BadRequest", message: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), issues: e.issues }, { status: 400 });
  }
  const err = e as { statusCode?: number; message?: string; stack?: string };
  const status = err.statusCode ?? 500;
  // Log full stack for 500s so Vercel logs show the real source line.
  if (status >= 500) {
    console.error("[route-error]", err.message, "\n", err.stack ?? e);
  }
  return NextResponse.json({ statusCode: status, error: status >= 500 ? "InternalServerError" : "BadRequest", message: err.message ?? String(e) }, { status });
}

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data as object, { status });
}

// JSON-safe BigInt
if (!(BigInt.prototype as unknown as { toJSON?: unknown }).toJSON) {
  (BigInt.prototype as unknown as { toJSON(): string }).toJSON = function () { return this.toString(); };
}
