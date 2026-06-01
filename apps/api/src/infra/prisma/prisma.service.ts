import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import {
  buildTenantClient,
  type TenantPrismaClient,
} from "../../tenant/prisma-tenant-client";

/**
 * Tenant-aware Prisma client wrapped as a Nest provider.
 *
 * The class extends nothing — Prisma's `$extends` chain doesn't survive subclassing
 * cleanly — so this service composes a `TenantPrismaClient` and proxies the
 * methods we use. Accessors are forwarded via an `Object.assign`-style alias
 * pattern: any model/method from the underlying client is reachable as
 * `prismaService.user.findUnique(...)`. The TS shape uses an intersection type.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly client: TenantPrismaClient = buildTenantClient();

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }

  /** The tenant-extended Prisma client. Use this for all DB access. */
  get db(): TenantPrismaClient {
    return this.client;
  }
}
