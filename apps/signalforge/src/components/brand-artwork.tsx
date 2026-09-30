import Image from "next/image";

/** Supplied symbol geometry with an accessible, sharp native wordmark. */
export function BrandArtwork() {
  return (
    <span className="brand-artwork">
      <Image src="/brand/valrun-app-icon.png" alt="" width={36} height={36} unoptimized />
      <span>Valrun</span>
    </span>
  );
}
