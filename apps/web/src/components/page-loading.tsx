import { Loader2 } from "lucide-react";

/**
 * Generic loading fallback for Suspense boundaries wrapping async Server
 * Component content. Used by pages that call `connection()` + Prisma inside
 * a child component so the static shell can prerender (Next.js 16 PPR).
 */
export function PageLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-20 text-meta text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}
