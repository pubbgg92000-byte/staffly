import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  Logger.log(`Staffly API listening on http://localhost:${port}`, "Bootstrap");
}

void bootstrap();
