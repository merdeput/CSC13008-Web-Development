export type AppConfig = {
  port: number;
  databaseUrl: string;
  directUrl: string;
  supabaseUrl?: string;
  supabaseServerKey?: string;
  originalsBucket: string;
  variantsBucket: string;
  storageBackend: "supabase" | "seaweedfs";
  seaweed?: { endpoint: string; publicUrl: string; region: string; accessKey: string; secretKey: string };
};

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const port = Number(env.PORT ?? "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }
  const supabaseUrl = env.SUPABASE_URL?.trim();
  const supabaseServerKey = env.SUPABASE_SECRET_KEY?.trim();
  if (Boolean(supabaseUrl) !== Boolean(supabaseServerKey)) {
    throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY must be set together");
  }
  if (supabaseUrl) {
    try {
      new URL(supabaseUrl);
    } catch {
      throw new Error("SUPABASE_URL must be a valid URL");
    }
  }
  const storageBackend = env.STORAGE_BACKEND === "seaweedfs" ? "seaweedfs" : "supabase";
  const endpoint = env.SEAWEED_S3_ENDPOINT?.trim();
  const publicUrl = env.SEAWEED_PUBLIC_URL?.trim();
  const accessKey = env.SEAWEED_S3_ACCESS_KEY?.trim();
  const secretKey = env.SEAWEED_S3_SECRET_KEY?.trim();
  if (storageBackend === "seaweedfs" && (!endpoint || !publicUrl || !accessKey || !secretKey)) {
    throw new Error("SeaweedFS storage requires SEAWEED_S3_ENDPOINT, SEAWEED_PUBLIC_URL, SEAWEED_S3_ACCESS_KEY, and SEAWEED_S3_SECRET_KEY");
  }
  for (const value of [endpoint, publicUrl]) {
    if (value) { try { new URL(value); } catch { throw new Error("SeaweedFS endpoint and public URL must be valid URLs"); } }
  }
  return {
    port,
    databaseUrl: required(env, "DATABASE_URL"),
    directUrl: required(env, "DIRECT_URL"),
    ...(supabaseUrl && supabaseServerKey ? { supabaseUrl, supabaseServerKey } : {}),
    originalsBucket: env.ORIGINALS_BUCKET?.trim() || "photo-originals",
    variantsBucket: env.VARIANTS_BUCKET?.trim() || "photo-variants",
    storageBackend,
    ...(endpoint && publicUrl && accessKey && secretKey ? { seaweed: { endpoint, publicUrl, region: env.SEAWEED_S3_REGION?.trim() || "us-east-1", accessKey, secretKey } } : {}),
  };
}
