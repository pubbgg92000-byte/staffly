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
  await app.listen(env.PORT);
  Logger.log(
    `Staffly API listening on http://localhost:${env.PORT}`,
    "Bootstrap",
  );
}

void bootstrap();
