import type { NextFunction, Request, Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { hashOpaqueToken } from "./crypto.js";
import type { UserRepository, SafeUser } from "../db/users.js";

export type AuthenticatedRequest = Request & {
  authUser?: SafeUser;
  authSessionId?: string;
  authCsrfToken?: string;
};

const cookieName = "gallery_session";
const sessionCookie = (token: string, maxAge: number, secure: boolean) => `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;

function sessionToken(request: Request) {
  const cookie = request.headers.cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`));
  const value = cookie?.slice(cookieName.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}

export function appendSessionCookie(response: Response, token: string, maxAge: number, secure: boolean) {
  response.append("Set-Cookie", sessionCookie(token, maxAge, secure));
}

export function clearSessionCookie(response: Response, secure: boolean) {
  response.append("Set-Cookie", sessionCookie("", 0, secure));
}

export function createSessionMiddleware(users: UserRepository) {
  return async (request: Request, _response: Response, next: NextFunction) => {
    const token = sessionToken(request);
    if (!token) { next(); return; }
    try {
      const session = await users.findSession(hashOpaqueToken(token));
      if (session) {
        const authRequest = request as AuthenticatedRequest;
        authRequest.authSessionId = session.id;
        authRequest.authCsrfToken = session.csrfToken;
        authRequest.authUser = {
          id: session.user.id,
          username: session.user.username,
          displayName: session.user.displayName,
          bio: session.user.bio,
          avatarUrl: session.user.avatarUrl,
        };
      }
      next();
    } catch (error) { next(error); }
  };
}

export function requireAuth(request: Request, response: Response, next: NextFunction) {
  if (!(request as AuthenticatedRequest).authUser) {
    response.status(401).json({ error: { code: "UNAUTHORIZED", message: "Sign in to continue." } });
    return;
  }
  next();
}

export function requireCsrf(request: Request, response: Response, next: NextFunction) {
  const authRequest = request as AuthenticatedRequest;
  const token = request.header("x-csrf-token");
  if (!authRequest.authCsrfToken || !token || token.length !== authRequest.authCsrfToken.length || !timingSafeEqual(Buffer.from(token), Buffer.from(authRequest.authCsrfToken))) {
    response.status(403).json({ error: { code: "CSRF_INVALID", message: "Refresh your session and try again." } });
    return;
  }
  next();
}

export function requireSameOrigin(request: Request, response: Response, next: NextFunction) {
  const origin = request.header("origin");
  if (origin) {
    try {
      const originUrl = new URL(origin);
      const requestHost = request.get("host");
      const requestUrl = new URL(`http://${requestHost}`);
      const loopback = new Set(["localhost", "127.0.0.1", "::1"]);
      const localDevPort = request.app.get("env") !== "production" && originUrl.hostname === requestUrl.hostname && loopback.has(originUrl.hostname);
      if (originUrl.host !== requestHost && !localDevPort) throw new Error("origin mismatch");
    } catch {
      response.status(403).json({ error: { code: "ORIGIN_INVALID", message: "The request origin is not allowed." } });
      return;
    }
  }
  next();
}

export const getSessionToken = sessionToken;
