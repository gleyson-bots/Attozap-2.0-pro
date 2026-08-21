export const ENV = {
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  initialAdminEmail: (process.env.INITIAL_ADMIN_EMAIL ?? "").trim().toLowerCase(),
  s3Bucket: process.env.S3_BUCKET ?? "",
  s3Region: process.env.S3_REGION ?? "auto",
  s3Endpoint: process.env.S3_ENDPOINT ?? "",
  s3AccessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
  s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
  s3PublicBaseUrl: process.env.S3_PUBLIC_BASE_URL ?? "",
  isProduction: process.env.NODE_ENV === "production",
};
