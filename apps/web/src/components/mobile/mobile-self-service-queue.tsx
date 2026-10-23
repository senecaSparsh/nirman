"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card } from "@/components/mobile/v2/primitives";

type AdvanceRow = { id: string; employeeId: string; employeeName: string; amount: number; notes: string | null };
type CorrectionRow = { id: string; employeeId: string; employeeName: string; date: string; requestedStatus: string; reason: string };

/** Self-service asks on the mobile approvals page — the field approver
    decides without a desktop. Advance approve needs the recovery amount. */
export function MobileSelfServiceQueue({ advances, corrections }: { advances: AdvanceRow[]; corrections: CorrectionRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<Record<string, string>>({});

  async function decide(kind: "advance" | "correction", r: AdvanceRow | CorrectionRow, approve: boolean, extra?: object) {
    setBusy(r.id);
    try {
      const path = kind === "advance"
        ? `/api/employees/${r.employeeId}/advances/${r.id}`
        : `/api/employees/${r.employeeId}/attendance-corrections/${r.id}`;
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approve, ...extra }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(approve ? (kind === "advance" ? "Advance approved" : "Day corrected") : "Request declined");
        router.refresh();
      } else {
        toast.error(data.error ?? "Decision failed");
      }
    } finally { setBusy(null); }
  }

  return (
    <div className="mt-4 space-y-3">
      {advances.length > 0 && (
        <Card className="p-4">
          <p className="text-m-caption font-bold" style={{ color: "var(--color-ink-700)" }}>
            Advance requests · {advances.length}
          </p>
          <div className="mt-2 space-y-3">
            {advances.map((a) => (
              <div key={a.id} className="rounded-lg p-2.5" style={{ border: "1px solid var(--color-line)" }}>
                <div className="flex items-baseline justify-between">
                  <p className="text-m-body font-semibold" style={{ color: "var(--color-ink-950)" }}>{a.employeeName}</p>
                  <p className="text-m-caption font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>₹{a.amount.toLocaleString("en-IN")}</p>
                </div>
                {a.notes && <p className="mt-0.5 text-m-caption" style={{ color: "var(--color-ink-500)" }}>{a.notes}</p>}
                <div className="mt-2 flex gap-2">
                  <input aria-label="Recovery"
                    type="number" inputMode="numeric" min="1" placeholder="₹/month"
                    value={recovery[a.id] ?? ""}
                    onChange={(e) => setRecovery((s) => ({ ...s, [a.id]: e.target.value }))}
                    className="w-20 rounded-md px-2 py-1.5 text-m-caption"
                    style={{ border: "1px solid var(--color-line)", color: "var(--color-ink-950)" }}
                  />
                  <button
                    type="button" disabled={busy === a.id}
                    onClick={() => decide("advance", a, true, { monthlyRecovery: Number(recovery[a.id]) })}
                    className="flex-1 rounded-lg py-1.5 text-m-caption font-bold"
                    style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
                  >Approve</button>
                  <button
                    type="button" disabled={busy === a.id}
                    onClick={() => {
                      const note = window.prompt("Why is this being declined? (the worker reads this)");
                      if (note === null) return;
                      if (!note.trim()) { toast.error("Give the worker a reason"); return; }
                      decide("advance", a, false, { note: note.trim() });
                    }}
                    className="flex-1 rounded-lg py-1.5 text-m-caption font-bold"
                    style={{ border: "1px solid var(--color-line)", color: "var(--color-ink-700)" }}
                  >Reject</button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
      {corrections.length > 0 && (
        <Card className="p-4">
          <p className="text-m-caption font-bold" style={{ color: "var(--color-ink-700)" }}>
            Punch-fix requests · {corrections.length}
          </p>
          <div className="mt-2 space-y-3">
            {corrections.map((c) => (
              <div key={c.id} className="rounded-lg p-2.5" style={{ border: "1px solid var(--color-line)" }}>
                <div className="flex items-baseline justify-between">
                  <p className="text-m-body font-semibold" style={{ color: "var(--color-ink-950)" }}>{c.employeeName}</p>
                  <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                    {c.date.slice(5).split("-").reverse().join("/")} · {c.requestedStatus.replace(/_/g, " ").toLowerCase()}
                  </p>
                </div>
                <p className="mt-0.5 text-m-caption" style={{ color: "var(--color-ink-500)" }}>{c.reason}</p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button" disabled={busy === c.id}
                    onClick={() => decide("correction", c, true)}
                    className="flex-1 rounded-lg py-1.5 text-m-caption font-bold"
                    style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
                  >Approve</button>
                  <button
                    type="button" disabled={busy === c.id}
                    onClick={() => {
                      const note = window.prompt("Why is this being declined? (the worker reads this)");
                      if (note === null) return;
                      if (!note.trim()) { toast.error("Give the worker a reason"); return; }
                      decide("correction", c, false, { note: note.trim() });
                    }}
                    className="flex-1 rounded-lg py-1.5 text-m-caption font-bold"
                    style={{ border: "1px solid var(--color-line)", color: "var(--color-ink-700)" }}
                  >Reject</button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}