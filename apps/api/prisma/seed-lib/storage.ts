/**
 * Seed storage helper — generate small valid PDF binaries and upload them to
 * the configured object store (MinIO in dev / R2 in prod) so seeded document
 * rows point at real, downloadable objects.
 *
 * Used only by the demo seed. Kept dependency-light: a hand-rolled minimal but
 * spec-valid single-page PDF, sized up to a target by padding a comment block.
 */
import {
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { loadEnv } from "../../src/infra/config/env";

/**
 * A minimal, valid one-page PDF that renders the given title, padded with a
 * trailing comment so the file reaches roughly `targetBytes` (real documents
 * vary in size; the demo wants non-trivial, plausible sizes). Returns the exact
 * bytes — callers store `buf.length` as sizeBytes so the DB matches the object.
 */
export function makePdf(title: string, targetBytes = 0): Buffer {
  const safe = title.replace(/[()\\]/g, " ").slice(0, 80);
  const objects: string[] = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n",
  ];
  const stream = `BT /F1 18 Tf 72 720 Td (${safe}) Tj ET`;
  objects.push(
    `4 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`,
  );
  objects.push(
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
  );

  const header = "%PDF-1.4\n";
  // Build the body and record byte offsets for the xref table.
  let body = "";
  const offsets: number[] = [];
  let pos = header.length;
  for (const obj of objects) {
    offsets.push(pos);
    body += obj;
    pos += Buffer.byteLength(obj, "latin1");
  }

  // Optional padding via a PDF comment so the file hits ~targetBytes. Comments
  // (lines starting with %) are ignored by readers, so the PDF stays valid.
  let padding = "";
  const provisional = header.length + Buffer.byteLength(body, "latin1");
  if (targetBytes > provisional + 200) {
    const padLen = targetBytes - provisional - 120;
    padding = `%${"P".repeat(Math.max(0, padLen))}\n`;
  }

  const xrefStart = header.length + Buffer.byteLength(body + padding, "latin1");
  const count = objects.length + 1; // + the free object 0
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    xref += `${String(off).padStart(10, "0")} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return Buffer.from(header + body + padding + xref + trailer, "latin1");
}

/** Build an S3 client from env, or return null when storage is not configured. */
export function seedStorageClient(): {
  s3: S3Client;
  bucket: string;
} | null {
  const env = loadEnv();
  if (!env.S3_ENDPOINT || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
    return null;
  }
  const config: S3ClientConfig = {
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
  };
  return { s3: new S3Client(config), bucket: env.S3_BUCKET };
}

/** Upload one object. Throws on failure so the seed fails loudly. */
export async function putObject(
  client: { s3: S3Client; bucket: string },
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  await client.s3.send(
    new PutObjectCommand({
      Bucket: client.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}
