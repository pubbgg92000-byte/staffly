#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

function loadEnvFile(path) {
  if (!path) return;
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, value] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = value.replace(/^["']|["']$/g, "");
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function bodyToBuffer(body) {
  if (!body) return Promise.resolve(Buffer.alloc(0));
  if (typeof body.transformToByteArray === "function") {
    return body.transformToByteArray().then((bytes) => Buffer.from(bytes));
  }
  const chunks = [];
  return new Promise((resolve, reject) => {
    body.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    body.on("error", reject);
    body.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

const envFile = process.argv[2];
loadEnvFile(envFile);

const endpoint = requireEnv("S3_ENDPOINT");
const region = process.env.S3_REGION || "auto";
const bucket = requireEnv("S3_BUCKET");
const accessKeyId = requireEnv("S3_ACCESS_KEY_ID");
const secretAccessKey = requireEnv("S3_SECRET_ACCESS_KEY");

const s3 = new S3Client({
  endpoint,
  region,
  forcePathStyle: true,
  credentials: { accessKeyId, secretAccessKey },
});

const key = `smoke-tests/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.txt`;
const content = Buffer.from(
  `staffly-r2-smoke-test ${new Date().toISOString()}\n`,
  "utf8",
);

console.log(`Checking bucket: ${bucket}`);
await s3.send(new HeadBucketCommand({ Bucket: bucket }));
console.log("OK HeadBucket");

console.log(`Uploading object: ${key}`);
await s3.send(
  new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: content,
    ContentType: "text/plain; charset=utf-8",
  }),
);
console.log("OK PutObject");

const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
if (head.ContentLength !== content.length) {
  throw new Error(
    `HeadObject size mismatch: expected ${content.length}, got ${head.ContentLength}`,
  );
}
console.log("OK HeadObject");

const got = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
const downloaded = await bodyToBuffer(got.Body);
if (!downloaded.equals(content)) {
  throw new Error("GetObject returned different bytes than uploaded");
}
console.log("OK GetObject");

await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
console.log("OK DeleteObject");

try {
  await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  throw new Error("Deleted object is still readable");
} catch (err) {
  const status = err?.$metadata?.httpStatusCode;
  if (status !== 404) throw err;
}
console.log("OK delete verified");
console.log("R2 smoke test passed");
