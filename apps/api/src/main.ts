import "reflect-metadata";
import "./common/bigint-json";
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
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
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
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
