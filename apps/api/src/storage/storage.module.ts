import {
  Inject,
  Injectable,
  Logger,
  Module,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { loadEnv } from "../infra/config/env";

/**
 * The slice of S3-style functionality the documents module actually uses.
 * We isolate against this interface so tests can inject a deterministic
 * in-memory stub without spinning real storage up.
 *
 * Backed by the AWS SDK v3 against Cloudflare R2 (S3v4-compatible) in
 * dev/prod; tests override the STORAGE_CLIENT token with a stub.
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
  /**
   * Optional liveness probe used by /readyz. Optional so test stubs (which
   * only implement the three methods above) stay valid; when absent the
   * readiness check treats storage as "not probed".
   */
  healthCheck?(bucket: string): Promise<void>;
}

export const STORAGE_CLIENT = Symbol("STORAGE_CLIENT");

class StorageNotConfiguredError extends Error {
  constructor() {
    super("storage not configured");
    this.name = "StorageNotConfiguredError";
  }
}

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
    const url = await this.client
      .presignedPutObject(env.S3_BUCKET, key, env.S3_PRESIGN_TTL_SECONDS)
      .catch((e) => this.mapStorageError(e));
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
    const url = await this.client
      .presignedGetObject(
        env.S3_BUCKET,
        key,
        env.S3_PRESIGN_TTL_SECONDS,
        params,
      )
      .catch((e) => this.mapStorageError(e));
    return { url, expiresIn: env.S3_PRESIGN_TTL_SECONDS };
  }

  /**
   * Presign a GET URL for an optional storage key. Returns null when the key is
   * absent, and degrades to null (rather than throwing) if storage is
   * unconfigured — callers render org data with no logo instead of 500ing.
   */
  async presignOrNull(key: string | null | undefined): Promise<string | null> {
    if (!key) return null;
    try {
      return (await this.presignDownload(key)).url;
    } catch (e) {
      this.logger.warn(
        `presignOrNull failed for ${key}: ${(e as Error).message}`,
      );
      return null;
    }
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

  /**
   * Readiness probe for /readyz. Returns:
   *   - "ok"        — bucket reachable
   *   - "skipped"   — client has no healthCheck (test stub / unconfigured)
   *   - throws      — storage configured but unreachable (caller maps to 503)
   */
  async healthCheck(): Promise<"ok" | "skipped"> {
    if (!this.client.healthCheck) return "skipped";
    const env = loadEnv();
    await this.client.healthCheck(env.S3_BUCKET);
    return "ok";
  }

  private mapStorageError(e: unknown): never {
    if (e instanceof StorageNotConfiguredError) {
      throw new ServiceUnavailableException({
        code: "storage.not_configured",
        message:
          "Object storage is not configured. Set S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET, and S3_REGION to enable uploads.",
      });
    }
    throw e;
  }
}

/**
 * Build an S3v4 client (AWS SDK v3) from env. Target
 * is Cloudflare R2 (`S3_REGION=auto`, path-style addressing). If env vars are
 * missing the factory returns a lazy stub that throws on upload/download use.
 * This keeps the API bootable while disabling storage-backed features until
 * credentials are configured.
 *
 * The presigned-URL architecture is unchanged: the browser uploads/downloads
 * directly against R2 via these short-lived URLs; the API never proxies bytes.
 *
 * Exported for unit tests (readiness "skipped" semantics).
 */
export function buildClientFromEnv(): StorageClient {
  const env = loadEnv();
  if (!env.S3_ENDPOINT || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
    const notConfigured = (): Promise<never> =>
      Promise.reject(new StorageNotConfiguredError());
    return {
      presignedPutObject: notConfigured,
      presignedGetObject: notConfigured,
      removeObject: notConfigured,
      // healthCheck deliberately absent: a storage-less boot is still ready,
      // so /readyz reports storage "skipped" rather than a permanent "fail".
    };
  }

  const s3 = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION, // "auto" for R2
    // R2 requires path-style addressing (no virtual-hosted bucket subdomain).
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
  });

  return {
    presignedPutObject: (bucket, key, expirySeconds) =>
      getSignedUrl(s3, new PutObjectCommand({ Bucket: bucket, Key: key }), {
        expiresIn: expirySeconds,
      }),
    presignedGetObject: (bucket, key, expirySeconds, reqParams) =>
      getSignedUrl(
        s3,
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
          // Map the legacy MinIO param name to the S3 SDK field so callers
          // (StorageService.presignDownload) keep working unchanged.
          ResponseContentDisposition:
            reqParams?.["response-content-disposition"],
        }),
        { expiresIn: expirySeconds },
      ),
    removeObject: async (bucket, key) => {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
    healthCheck: async (bucket) => {
      await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    },
  };
}

@Module({
  providers: [
    { provide: STORAGE_CLIENT, useFactory: buildClientFromEnv },
    StorageService,
  ],
  exports: [STORAGE_CLIENT, StorageService],
})
export class StorageModule {}
