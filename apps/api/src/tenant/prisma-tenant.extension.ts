import { Prisma } from "@prisma/client";
import {
  currentOrganizationId,
  TenantBoundaryViolation,
} from "./tenant-context";

/**
 * Models that are NOT tenant-scoped — the extension does not touch their queries.
 * Permission is a global catalog; AuditLog is tenant-scoped but writes happen via
 * a dedicated repository that bypasses the extension by construction.
 */
const TENANT_OPT_OUT: ReadonlySet<string> = new Set(["Permission"]);

const READ_OPS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
]);

const MUTATE_OPS = new Set(["update", "updateMany", "delete", "deleteMany"]);

const CREATE_OPS = new Set(["create", "createMany", "createManyAndReturn"]);

const UPSERT_OPS = new Set(["upsert"]);

export type ExtensionArgs = Record<string, unknown>;

export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function assertWhereOrgMatches(
  where: unknown,
  orgId: string,
  model: string,
  op: string,
): void {
  if (!isPlainObject(where)) return;
  const explicit = where["organizationId"];
  if (typeof explicit === "string" && explicit !== orgId) {
    throw new TenantBoundaryViolation(
      `${model}.${op}: explicit organizationId="${explicit}" does not match active tenant "${orgId}".`,
    );
  }
}

export function withTenantWhere(
  args: ExtensionArgs | undefined,
  orgId: string,
  model: string,
  op: string,
): ExtensionArgs {
  const next: ExtensionArgs = args ? { ...args } : {};
  const existingWhere = isPlainObject(next.where)
    ? (next.where as Record<string, unknown>)
    : {};
  assertWhereOrgMatches(existingWhere, orgId, model, op);
  next.where = { AND: [{ organizationId: orgId }, existingWhere] };
  return next;
}

export function withTenantData(
  args: ExtensionArgs | undefined,
  orgId: string,
): ExtensionArgs {
  const next: ExtensionArgs = args ? { ...args } : {};
  if (Array.isArray(next.data)) {
    next.data = (next.data as ExtensionArgs[]).map((row) =>
      isPlainObject(row) ? { organizationId: orgId, ...row } : row,
    );
  } else if (isPlainObject(next.data)) {
    next.data = { organizationId: orgId, ...next.data };
  } else if (next.data === undefined) {
    next.data = { organizationId: orgId };
  }
  return next;
}

/**
 * Build the Prisma client extension that enforces row-scoped multi-tenancy.
 *
 * The extension is **opt-in per query**: if no tenant context is active on the async
 * chain (e.g. unauthenticated routes, seeds, the OrgBootstrapService) queries pass
 * through unmodified. This lets sign-up create the very first Organization row safely.
 *
 * When a tenant context IS active:
 *   - read queries get `where.organizationId = <ctx>` injected (preserving any caller-
 *     supplied `where`).
 *   - create queries get `data.organizationId = <ctx>` injected.
 *   - update/delete queries get `where.organizationId = <ctx>` injected.
 *   - any explicit `where.organizationId` that does not match raises
 *     `TenantBoundaryViolation`.
 *
 * Verified by apps/api/test/tenant/isolation.spec.ts against the assertions listed
 * in docs/02-database-design.md § 8.
 */
export function tenantExtension() {
  return Prisma.defineExtension({
    name: "staffly-tenant",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || TENANT_OPT_OUT.has(model)) return query(args);
          const orgId = currentOrganizationId();
          if (!orgId) return query(args);

          if (READ_OPS.has(operation) || MUTATE_OPS.has(operation)) {
            return query(
              withTenantWhere(args as ExtensionArgs, orgId, model, operation),
            );
          }
          if (CREATE_OPS.has(operation)) {
            return query(withTenantData(args as ExtensionArgs, orgId));
          }
          if (UPSERT_OPS.has(operation)) {
            const a = (args as ExtensionArgs) ?? {};
            const merged: ExtensionArgs = {
              ...a,
              where: withTenantWhere(
                { where: a.where },
                orgId,
                model,
                operation,
              ).where,
            };
            if (isPlainObject(a.create)) {
              merged.create = {
                organizationId: orgId,
                ...(a.create as ExtensionArgs),
              };
            }
            return query(merged);
          }
          return query(args);
        },
      },
    },
  });
}
