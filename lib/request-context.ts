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
};

const storage = new AsyncLocalStorage<RequestActor>();

export function setRequestActor(actor: RequestActor) {
  storage.enterWith(actor);
}

export function getRequestActor(): RequestActor | undefined {
  return storage.getStore();
}
