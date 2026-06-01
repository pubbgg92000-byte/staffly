import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Per-request tenant context. Set by `TenantMiddleware` (Batch 3) immediately after
 * `JwtAuthGuard` resolves the JWT, and read by the Prisma tenant extension on every
 * query.
 *
 * For unauthenticated routes (sign-up, sign-in, health checks) the context is unset
 * and the extension passes queries through unmodified — those endpoints must select
 * their tenant explicitly.
 */
export interface TenantContext {
  organizationId: string;
  userId?: string | undefined;
  requestId?: string | undefined;
}

const storage = new AsyncLocalStorage<TenantContext>();

/** Returns the active tenant context if one is set on this async chain. */
export function currentTenant(): TenantContext | undefined {
  return storage.getStore();
}

/** Convenience for the common case. */
export function currentOrganizationId(): string | undefined {
  return storage.getStore()?.organizationId;
}

/** Run `fn` with the given tenant context active. */
export function runWithTenant<T>(ctx: TenantContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

/** Thrown when a query attempts to cross tenant boundaries. */
export class TenantBoundaryViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantBoundaryViolation";
  }
}
