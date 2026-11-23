import express from "express";
import { requireAuth, requireCsrf, type AuthenticatedRequest } from "../auth/session.js";
import { UserRepository } from "../db/users.js";
import { GalleryRepository } from "../db/gallery.js";

export function createUsersRouter(users: UserRepository, gallery: GalleryRepository) {
  const router = express.Router();

  router.patch("/me", requireAuth, requireCsrf, async (request, response) => {
    const body = request.body && typeof request.body === "object" && !Array.isArray(request.body) ? request.body as Record<string, unknown> : {};
    const fields = ["displayName", "bio", "avatarUrl"] as const;
    if (fields.some((field) => body[field] !== undefined && body[field] !== null && typeof body[field] !== "string")) {
      response.status(422).json({ error: { code: "INVALID_PROFILE", message: "Profile fields must be text." } }); return;
    }
    const displayName = body.displayName === undefined ? undefined : typeof body.displayName === "string" ? body.displayName.trim() : null;
    const bio = body.bio === undefined ? undefined : typeof body.bio === "string" ? body.bio.trim() : null;
    const avatarUrl = body.avatarUrl === undefined ? undefined : typeof body.avatarUrl === "string" ? body.avatarUrl.trim() : null;
    if (displayName && displayName.length > 60 || bio && bio.length > 280 || avatarUrl && avatarUrl.length > 2048) {
      response.status(422).json({ error: { code: "PROFILE_TOO_LONG", message: "Display name, bio, or avatar URL is too long." } }); return;
    }
    if (avatarUrl) {
      try { const url = new URL(avatarUrl); if (url.protocol !== "https:" || url.username || url.password) throw new Error(); }
      catch { response.status(422).json({ error: { code: "INVALID_AVATAR_URL", message: "Avatar URL must be a valid HTTPS URL." } }); return; }
    }
    try {
      const user = await users.updateProfile((request as AuthenticatedRequest).authUser!.id, { displayName, bio, avatarUrl });
      response.json({ user });
    } catch { response.status(503).json({ error: { code: "PROFILE_UNAVAILABLE", message: "Profile could not be updated." } }); }
  });

  router.get("/:username", async (request, response) => {
    const username = String(request.params.username);
    if (!/^[A-Za-z0-9_]{3,24}$/.test(username)) { response.status(404).json({ error: { code: "USER_NOT_FOUND", message: "Profile not found." } }); return; }
    const profile = await users.publicProfile(username.toLowerCase());
    if (!profile) { response.status(404).json({ error: { code: "USER_NOT_FOUND", message: "Profile not found." } }); return; }
    const page = Number(new URL(request.originalUrl, "http://localhost").searchParams.get("page")) || 1;
    const photos = await gallery.profilePhotos(profile.id, page);
    response.json({ user: { id: profile.id, username: profile.username, displayName: profile.displayName, bio: profile.bio, avatarUrl: profile.avatarUrl, joinedAt: profile.createdAt.toISOString(), photoCount: profile._count.photos }, ...photos });
  });

  return router;
}
