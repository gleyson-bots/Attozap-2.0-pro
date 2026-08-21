import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { ENV } from "./_core/env";

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  return lastDot === -1 ? `${relKey}_${hash}` : `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

function getS3Client() {
  if (!ENV.s3Bucket || !ENV.s3AccessKeyId || !ENV.s3SecretAccessKey) {
    throw new Error("S3 is not configured. Set S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.");
  }
  return new S3Client({
    region: ENV.s3Region,
    endpoint: ENV.s3Endpoint || undefined,
    credentials: { accessKeyId: ENV.s3AccessKeyId, secretAccessKey: ENV.s3SecretAccessKey },
    forcePathStyle: Boolean(ENV.s3Endpoint),
  });
}

function publicUrl(key: string) {
  const base = ENV.s3PublicBaseUrl.replace(/\/+$/, "");
  return base ? `${base}/${key}` : key;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const key = appendHashSuffix(normalizeKey(relKey));
  await getS3Client().send(new PutObjectCommand({
    Bucket: ENV.s3Bucket,
    Key: key,
    Body: data,
    ContentType: contentType,
  }));
  return { key, url: publicUrl(key) };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: publicUrl(key) };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const key = normalizeKey(relKey);
  return getSignedUrl(getS3Client(), new GetObjectCommand({ Bucket: ENV.s3Bucket, Key: key }), { expiresIn: 60 * 10 });
}
