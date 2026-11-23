import { randomUUID } from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import multer, { type StorageEngine } from "multer";
import { uploadLimits } from "@wildlife-gallery/shared";
import { ImageInputError, processImage } from "../images/process.js";
import { StorageUnavailableError, type StorageAdapter } from "../storage/adapter.js";
import { checksum, type PhotoRepositoryContract } from "../db/photos.js";
import { requireAuth, requireCsrf, type AuthenticatedRequest } from "../auth/session.js";

type Metadata = {
  title: string;
  caption?: string;
  altText?: string;
  category?: string;
  tags?: string[];
  photographerCredit?: string;
  locationName?: string;
  locationContinent?: string;
  locationRegion?: string;
  locationCountry?: string;
  competition?: string;
  award?: string;
  photoYear?: number;
  speciesCommon?: string;
  speciesLatin?: string;
  story?: string;
  permissionConfirmed?: boolean;
};

type UploadOptions = {
  storage: StorageAdapter;
  repository: PhotoRepositoryContract;
  originalsBucket?: string;
  variantsBucket?: string;
  limiter?: express.RequestHandler;
};

class RequestBytesLimitError extends Error {}

class CappedMemoryStorage implements StorageEngine {
  _handleFile(request: Request, file: Express.Multer.File, callback: (error?: unknown, info?: Partial<Express.Multer.File>) => void) {
    const chunks: Buffer[] = [];
    let fileBytes = 0;
    let oversized = false;
    let completed = false;
    file.stream.on("data", (chunk: Buffer) => {
      fileBytes += chunk.length;
      const total = ((request as Request & { uploadBytes?: number }).uploadBytes ?? 0) + chunk.length;
      (request as Request & { uploadBytes?: number }).uploadBytes = total;
      if (total > uploadLimits.maxRequestBytes && !completed) {
        completed = true;
        callback(new RequestBytesLimitError());
        return;
      }
      if (fileBytes > uploadLimits.maxFileBytes) {
        oversized = true;
        chunks.length = 0;
      } else if (!oversized) {
        chunks.push(chunk);
      }
    });
    file.stream.on("error", (error) => {
      if (!completed) {
        completed = true;
        callback(error);
      }
    });
    file.stream.on("end", () => {
      if (completed) return;
      completed = true;
      callback(null, { buffer: oversized ? Buffer.alloc(0) : Buffer.concat(chunks), size: fileBytes, oversized } as Partial<Express.Multer.File>);
    });
  }

  _removeFile(_request: Request, file: Express.Multer.File, callback: (error: Error | null) => void) {
    delete (file as unknown as { buffer?: Buffer }).buffer;
    callback(null);
  }
}

const multipart = multer({
  storage: new CappedMemoryStorage(),
  limits: {
    files: uploadLimits.maxFiles,
    fields: 1,
    fieldSize: 64 * 1024,
    parts: uploadLimits.maxFiles + 1,
  },
});

function requestError(status: number, code: string, message: string) {
  return { status, body: { error: { code, message, retryable: false } } };
}

function validateMetadata(value: unknown, count: number): Metadata[] | string {
  if (!Array.isArray(value) || value.length !== count) return "Metadata must have one entry per uploaded file.";
  for (const [index, item] of value.entries()) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return `Metadata entry ${index} must be an object.`;
    const fields = item as Record<string, unknown>;
    for (const field of ["title"]) {
      if (typeof fields[field] !== "string" || !fields[field].trim()) return `Metadata entry ${index} is missing ${field}.`;
    }
    for (const field of ["caption", "altText", "category", "photographerCredit", "locationName", "locationContinent", "locationRegion", "locationCountry", "competition", "award", "speciesCommon", "speciesLatin", "story"]) {
      if (fields[field] !== undefined && typeof fields[field] !== "string") return `Metadata entry ${index} has an invalid ${field}.`;
    }
    if (fields.photoYear !== undefined && (!Number.isInteger(fields.photoYear) || Number(fields.photoYear) < 1900 || Number(fields.photoYear) > new Date().getUTCFullYear() + 1)) return `Metadata entry ${index} has an invalid photoYear.`;
    if (fields.tags !== undefined && (!Array.isArray(fields.tags) || fields.tags.some((tag) => typeof tag !== "string" || !tag.trim()))) {
      return `Metadata entry ${index} must contain a string tags array.`;
    }
    if (fields.permissionConfirmed !== undefined && typeof fields.permissionConfirmed !== "boolean") {
      return `Metadata entry ${index} has an invalid permissionConfirmed value.`;
    }
  }
  return value as Metadata[];
}

export function createPhotoUploadRouter(options: UploadOptions) {
  const router = express.Router();
  const limiter = options.limiter ?? rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false });

  router.delete("/:id", requireAuth, requireCsrf, async (request, response) => {
    const id = String(request.params.id);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      response.status(400).json({ error: { code: "INVALID_ID", message: "Photo id must be a UUID.", retryable: false } });
      return;
    }
    const result = await options.repository.beginDelete(id, (request as AuthenticatedRequest).authUser!.id);
    if (result === "not_found") {
      response.status(404).json({ error: { code: "PHOTO_NOT_FOUND", message: "Photo was not found.", retryable: false } });
      return;
    }
    if (result === "forbidden") {
      response.status(403).json({ error: { code: "FORBIDDEN", message: "You cannot delete this photo.", retryable: false } });
      return;
    }
    response.status(202).json({ id, status: "pending_delete", message: "Photo hidden; storage cleanup is queued." });
  });

  router.post("/batch", limiter, requireAuth, requireCsrf, (request, response, next) => {
    const contentLength = Number(request.header("content-length") ?? 0);
    if (contentLength > uploadLimits.maxRequestBytes) {
      response.status(413).json(requestError(413, "REQUEST_TOO_LARGE", "The request exceeds the 32 MB limit.").body);
      return;
    }
    multipart.array("files", uploadLimits.maxFiles)(request, response, (error) => {
      if (error) {
        if (error instanceof RequestBytesLimitError) {
          response.status(413).json(requestError(413, "REQUEST_TOO_LARGE", "The request exceeds the 32 MB limit.").body);
          return;
        }
        if (error instanceof multer.MulterError) {
          const tooLarge = error.code === "LIMIT_FILE_SIZE";
          const tooMany = error.code === "LIMIT_FILE_COUNT" || error.code === "LIMIT_UNEXPECTED_FILE";
          const result = requestError(tooLarge ? 413 : 400, tooLarge ? "FILE_TOO_LARGE" : tooMany ? "INVALID_FILE_COUNT" : "INVALID_MULTIPART", tooLarge ? "A file exceeds the 6 MB limit." : "The multipart request is invalid.");
          response.status(result.status).json(result.body);
          return;
        }
        response.status(400).json(requestError(400, "INVALID_MULTIPART", "The multipart request is malformed.").body);
        return;
      }
      next();
    });
  }, async (request, response) => {
    const files = request.files as Array<Express.Multer.File & { oversized?: boolean }> | undefined;
    if (!files?.length) {
      response.status(400).json(requestError(400, "INVALID_FILE_COUNT", "Upload between one and five images.").body);
      return;
    }
    let parsedMetadata: unknown;
    try {
      parsedMetadata = JSON.parse(String(request.body.metadata ?? ""));
    } catch {
      response.status(400).json(requestError(400, "INVALID_METADATA", "metadata must be a JSON array.").body);
      return;
    }
    const metadata = validateMetadata(parsedMetadata, files.length);
    if (typeof metadata === "string") {
      const code = metadata.includes("missing") ? "MISSING_REQUIRED_FIELD" : "INVALID_METADATA";
      response.status(422).json(requestError(422, code, metadata).body);
      return;
    }
    const totalBytes = files.reduce((total, file) => total + file.size, 0);
    if (totalBytes > uploadLimits.maxRequestBytes) {
      response.status(413).json(requestError(413, "REQUEST_TOO_LARGE", "The request exceeds the 32 MB limit.").body);
      return;
    }

    const results = [];
    for (const [fileIndex, file] of files.entries()) {
      const photoId = randomUUID();
      let rowCreated = false;
      let phase: "database" | "image" | "storage" = "image";
      try {
        if (file.oversized) throw new ImageInputError("FILE_TOO_LARGE", "The file exceeds the 6 MB limit.");
        const processed = await processImage(file.buffer);
        const extension = processed.mimeType === "image/png" ? "png" : "jpg";
        const originalKey = `photos/${photoId}/original/${randomUUID()}.${extension}`;
        const variantUploads = processed.variants.map((variant) => ({
          bucket: options.variantsBucket ?? "photo-variants",
          key: `photos/${photoId}/variants/${randomUUID()}-${variant.width}.jpg`,
          bytes: variant.bytes,
          contentType: variant.mimeType,
          cacheControl: "31536000",
        }));
        phase = "database";
        await options.repository.createPending({
          id: photoId,
          ownerId: (request as AuthenticatedRequest).authUser!.id,
          metadata: metadata[fileIndex],
          width: processed.width,
          height: processed.height,
          original: {
            bucket: options.originalsBucket ?? "photo-originals",
            key: originalKey,
            kind: "original",
            mimeType: processed.mimeType,
            bytes: file.buffer,
            checksum: checksum(file.buffer),
          },
          variants: variantUploads.map((variant, index) => ({
            ...variant,
            kind: "variant" as const,
            mimeType: variant.contentType,
          widthTarget: processed.variants[index].widthTarget,
            width: processed.variants[index].width,
            height: processed.variants[index].height,
            checksum: checksum(variant.bytes),
          })),
        });
        rowCreated = true;
        phase = "storage";
        await options.storage.put({
          bucket: options.originalsBucket ?? "photo-originals",
          key: originalKey,
          bytes: file.buffer,
          contentType: processed.mimeType,
          cacheControl: "3600",
        });
        await options.repository.markObjectUploaded(options.originalsBucket ?? "photo-originals", originalKey);
        for (const object of variantUploads) {
          await options.storage.put(object);
          await options.repository.markObjectUploaded(object.bucket, object.key);
        }
        phase = "database";
        await options.repository.markReady(photoId);
        results.push({
          fileIndex,
          originalName: file.originalname,
          status: "succeeded" as const,
          photo: {
            id: photoId,
            title: metadata[fileIndex].title,
            altText: metadata[fileIndex].altText,
            width: processed.width,
            height: processed.height,
            status: "ready" as const,
            variants: variantUploads.map((variant, index) => ({
              width: processed.variants[index].width,
              height: processed.variants[index].height,
              url: options.storage.getUrl(variant.bucket, variant.key),
            })),
          },
        });
      } catch (error) {
        if (rowCreated) {
          try { await options.repository.scheduleCleanup(photoId, "Upload did not complete."); } catch { /* The pending row remains hidden for reconciliation. */ }
        }
        const imageError = error instanceof ImageInputError;
        const unavailable = error instanceof StorageUnavailableError;
        const code = imageError ? error.code : unavailable ? "STORAGE_UNAVAILABLE" : phase === "database" ? "DATABASE_WRITE_FAILED" : "STORAGE_UPLOAD_FAILED";
        const message = imageError ? error.message : unavailable ? "Storage is not configured yet." : phase === "database" ? "Photo metadata could not be saved." : "The image could not be stored.";
        results.push({ fileIndex, originalName: file.originalname, status: "failed" as const, error: { code, message, fileIndex, retryable: !imageError } });
      }
    }

    const succeeded = results.filter((item) => item.status === "succeeded").length;
    const failed = results.length - succeeded;
    const statusCode = failed === 0 ? 201 : succeeded > 0 ? 207 : results.every((item) => item.status === "failed" && "error" in item && ["UNSUPPORTED_FORMAT", "INVALID_IMAGE", "TRAILING_DATA_DETECTED", "FILE_TOO_LARGE", "PIXEL_LIMIT_EXCEEDED"].includes(item.error.code)) ? 422 : 503;
    response.status(statusCode).json({ results, summary: { received: files.length, succeeded, failed } });
  });

  router.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    void _next;
    response.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Upload request could not be completed.", retryable: false } });
  });
  return router;
}
