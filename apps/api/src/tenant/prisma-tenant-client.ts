import { PrismaClient } from "@prisma/client";
import { tenantExtension } from "./prisma-tenant.extension";

/**
 * Build a tenant-aware Prisma client.
 *
 * Note: the extended client's TypeScript type is widened because Prisma's
 * `$extends` returns a "DynamicClientExtensionThis" that doesn't satisfy the
 * base `PrismaClient` shape. Consumers should depend on a `TenantPrismaClient`
 * type alias rather than `PrismaClient` directly.
 */
export type TenantPrismaClient = ReturnType<typeof buildTenantClient>;

export function buildTenantClient(
  options?: ConstructorParameters<typeof PrismaClient>[0],
) {
  const base = new PrismaClient(options);
  return base.$extends(tenantExtension()) as unknown as PrismaClient & {
    $disconnect: PrismaClient["$disconnect"];
    $connect: PrismaClient["$connect"];
  };
}
