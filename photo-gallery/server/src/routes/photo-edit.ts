import { randomUUID } from "node:crypto";
import express from "express";
import sharp from "sharp";
import { rateLimit } from "express-rate-limit";
import { ImageInputError, processEditedImage, type ImageEdit } from "../images/process.js";
import { requireAuth, requireCsrf, type AuthenticatedRequest } from "../auth/session.js";
import { checksum, type PhotoRepositoryContract } from "../db/photos.js";
import type { StorageAdapter } from "../storage/adapter.js";

export function createPhotoEditRouter(options: { storage: StorageAdapter; repository: PhotoRepositoryContract; originalsBucket: string; variantsBucket: string }) {
  const router = express.Router();
  const limiter = rateLimit({ windowMs: 60_000, limit: 8, standardHeaders: "draft-8", legacyHeaders: false });
  router.get("/:id/edit", requireAuth, async (request, response) => {
    const source = await options.repository.editableSource(String(request.params.id), (request as AuthenticatedRequest).authUser!.id);
    if (!source) { response.status(404).json({ error: { message: "Owned photo not found." } }); return; }
    const original = await options.storage.get(source.originalBucket, source.originalKey);
    const metadata = await sharp(original).metadata();
    response.json({ id: source.id, currentVersion: source.currentVersion, currentEdit: source.currentEdit, width: metadata.autoOrient?.width ?? metadata.width, height: metadata.autoOrient?.height ?? metadata.height });
  });
  router.get("/:id/edit/source", requireAuth, async (request, response, next) => {
    try {
      const source = await options.repository.editableSource(String(request.params.id), (request as AuthenticatedRequest).authUser!.id);
      if (!source) { response.status(404).json({ error: { message: "Owned photo not found." } }); return; }
      const original = await options.storage.get(source.originalBucket, source.originalKey);
      const preview = await sharp(original).rotate().toColourspace("srgb").jpeg({ quality: 88 }).toBuffer();
      response.setHeader("Cache-Control", "private, no-store"); response.type("image/jpeg").send(preview);
    } catch (error) { next(error); }
  });

  async function saveEdit(request: express.Request, response: express.Response, restore: boolean) {
    const id = String(request.params.id);
    const ownerId = (request as AuthenticatedRequest).authUser!.id;
    const source = await options.repository.editableSource(id, ownerId);
    if (!source) { response.status(404).json({ error: { message: "Owned photo not found." } }); return; }
    if (restore) {
      const restored = await options.repository.restoreOriginalVersion(id, ownerId);
      if (!restored) { response.status(409).json({ error: { message: "The original display variants are unavailable." } }); return; }
      response.json({ id, version: 1, restored: true });
      return;
    }
    const original = await options.storage.get(source.originalBucket, source.originalKey);
    const input = request.body as Partial<ImageEdit>;
    if (!input.crop || !Number.isInteger(input.rotation) || ![0, 90, 180, 270].includes(input.rotation as number) || typeof input.flipX !== "boolean" || typeof input.flipY !== "boolean") {
      response.status(422).json({ error: { message: "Provide a valid crop, quarter-turn rotation, and flip values." } }); return;
    }
    let processed;
    try { processed = await processEditedImage(original, input as ImageEdit); }
    catch (error) {
      if (error instanceof ImageInputError) { response.status(422).json({ error: { code: error.code, message: error.message } }); return; }
      throw error;
    }
    const version = source.currentVersion + 1;
    const uploads = processed.variants.map((variant) => ({
      bucket: options.variantsBucket,
      key: `photos/${id}/versions/${version}/${randomUUID()}-${variant.width}.jpg`,
      bytes: variant.bytes,
      contentType: variant.mimeType,
      cacheControl: "31536000",
      widthTarget: variant.widthTarget,
      width: variant.width,
      height: variant.height,
      checksum: checksum(variant.bytes),
    }));
    const uploaded: string[] = [];
    try {
      for (const object of uploads) { await options.storage.put(object); uploaded.push(object.key); }
      const published = await options.repository.publishEditedVersion(id, ownerId, version, input as ImageEdit, uploads.map(({ bucket, key, widthTarget, width, height, contentType, bytes, checksum: hash }) => ({ bucket, key, widthTarget, width, height, mimeType: contentType, bytes: bytes.length, checksum: hash })));
      if (!published) { await options.storage.delete(options.variantsBucket, uploaded); response.status(409).json({ error: { message: "This photo changed while you were editing. Reload it and try again." } }); return; }
      response.json({ id, version, restored: restore, variants: uploads.map(({ width, height, bucket, key }) => ({ width, height, url: options.storage.getUrl(bucket, key) })) });
    } catch (error) {
      if (uploaded.length) await options.storage.delete(options.variantsBucket, uploaded).catch(() => undefined);
      throw error;
    }
  }
  router.post("/:id/edit", limiter, requireAuth, requireCsrf, (request, response, next) => { void saveEdit(request, response, false).catch(next); });
  router.post("/:id/restore", limiter, requireAuth, requireCsrf, (request, response, next) => { void saveEdit(request, response, true).catch(next); });
  return router;
}
