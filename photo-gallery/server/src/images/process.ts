import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import { uploadLimits } from "@wildlife-gallery/shared";

export type ProcessedImage = {
  mimeType: "image/jpeg" | "image/png";
  width: number;
  height: number;
  variants: Array<{ widthTarget: number; width: number; height: number; bytes: Buffer; mimeType: "image/jpeg" }>;
};

export class ImageInputError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "ImageInputError";
  }
}

export type ImageEdit = { crop: { left: number; top: number; width: number; height: number }; rotation: 0 | 90 | 180 | 270; flipX: boolean; flipY: boolean };

export async function processEditedImage(bytes: Buffer, edit: ImageEdit): Promise<ProcessedImage> {
  const detected = await fileTypeFromBuffer(bytes);
  if (!detected || !uploadLimits.allowedMimeTypes.includes(detected.mime as "image/jpeg" | "image/png")) throw new ImageInputError("UNSUPPORTED_FORMAT", "The source image format is not supported.");
  try {
    const normalized = await sharp(bytes, { failOn: "warning", limitInputPixels: uploadLimits.maxPixels }).rotate().toBuffer();
    const metadata = await sharp(normalized).metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    const { left, top, width: cropWidth, height: cropHeight } = edit.crop;
    if (![left, top, cropWidth, cropHeight].every(Number.isInteger) || left < 0 || top < 0 || cropWidth < 1 || cropHeight < 1 || left + cropWidth > width || top + cropHeight > height) {
      throw new ImageInputError("INVALID_CROP", "Crop bounds must fit within the oriented original image.");
    }
    const variants: ProcessedImage["variants"] = [];
    for (const targetWidth of uploadLimits.variantWidths) {
      const variant = await sharp(normalized, { failOn: "warning", limitInputPixels: uploadLimits.maxPixels })
        .extract({ left, top, width: cropWidth, height: cropHeight })
        .flip(edit.flipY)
        .flop(edit.flipX)
        .rotate(edit.rotation)
        .toColourspace("srgb")
        .resize({ width: targetWidth, height: targetWidth, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: uploadLimits.jpegQuality, mozjpeg: true, progressive: true })
        .toBuffer({ resolveWithObject: true });
      if (!variants.some((item) => item.width === variant.info.width)) variants.push({ widthTarget: targetWidth, width: variant.info.width, height: variant.info.height, bytes: variant.data, mimeType: "image/jpeg" });
    }
    const quarterTurn = edit.rotation === 90 || edit.rotation === 270;
    return { mimeType: detected.mime as ProcessedImage["mimeType"], width: quarterTurn ? cropHeight : cropWidth, height: quarterTurn ? cropWidth : cropHeight, variants };
  } catch (error) {
    if (error instanceof ImageInputError) throw error;
    throw new ImageInputError("INVALID_IMAGE", "The source image cannot be decoded for editing.");
  }
}

function hasTrailingBytes(buffer: Buffer, mime: string): boolean {
  if (mime === "image/jpeg") {
    const end = buffer.lastIndexOf(Buffer.from([0xff, 0xd9]));
    return end < 0 || end + 2 !== buffer.length;
  }
  if (mime !== "image/png") return false;
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const next = offset + 12 + length;
    if (next > buffer.length) return true;
    if (type === "IEND") return length !== 0 || next !== buffer.length;
    offset = next;
  }
  return true;
}

export async function processImage(bytes: Buffer): Promise<ProcessedImage> {
  const detected = await fileTypeFromBuffer(bytes);
  if (!detected || !uploadLimits.allowedMimeTypes.includes(detected.mime as "image/jpeg" | "image/png")) {
    throw new ImageInputError("UNSUPPORTED_FORMAT", "Only JPEG and PNG images are accepted.");
  }
  if (hasTrailingBytes(bytes, detected.mime)) {
    throw new ImageInputError("TRAILING_DATA_DETECTED", "Unexpected data follows the image payload.");
  }

  let image: sharp.Sharp;
  let metadata: sharp.Metadata;
  try {
    image = sharp(bytes, { failOn: "warning", limitInputPixels: uploadLimits.maxPixels });
    metadata = await image.metadata();
    if (metadata.format !== "jpeg" && metadata.format !== "png") {
      throw new ImageInputError("UNSUPPORTED_FORMAT", "Only JPEG and PNG images are accepted.");
    }
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    if (!width || !height) throw new ImageInputError("INVALID_IMAGE", "Image dimensions could not be read.");
    if (width > uploadLimits.maxDimension || height > uploadLimits.maxDimension || width * height > uploadLimits.maxPixels) {
      throw new ImageInputError("PIXEL_LIMIT_EXCEEDED", "Image dimensions exceed the allowed limit.");
    }
    // Force a full decode before accepting the source.
    await image.clone().rotate().resize(1, 1, { fit: "inside" }).toBuffer();

    const orientedWidth = metadata.autoOrient?.width ?? width;
    const orientedHeight = metadata.autoOrient?.height ?? height;
    const variants: ProcessedImage["variants"] = [];
    for (const targetWidth of uploadLimits.variantWidths) {
      if (targetWidth >= Math.max(orientedWidth, orientedHeight) && variants.length > 0) continue;
      const variant = await image.clone()
        .rotate()
        .toColourspace("srgb")
        .resize({ width: targetWidth, height: targetWidth, fit: "inside", withoutEnlargement: true })
        // Progressive JPEGs can render coarse-to-fine as bytes arrive in the browser.
        .jpeg({ quality: uploadLimits.jpegQuality, mozjpeg: true, progressive: true })
        .toBuffer({ resolveWithObject: true });
      if (variants.some((item) => item.width === variant.info.width)) continue;
      variants.push({ widthTarget: targetWidth, width: variant.info.width, height: variant.info.height, bytes: variant.data, mimeType: "image/jpeg" });
    }
    return { mimeType: detected.mime as ProcessedImage["mimeType"], width: orientedWidth, height: orientedHeight, variants };
  } catch (error) {
    if (error instanceof ImageInputError) throw error;
    throw new ImageInputError("INVALID_IMAGE", "The file is malformed or cannot be decoded as an image.");
  }
}
