import { randomUUID } from "node:crypto";
import express from "express";
import { rateLimit } from "express-rate-limit";
import { hashOpaqueToken, hashPassword, newOpaqueToken, verifyPassword } from "../auth/crypto.js";
import { appendSessionCookie, clearSessionCookie, getSessionToken, requireAuth, requireCsrf, requireSameOrigin, type AuthenticatedRequest } from "../auth/session.js";
import { UserRepository } from "../db/users.js";

const sessionLifetimeSeconds = 14 * 24 * 60 * 60;
const normalizedUsername = (value: string) => value.trim().toLowerCase();
const dummyHashPromise = hashPassword("not-a-real-account-password");
const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 8, standardHeaders: "draft-8", legacyHeaders: false, message: { error: { code: "LOGIN_RATE_LIMIT", message: "Too many sign-in attempts. Try again later." } } });
const registrationLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 5, standardHeaders: "draft-8", legacyHeaders: false, message: { error: { code: "REGISTER_RATE_LIMIT", message: "Too many accounts were created from this connection. Try again later." } } });

function credentials(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const value = body as Record<string, unknown>;
  if (typeof value.username !== "string" || typeof value.password !== "string") return null;
  const username = value.username.trim(); const password = value.password;
  if (!/^[A-Za-z0-9_]{3,24}$/.test(username) || password.length < 8 || password.length > 128 || Buffer.byteLength(password, "utf8") > 512) return null;
  return { username, usernameNormalized: normalizedUsername(username), password };
}

function publicUser(user: { id: string; username: string; displayName: string | null; bio: string | null; avatarUrl: string | null }) {
  return { id: user.id, username: user.username, displayName: user.displayName, bio: user.bio, avatarUrl: user.avatarUrl };
}

export function createAuthRouter(users: UserRepository, secureCookies: boolean) {
  const router = express.Router();

  async function issueSession(userId: string, response: express.Response) {
    const token = newOpaqueToken(); const csrfToken = newOpaqueToken();
    await users.createSession({
      id: randomUUID(), userId, tokenHash: hashOpaqueToken(token), csrfToken,
      expiresAt: new Date(Date.now() + sessionLifetimeSeconds * 1000),
    });
    appendSessionCookie(response, token, sessionLifetimeSeconds, secureCookies);
    return csrfToken;
  }

  router.post("/register", requireSameOrigin, registrationLimiter, async (request, response) => {
    const input = credentials(request.body);
    if (!input) {
      response.status(422).json({ error: { code: "INVALID_CREDENTIALS", message: "Use a 3–24 character username (letters, numbers, underscore) and a 12–128 character password." } });
      return;
    }
    let createdUserId: string | null = null;
    try {
      const user = await users.createUser({ username: input.username, usernameNormalized: input.usernameNormalized, passwordHash: await hashPassword(input.password) });
      createdUserId = user.id;
      const csrfToken = await issueSession(user.id, response);
      response.status(201).json({ user: publicUser(user), csrfToken });
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
        response.status(409).json({ error: { code: "USERNAME_TAKEN", message: "That username is already in use." } });
        return;
      }
      if (createdUserId) await users.deleteUser(createdUserId).catch(() => undefined);
      response.status(503).json({ error: { code: "ACCOUNT_UNAVAILABLE", message: "The account could not be created. Try again." } });
    }
  });

  router.post("/login", requireSameOrigin, loginLimiter, async (request, response) => {
    const input = credentials(request.body);
    if (!input) {
      response.status(401).json({ error: { code: "INVALID_LOGIN", message: "Username or password is incorrect." } });
      return;
    }
    try {
      const user = await users.findForLogin(input.usernameNormalized);
      const passwordHash = user?.passwordHash ?? await dummyHashPromise;
      const valid = await verifyPassword(input.password, passwordHash);
      if (!user || user.isSystem || !user.passwordHash || !valid) {
        response.status(401).json({ error: { code: "INVALID_LOGIN", message: "Username or password is incorrect." } });
        return;
      }
      const csrfToken = await issueSession(user.id, response);
      response.json({ user: publicUser(user), csrfToken });
    } catch {
      response.status(503).json({ error: { code: "AUTH_UNAVAILABLE", message: "Sign-in is temporarily unavailable. Try again." } });
    }
  });

  router.get("/me", async (request, response) => {
    const authRequest = request as AuthenticatedRequest;
    if (!authRequest.authUser || !authRequest.authSessionId) { response.json({ user: null }); return; }
    response.json({ user: publicUser(authRequest.authUser), csrfToken: authRequest.authCsrfToken });
  });

  router.post("/logout", requireAuth, requireCsrf, async (request, response) => {
    const token = getSessionToken(request);
    if (token) await users.deleteSession((request as AuthenticatedRequest).authSessionId!);
    clearSessionCookie(response, secureCookies);
    response.status(204).end();
  });

  return router;
}
