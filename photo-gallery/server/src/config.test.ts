import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

const validEnv = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/gallery",
  DIRECT_URL: "postgresql://user:pass@localhost:5432/gallery",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SECRET_KEY: "server-only-test-secret",
};

describe("loadConfig", () => {
  it("loads required server settings and bucket defaults", () => {
    expect(loadConfig(validEnv)).toMatchObject({
      port: 3000,
      originalsBucket: "photo-originals",
      variantsBucket: "photo-variants",
    });
  });

  it("starts without Supabase settings before Storage is integrated", () => {
    expect(loadConfig({
      DATABASE_URL: validEnv.DATABASE_URL,
      DIRECT_URL: validEnv.DIRECT_URL,
    })).not.toHaveProperty("supabaseServerKey");
  });

  it("requires Supabase URL and server key together", () => {
    expect(() => loadConfig({
      DATABASE_URL: validEnv.DATABASE_URL,
      DIRECT_URL: validEnv.DIRECT_URL,
      SUPABASE_URL: validEnv.SUPABASE_URL,
    })).toThrow("must be set together");
  });
});
