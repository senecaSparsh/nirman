"use client";

import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * A small client-side refresh button that calls `router.refresh()`.
 * Use this in Server Components where you can't call `useRouter` directly.
 */
export function RefreshButton({ title = "Refresh" }: { title?: string }) {
  const router = useRouter();
  return (
    <Button variant="outline" size="icon" onClick={() => router.refresh()} title={title}>
      <RefreshCw className="h-4 w-4" />
    </Button>
  );
}
