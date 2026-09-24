"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Check, X, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import { usePrompt } from "@/lib/use-prompt";

export interface OffsiteReviewItem {
  id: string;
  employeeName: string;
  designation: string | null;
  projectName: string | null;
  date: string;
  checkIn: string | null;
  lat: number | null;
  lng: number | null;
  location: string | null;
  fenceDistanceM: number | null;
}

/**
 * Off-site check-in review strip — the mobile review surface for
 * /m/attendance. A worker who checked in outside the geofence is PRESENT
 * provisionally; HR approves (legit off-site duty) or rejects (→ ABSENT)
 * from here. The map link opens the recorded pin so the decision is based
 * on where the worker actually was.
 */
export function OffsiteReviewStrip({ rows }: { rows: OffsiteReviewItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [prompt, promptDialog] = usePrompt();

  async function review(id: string, decision: "APPROVED" | "REJECTED") {
    // A rejection flips the day to ABSENT — always record why so the worker
    // and the audit log carry the reason, not just the verdict.
    const note = decision === "REJECTED"
      ? await prompt({
          title: "Reject off-site check-in",
          label: "Reason",
          placeholder: "Shown on the worker's attendance record",
          multiline: true,
          confirmLabel: "Reject",
        })
      : null;
    if (decision === "REJECTED" && note === null) return; // cancelled
    setBusy(id);
    try {
      const res = await fetch(`/api/attendance/${id}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note: note || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Review failed");
      haptic();
      toast.success(decision === "APPROVED" ? "Off-site day approved" : "Rejected — marked absent");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Review failed");
    } finally {
      setBusy(null);
    }
  }

  if (rows.length === 0) return null;

  return (
    <div
      className="mb-4 rounded-[0.75rem] border p-3 space-y-2"
      style={{ borderColor: "color-mix(in srgb, var(--color-warn) 35%, transparent)", backgroundColor: "color-mix(in srgb, var(--color-warn) 7%, transparent)" }}
    >
      <p className="text-m-label font-bold flex items-center gap-1.5" style={{ color: "var(--color-signal-dark)" }}>
        <AlertTriangle className="size-3.5" />
        {rows.length} off-site check-in{rows.length === 1 ? "" : "s"} to review
      </p>
      {rows.map((r) => (
        <div key={r.id} className="rounded-[0.5rem] p-2.5" style={{ backgroundColor: "var(--color-paper)" }}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-m-body font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
              {r.employeeName}
            </p>
            {r.lat != null && r.lng != null && (
              <a
                href={`https://www.google.com/maps?q=${r.lat},${r.lng}`}
                target="_blank" rel="noreferrer"
                className="text-m-caption font-bold flex items-center gap-0.5 shrink-0"
                style={{ color: "var(--color-go)" }}
              >
                <MapPin className="size-3" /> Map
              </a>
            )}
          </div>
          <p className="text-m-caption mt-0.5" style={{ color: "var(--color-ink-500)" }}>
            {formatDate(r.date)}
            {r.checkIn ? ` · in ${new Date(r.checkIn).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : ""}
            {r.projectName ? ` · ${r.projectName}` : ""}
            {r.fenceDistanceM != null ? ` · ${(r.fenceDistanceM / 1000).toFixed(1)} km off-site` : ""}
          </p>
          {r.location && (
            <p className="text-m-caption truncate" style={{ color: "var(--color-ink-400)" }}>{r.location}</p>
          )}
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => review(r.id, "APPROVED")}
              disabled={busy === r.id}
              className="flex-1 rounded-[0.375rem] py-1.5 text-m-caption font-bold flex items-center justify-center gap-1 press disabled:opacity-50"
              style={{ backgroundColor: "var(--color-go)", color: "var(--color-paper)" }}
            >
              <Check className="size-3.5" /> Approve
            </button>
            <button
              onClick={() => review(r.id, "REJECTED")}
              disabled={busy === r.id}
              className="flex-1 rounded-[0.375rem] py-1.5 text-m-caption font-bold flex items-center justify-center gap-1 press disabled:opacity-50"
              style={{ backgroundColor: "color-mix(in srgb, var(--color-stop) 12%, transparent)", color: "var(--color-stop)" }}
            >
              <X className="size-3.5" /> Reject
            </button>
          </div>
        </div>
      ))}
      {promptDialog}
    </div>
  );
}
