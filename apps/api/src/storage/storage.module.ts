import { Inject, Injectable, Logger, Module } from "@nestjs/common";
import { Client as MinioClient } from "minio";
import { loadEnv } from "../infra/config/env";

/**
 * The slice of S3-style functionality the documents module actually uses.
 * We isolate against this interface so tests can inject a deterministic
 * in-memory stub without spinning MinIO up.
 */
export interface StorageClient {
  presignedPutObject(
    bucket: string,
    key: string,
    expirySeconds: number,
  ): Promise<string>;
  presignedGetObject(
    bucket: string,
    key: string,
    expirySeconds: number,
    reqParams?: Record<string, string>,
  ): Promise<string>;
  removeObject(bucket: string, key: string): Promise<void>;
}

export const STORAGE_CLIENT = Symbol("STORAGE_CLIENT");

/**
 * Decide where in the bucket an uploaded object lives. The convention is:
 *
 *   uploads/{orgId}/{intent}/{uuidv7-or-random}/{slugified-filename}
 *
 * Why include the original filename rather than a pure UUID:
 *   - Easier debugging when staring at the bucket
 *   - Some clients (curl, MinIO console) infer Content-Disposition
 *     from the trailing path segment
 *
 * Why include the intent prefix:
 *   - Allows bucket-policy partitioning later ("photos" vs "documents")
 *   - Makes `mc ls` triage faster
 */
export function objectKey(
  organizationId: string,
  intent: string,
  randomToken: string,
  fileName: string,
): string {
  const safe = fileName
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_")
    // Collapse `..` (and longer runs) so a malicious filename cannot escape
    // its prefix even if a downstream consumer interprets the segment as a
    // path. We keep a single `.` so legitimate extensions survive.
    .replace(/\.{2,}/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 200);
  return `uploads/${organizationId}/${intent}/${randomToken}/${safe || "file"}`;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(@Inject(STORAGE_CLIENT) private readonly client: StorageClient) {}

  /**
   * Return a short-lived PUT URL the client can upload to directly.
   * Bucket name comes from env so tests can swap it.
   */
  async presignUpload(
    key: string,
  ): Promise<{ url: string; expiresIn: number }> {
    const env = loadEnv();
    const url = await this.client.presignedPutObject(
      env.S3_BUCKET,
      key,
      env.S3_PRESIGN_TTL_SECONDS,
    );
    return { url, expiresIn: env.S3_PRESIGN_TTL_SECONDS };
  }

  /** Short-lived GET URL. Optional `downloadName` sets Content-Disposition. */
  async presignDownload(
    key: string,
    downloadName?: string,
  ): Promise<{ url: string; expiresIn: number }> {
    const env = loadEnv();
    const params: Record<string, string> | undefined = downloadName
      ? {
          "response-content-disposition": `attachment; filename="${downloadName.replace(
            /"/g,
            "",
          )}"`,
        }
      : undefined;
    const url = await this.client.presignedGetObject(
      env.S3_BUCKET,
      key,
      env.S3_PRESIGN_TTL_SECONDS,
      params,
    );
    return { url, expiresIn: env.S3_PRESIGN_TTL_SECONDS };
  }

  async remove(key: string): Promise<void> {
    const env = loadEnv();
    try {
      await this.client.removeObject(env.S3_BUCKET, key);
    } catch (e) {
      // Storage removal is best-effort; not a fatal path for the calling
      // mutation (the row pointing at the key is already gone or about to be).
      this.logger.warn(
        `removeObject failed for ${key}: ${(e as Error).message}`,
      );
    }
  }
}

/**
 * Build a real MinIO client from env when running in dev/prod. If env vars
 * are missing the factory returns a lazy stub that throws on use — that way
 * the API can boot without storage configured, and tests can override the
 * STORAGE_CLIENT token entirely.
 */
function buildClientFromEnv(): StorageClient {
  const env = loadEnv();
  if (!env.S3_ENDPOINT || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
    return {
      presignedPutObject: () =>
        Promise.reject(new Error("storage not configured")),
      presignedGetObject: () =>
        Promise.reject(new Error("storage not configured")),
      removeObject: () => Promise.reject(new Error("storage not configured")),
    };
  }
  const url = new URL(env.S3_ENDPOINT);
  return new MinioClient({
    endPoint: url.hostname,
    port: Number(url.port) || (url.protocol === "https:" ? 443 : 80),
    useSSL: url.protocol === "https:",
    accessKey: env.S3_ACCESS_KEY_ID,
    secretKey: env.S3_SECRET_ACCESS_KEY,
    region: env.S3_REGION,
  });
}

@Module({
  providers: [
    { provide: STORAGE_CLIENT, useFactory: buildClientFromEnv },
    StorageService,
  ],
  exports: [STORAGE_CLIENT, StorageService],
})
export class StorageModule {}
