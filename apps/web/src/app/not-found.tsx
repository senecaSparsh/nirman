import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Root 404 — the page a user sees when they hit a URL that doesn't
 * match any route. Previously Next.js's default 404 (a blank page with
 * "404: This page could not be found"), which felt like a crash.
 *
 * This matches the tone of NoAccess and EmptyState: calm, names the
 * situation, and offers the single next step (go home).
 */
export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground/55">
        <Compass className="h-[18px] w-[18px]" />
      </div>
      <div className="space-y-1.5">
        <h2 className="text-section font-semibold text-foreground">Page not found</h2>
        <p className="mx-auto max-w-sm text-meta leading-relaxed text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or may have moved.
        </p>
      </div>
      <Button asChild variant="outline" size="sm">
        <Link href="/">Back to Today</Link>
      </Button>
    </div>
  );
}
