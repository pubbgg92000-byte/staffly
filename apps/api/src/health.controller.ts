import { Controller, Get } from "@nestjs/common";
import { Public } from "./auth/decorators/public.decorator";

/**
 * Liveness + readiness endpoints. Marked @Public() so they don't require auth.
 * (A deeper readyz that probes Postgres + Redis lands in a later batch.)
 */
@Public()
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
