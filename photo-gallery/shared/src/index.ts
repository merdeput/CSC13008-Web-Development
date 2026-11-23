export const uploadLimits = {
  allowedMimeTypes: ["image/jpeg", "image/png"] as const,
  maxFiles: 5,
  maxFileBytes: 6 * 1024 * 1024,
  maxRequestBytes: 32 * 1024 * 1024,
  maxDimension: 8000,
  maxPixels: 40_000_000,
  variantWidths: [480, 960, 1600] as const,
  jpegQuality: 80,
};

export type HealthResponse = {
  status: "ok";
  database: "connected";
};
