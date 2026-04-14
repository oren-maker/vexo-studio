/**
 * Per-request audit context.
 *
 * authenticate() calls setRequestActor() with the resolved user/org so that
 * the Prisma extension downstream can attach actor info to AuditLog entries
 * without every endpoint having to thread context through.
 *
 * Uses AsyncLocalStorage.enterWith() — once set, every async descendant in
 * the same request inherits the context. Safe under serverless concurrency.
 */
import { AsyncLocalStorage } from "node:async_hooks";

export type RequestActor = {
  organizationId: string;
  userId: string;
  ipAddress?: string;
  /** Set by endpoints once they resolve which project they're acting on,
   * so background helpers (e.g. Gemini cost charging) can attribute spend. */
  projectId?: string;
};

const storage = new AsyncLocalStorage<RequestActor>();

export function setRequestActor(actor: RequestActor) {
  storage.enterWith(actor);
}

export function getRequestActor(): RequestActor | undefined {
  return storage.getStore();
}

/** Annotate the current request with the project the endpoint is acting on.
 * Idempotent — call as many times as you like. Safe even if no actor is set. */
export function setActiveProject(projectId: string) {
  const cur = storage.getStore();
  if (!cur) return;
  storage.enterWith({ ...cur, projectId });
}
