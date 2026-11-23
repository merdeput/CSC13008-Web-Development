type ImageVariant = { width: number; height: number; url: string };

type ResponsiveImageProps = {
  variants: ImageVariant[];
  alt: string;
  sizes: string;
  loading?: "lazy" | "eager";
  className?: string;
};

/** Responsive, sanitized image variants. */
export function ResponsiveImage({ variants, alt, sizes, loading = "lazy", className }: ResponsiveImageProps) {
  if (!variants.length) return null;
  const ordered = [...variants].sort((a, b) => a.width - b.width);
  const smallest = ordered[0];
  const largest = ordered[ordered.length - 1];
  return <span className="responsive-image">
    <img
      className={className}
      src={smallest.url}
      srcSet={ordered.map((variant) => `${variant.url} ${variant.width}w`).join(", ")}
      sizes={sizes}
      width={largest.width}
      height={largest.height}
      alt={alt}
      loading={loading}
      decoding="async"
      fetchPriority={loading === "eager" ? "high" : "auto"}
    />
  </span>;
}
