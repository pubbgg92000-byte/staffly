import "reflect-metadata";
import "./common/bigint-json";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Logger } from "@nestjs/common";
import * as Sentry from "@sentry/node";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import * as path from "node:path";
import { AppModule } from "./app.module";
import { loadEnv } from "./infra/config/env";

// Load .env from the API package root (process.cwd() may be the monorepo root
// when invoked via turbo or pnpm --filter).
try {
  process.loadEnvFile(path.resolve(__dirname, "../.env"));
} catch {
  // .env is optional; loadEnv() will throw a clear error if required vars are missing.
}

async function bootstrap(): Promise<void> {
  const env = loadEnv();

  // ─── Sentry ──────────────────────────────────────────────────────────
  // No-op when SENTRY_DSN is unset (dev/test/CI). The GlobalExceptionFilter
  // forwards unhandled 5xx errors via Sentry.captureException.
  if (env.SENTRY_DSN) {
    Sentry.init({
      dsn: env.SENTRY_DSN,
      environment: env.NODE_ENV,
      // Error-only for the demo; turn on tracing later if needed.
      tracesSampleRate: 0,
    });
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  // ─── Proxy trust + real client IP ────────────────────────────────────
  // Public traffic arrives via Cloudflare edge → Tunnel → Caddy, so the TCP
  // peer is loopback. Trust the loopback hop so `req.ip` resolves the
  // forwarded chain (Caddy sets X-Forwarded-For = CF-Connecting-IP). This is
  // what makes per-IP rate limiting and audit IPs reflect the real visitor.
  // "loopback" is deliberately narrow — we never trust XFF from a non-local
  // peer, so a direct caller cannot spoof its IP.
  app.set("trust proxy", "loopback");

  // Security headers. Defaults are appropriate for a JSON API.
  app.use(helmet());
  app.use(cookieParser());

  // ─── CORS ────────────────────────────────────────────────────────────
  //
  // Browsers refuse `credentials: include` against a server that returns
  // `Access-Control-Allow-Origin: *`, so we must reflect the request's
  // Origin header per-request when it appears on the allowlist. Same-
  // origin / server-to-server / curl calls send no Origin header, and we
  // let those through unmodified (the function signals "no CORS headers
  // needed" by passing `false` as the second argument).
  const allowedOrigins = new Set(env.CORS_ORIGINS);
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ): void => {
      if (!origin) {
        callback(null, false);
        return;
      }
      if (allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS: origin "${origin}" not allowed`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token"],
    // Preflight cache: 10 minutes. Conservative — long enough to skip
    // most repeated preflights, short enough to pick up dev-time origin
    // list edits without restarting the browser.
    maxAge: 600,
  });

  await app.listen(env.PORT);
  Logger.log(
    `Staffly API listening on http://localhost:${env.PORT}`,
    "Bootstrap",
  );
  Logger.log(
    `CORS allowed origins: ${env.CORS_ORIGINS.join(", ")}`,
    "Bootstrap",
  );
}

void bootstrap();
