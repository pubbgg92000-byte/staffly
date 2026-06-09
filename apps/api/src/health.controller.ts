import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { Public } from "./auth/decorators/public.decorator";
import { PrismaService } from "./infra/prisma/prisma.service";
import { StorageService } from "./storage/storage.module";

interface ReadyReport {
  status: "ok" | "degraded";
  checks: {
    database: "ok" | "fail";
    storage: "ok" | "skipped" | "fail";
  };
}

/** 503 carrying the readiness breakdown as its JSON body. */
class ServiceNotReady extends HttpException {
  constructor(report: ReadyReport) {
    super(report, HttpStatus.SERVICE_UNAVAILABLE);
  }
}

/**
 * Liveness + readiness endpoints. @Public() so they don't require auth and
 * @SkipThrottle() so uptime monitors polling them never trip the rate limiter.
 *
 *   /healthz — liveness: the process is up and serving. No dependency checks.
 *   /readyz  — readiness: Postgres reachable + (if configured) object storage
 *              reachable. Returns 503 when a dependency is down so load
 *              balancers / uptime monitors detect outages, not just crashes.
 */
@Public()
@SkipThrottle()
@Controller()
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  @Get("/healthz")
  healthz(): { status: "ok" } {
    return { status: "ok" };
  }

  @Get("/readyz")
  async readyz(): Promise<ReadyReport> {
    const [database, storage] = await Promise.all([
      this.probeDatabase(),
      this.probeStorage(),
    ]);

    const report: ReadyReport = {
      status: database === "ok" && storage !== "fail" ? "ok" : "degraded",
      checks: { database, storage },
    };

    if (report.status !== "ok") throw new ServiceNotReady(report);
    return report;
  }

  private async probeDatabase(): Promise<"ok" | "fail"> {
    try {
      await this.prisma.db.$queryRaw`SELECT 1`;
      return "ok";
    } catch (e) {
      this.logger.warn(
        `readyz: database probe failed: ${(e as Error).message}`,
      );
      return "fail";
    }
  }

  private async probeStorage(): Promise<"ok" | "skipped" | "fail"> {
    try {
      return await this.storage.healthCheck();
    } catch (e) {
      this.logger.warn(`readyz: storage probe failed: ${(e as Error).message}`);
      return "fail";
    }
  }
}
