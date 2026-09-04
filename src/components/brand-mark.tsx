import logoUrl from "@/assets/logo.png";

export function BrandMark({ className = "size-8 rounded-lg" }: { className?: string }) {
  return (
    <img
      src={logoUrl}
      alt="دفتر"
      className={`shrink-0 object-cover ring-1 ring-black/5 ${className}`}
      loading="lazy"
    />
  );
}
