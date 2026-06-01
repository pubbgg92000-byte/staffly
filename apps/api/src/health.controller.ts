import { Controller, Get } from "@nestjs/common";

/**
 * Liveness + readiness endpoints. In Batch 3 the readyz check will also probe
 * Postgres and Redis; for Batch 1 it returns a static `ok`.
 */
@Controller()
export class HealthController {
  @Get("/healthz")
  healthz(): { status: "ok" } {
    return { status: "ok" };
  }

  @Get("/readyz")
  readyz(): { status: "ok" } {
    return { status: "ok" };
  }
}
