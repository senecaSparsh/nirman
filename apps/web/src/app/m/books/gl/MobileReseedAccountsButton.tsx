"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DatabaseZap, Loader2 } from "lucide-react";

/**
 * Button to re-seed the chart of accounts via POST /api/gl/accounts.
 * Renders as a small outline button suitable for the mobile GL page.
 */
export function MobileReseedAccountsButton() {
  const router = useRouter();
  const [seeding, setSeeding] = useState(false);

  async function handleReseed() {
    if (!window.confirm("Re-seed the chart of accounts?\n\nThis is an idempotent upsert — existing accounts are preserved.")) return;
    setSeeding(true);
    try {
      const res = await fetch("/api/gl/accounts", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to re-seed");
      toast.success(`Chart of accounts re-seeded (${data.count} accounts)`);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to re-seed");
    } finally {
      setSeeding(false);
    }
  }

  return (
    <button
      onClick={handleReseed}
      disabled={seeding}
      className="inline-flex items-center gap-1.5 rounded-[0.375rem] border px-2.5 py-1.5 text-m-caption font-medium transition-colors active:opacity-70 disabled:opacity-50 press"
      style={{
        borderColor: "var(--color-line)",
        color: "var(--color-ink-500)",
      }}
      title="Re-seed the chart of accounts"
    >
      {seeding ? <Loader2 className="size-3.5 animate-spin" /> : <DatabaseZap className="size-3.5" />}
      Re-seed
    </button>
  );
}
