import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";

describe("GET /api/health", () => {
  it("returns 200 when the database query succeeds", async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] }) };
    const response = await request(createApp(pool as never)).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok", database: "connected" });
  });

  it("returns 503 without exposing database details when the query fails", async () => {
    const pool = { query: vi.fn().mockRejectedValue(new Error("private connection string")) };
    const response = await request(createApp(pool as never)).get("/api/health");
    expect(response.status).toBe(503);
    expect(response.text).not.toContain("private connection string");
  });
});
