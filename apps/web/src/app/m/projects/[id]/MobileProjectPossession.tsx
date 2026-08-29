"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";

/**
 * MobileProjectPossession — shows possession status + toggle button.
 * Used on the mobile project detail page (server component).
 */
export function MobileProjectPossession({
  projectId,
  isPossessed,
  possessionDate,
  possessionNotes,
  canManage,
}: {
  projectId: string;
  isPossessed: boolean;
  possessionDate?: string | null;
  possessionNotes?: string | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function toggle() {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/possession`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPossessed: !isPossessed }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to update possession");
      }
      toast.success(isPossessed ? "Possession revoked" : "Possession marked");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update possession");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="rounded-[0.5rem] border px-3 py-2.5 mb-3"
      style={{
        borderColor: isPossessed ? "color-mix(in srgb, var(--color-go) 30%, var(--color-line))" : "var(--color-line)",
        backgroundColor: isPossessed ? "color-mix(in srgb, var(--color-go) 5%, var(--color-paper))" : "var(--color-paper)",
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <KeyRound className="size-3.5" style={{ color: isPossessed ? "var(--color-go)" : "var(--color-ink-400)" }} />
          <div>
            <p className="text-m-caption font-bold" style={{ color: "var(--color-ink-950)" }}>
              {isPossessed ? "Possession Taken" : "Possession Pending"}
            </p>
            {possessionDate && (
              <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                {formatDate(possessionDate)}
                {possessionNotes ? ` · ${possessionNotes}` : ""}
              </p>
            )}
          </div>
        </div>
        {canManage && (
          <button
            onClick={toggle}
            disabled={submitting}
            className="text-m-caption font-bold rounded-[0.25rem] px-2 py-1 text-m-body press disabled:opacity-50"
            style={{
              backgroundColor: isPossessed ? "var(--color-line)" : "var(--color-ink-950)",
              color: isPossessed ? "var(--color-ink-600)" : "var(--color-paper)",
            }}
          >
            {isPossessed ? "Revoke" : "Mark Possessed"}
          </button>
        )}
      </div>
    </div>
  );
}
