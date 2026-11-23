import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";
import { UserRepository } from "./db/users.js";

const pool = { query: async () => ({ rows: [{ ok: 1 }] }) };
const id = "33333333-3333-4333-8333-333333333333";

class MemoryUsers {
  users = new Map<string, { id: string; username: string; usernameNormalized: string; passwordHash: string; isSystem: false; displayName: string | null; bio: string | null; avatarUrl: string | null }>();
  sessions = new Map<string, { id: string; tokenHash: string; csrfToken: string; expiresAt: Date; userId: string }>();
  async createUser(input: { username: string; usernameNormalized: string; passwordHash: string }) {
    if (this.users.has(input.usernameNormalized)) throw Object.assign(new Error("unique"), { code: "P2002" });
    const user = { id, ...input, isSystem: false as const, displayName: null, bio: null, avatarUrl: null };
    this.users.set(user.usernameNormalized, user);
    return { id: user.id, username: user.username, displayName: null, bio: null, avatarUrl: null };
  }
  async findForLogin(username: string) { return this.users.get(username) ?? null; }
  async createSession(input: { id: string; userId: string; tokenHash: string; csrfToken: string; expiresAt: Date }) { this.sessions.set(input.tokenHash, input); return input; }
  async findSession(tokenHash: string) {
    const session = this.sessions.get(tokenHash);
    const user = session && [...this.users.values()].find((item) => item.id === session.userId);
    return session && user ? { ...session, user } : null;
  }
  async deleteSession(sessionId: string) {
    for (const [key, session] of this.sessions) if (session.id === sessionId) this.sessions.delete(key);
  }
}

function authApp(users: MemoryUsers) { return createApp(pool as never, { users: users as unknown as UserRepository }); }

describe("username/password sessions", () => {
  it("registers, signs in case-insensitively, and clears a cookie session on logout", async () => {
    const users = new MemoryUsers(); const app = authApp(users);
    const registration = await request(app).post("/api/auth/register").send({ username: "Wildlife_1", password: "strong test password 123" });
    expect(registration.status).toBe(201);
    expect(registration.body.user).toMatchObject({ id, username: "Wildlife_1" });
    expect(registration.body.user.passwordHash).toBeUndefined();
    expect(registration.headers["set-cookie"][0]).toContain("HttpOnly");
    expect(registration.headers["set-cookie"][0]).toContain("SameSite=Lax");

    const login = await request(app).post("/api/auth/login").send({ username: "WILDLIFE_1", password: "strong test password 123" });
    expect(login.status).toBe(200);
    const cookie = login.headers["set-cookie"][0].split(";")[0];
    const me = await request(app).get("/api/auth/me").set("Cookie", cookie);
    expect(me.body.user.username).toBe("Wildlife_1");
    expect(typeof me.body.csrfToken).toBe("string");
    const deniedLogout = await request(app).post("/api/auth/logout").set("Cookie", cookie);
    expect(deniedLogout.status).toBe(403);
    expect((await request(app).get("/api/auth/me").set("Cookie", cookie)).body.user.username).toBe("Wildlife_1");
    const logout = await request(app).post("/api/auth/logout").set("Cookie", cookie).set("x-csrf-token", me.body.csrfToken);
    expect(logout.status).toBe(204);
    expect((await request(app).get("/api/auth/me").set("Cookie", cookie)).body.user).toBeNull();
  });

  it("uses generic sign-in failures and requires a CSRF token to log out", async () => {
    const app = authApp(new MemoryUsers());
    const login = await request(app).post("/api/auth/login").send({ username: "nobody", password: "strong test password 123" });
    expect(login.status).toBe(401);
    expect(login.body.error.message).toBe("Username or password is incorrect.");
    expect((await request(app).post("/api/auth/register").send({ username: "short", password: "tiny" })).status).toBe(422);
    const crossSite = await request(app).post("/api/auth/login").set("Origin", "https://other.example").send({ username: "nobody", password: "strong test password 123" });
    expect(crossSite.status).toBe(403);
  });
});
