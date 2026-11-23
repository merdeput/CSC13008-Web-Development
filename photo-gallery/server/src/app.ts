import express from "express";
import type { Pool } from "pg";
import { createPhotoUploadRouter } from "./routes/photo-upload.js";
import { UnconfiguredStorageAdapter, type StorageAdapter } from "./storage/adapter.js";
import { UnconfiguredPhotoRepository, type PhotoRepositoryContract } from "./db/photos.js";
import type { GalleryRepository } from "./db/gallery.js";
import type { UserRepository } from "./db/users.js";
import { createSessionMiddleware } from "./auth/session.js";
import { createAuthRouter } from "./routes/auth.js";
import { createUsersRouter } from "./routes/users.js";
import { createPhotoEditRouter } from "./routes/photo-edit.js";

type AppOptions = {
  storage?: StorageAdapter;
  repository?: PhotoRepositoryContract;
  users?: UserRepository;
  secureCookies?: boolean;
  originalsBucket?: string;
  variantsBucket?: string;
  gallery?: GalleryRepository;
};

export function createApp(pool: Pick<Pool, "query">, options: AppOptions = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "20kb" }));
  if (options.users) {
    app.use("/api", createSessionMiddleware(options.users));
    app.use("/api/auth", createAuthRouter(options.users, Boolean(options.secureCookies)));
    if (options.gallery) app.use("/api/users", createUsersRouter(options.users, options.gallery));
  }
  app.use("/api/photos", createPhotoUploadRouter({
    storage: options.storage ?? new UnconfiguredStorageAdapter(),
    repository: options.repository ?? new UnconfiguredPhotoRepository(),
    originalsBucket: options.originalsBucket,
    variantsBucket: options.variantsBucket,
  }));
  app.use("/api/photos", createPhotoEditRouter({ storage: options.storage ?? new UnconfiguredStorageAdapter(), repository: options.repository ?? new UnconfiguredPhotoRepository(), originalsBucket: options.originalsBucket ?? "photo-originals", variantsBucket: options.variantsBucket ?? "photo-variants" }));
  app.get("/api/photos", async (request, response, next) => {
    if (!options.gallery) {
      response.status(503).json({ error: { code: "GALLERY_UNAVAILABLE", message: "The gallery is not configured yet." } });
      return;
    }
    try { response.json(await options.gallery.list(new URL(request.originalUrl, "http://localhost").searchParams)); }
    catch (error) { next(error); }
  });
  app.get("/api/photos/:id", async (request, response, next) => {
    if (!options.gallery) {
      response.status(503).json({ error: { code: "GALLERY_UNAVAILABLE", message: "The gallery is not configured yet." } });
      return;
    }
    try {
      const photo = await options.gallery.detail(String(request.params.id));
      if (!photo) { response.status(404).json({ error: { code: "PHOTO_NOT_FOUND", message: "Photo was not found." } }); return; }
      response.json(photo);
    } catch (error) { next(error); }
  });
  app.get("/api/filters", async (_request, response, next) => {
    if (!options.gallery) {
      response.status(503).json({ error: { code: "GALLERY_UNAVAILABLE", message: "The gallery is not configured yet." } });
      return;
    }
    try { response.json(await options.gallery.filters()); }
    catch (error) { next(error); }
  });
  app.get("/api/health", async (_request, response) => {
    try {
      await pool.query("SELECT 1");
      response.status(200).json({ status: "ok", database: "connected" });
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "unknown";
      console.error(`Database health check failed (${code}).`);
      response.status(503).json({ status: "error", database: "unavailable" });
    }
  });
  app.use((_error: unknown, _request: express.Request, response: express.Response, next: express.NextFunction) => {
    void next;
    response.status(500).json({ error: { code: "INTERNAL_ERROR", message: "The request could not be completed." } });
  });
  return app;
}
