export function validateEnv() {
  const required = [
    "DATABASE_URL",
    "DIRECT_URL",
    "REDMINE_BASE_URL",
    "REDMINE_API_KEY",
    "SESSION_SECRET",
    "APP_ENCRYPTION_KEY",
  ];

  const missing: string[] = [];

  for (const key of required) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  // Validate optional but recommended
  const recommended = ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"];
  const missingRecommended: string[] = [];

  for (const key of recommended) {
    if (!process.env[key]) {
      missingRecommended.push(key);
    }
  }

  if (missingRecommended.length > 0) {
    console.warn(`⚠️  Missing recommended environment variables: ${missingRecommended.join(", ")}`);
  }

  console.log("✅ Environment variables validated");
}