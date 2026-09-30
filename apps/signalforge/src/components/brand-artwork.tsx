import Image from "next/image";

/** Owner-supplied artwork, cropped without recoloring. The pale ground keeps
 * the original dark wordmark legible on Valrun's dark surfaces. */
export function BrandArtwork() {
  return (
    <span className="brand-artwork">
      <Image src="/brand/valrun-logo.png" alt="Valrun" width={952} height={204} unoptimized />
    </span>
  );
}
