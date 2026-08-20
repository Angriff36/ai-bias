import { useId, type ReactNode } from "react";

/**
 * Single skeleton primitive. Variant controls shape; className controls size.
 * The shimmer itself lives in index.css (.skeleton-shimmer) so every skeleton
 * in the app shares one left-to-right 1.5s loop, and honors
 * prefers-reduced-motion via the CSS media query.
 *
 * Colors: neutral-200 base / neutral-100 highlight (light) and
 * neutral-700 / neutral-600 (dark) are layered in index.css as
 * background-color + gradient highlight so components stay class-free.
 */
export type SkeletonVariant = "text" | "avatar" | "card" | "row";

const VARIANT_CLASS: Record<SkeletonVariant, string> = {
  text: "rounded h-3.5",
  avatar: "rounded-full h-9 w-9 shrink-0",
  card: "rounded-lg h-32",
  row: "rounded h-12",
};

export function Skeleton({
  variant = "text",
  className = "",
}: {
  variant?: SkeletonVariant;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`skeleton-shimmer ${VARIANT_CLASS[variant]} ${className}`}
    />
  );
}

/**
 * Wrapper for a loading region. Carries the accessibility contract:
 * aria-busy="true" + aria-label="Loading [content name]" while loading,
 * neither once children render.
 */
export function SkeletonContainer({
  loading,
  label,
  children,
  fallback,
}: {
  loading: boolean;
  label: string;
  children: ReactNode;
  fallback: ReactNode;
}) {
  const id = useId();
  if (!loading) {
    return (
      <div id={id} className="animate-fade-in-150">
        {children}
      </div>
    );
  }
  return (
    <div
      id={id}
      role="status"
      aria-busy="true"
      aria-label={`Loading ${label}`}
    >
      {fallback}
    </div>
  );
}
