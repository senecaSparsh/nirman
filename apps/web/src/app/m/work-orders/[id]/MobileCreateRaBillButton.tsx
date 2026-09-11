"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, X, FileText, IndianRupee } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency, formatDate } from "@/lib/utils";

type PreviewLine = {
  boqItemId: string;
  serialNo: string;
  description: string;
  unit: string | null;
  agreedRate: number;
  unbilledEntries: {
    id: string;
    mbNumber: string;
    measuredQty: number;
    measureDate: string;
    description: string;
  }[];
};

type PreviewData = {
  workOrderNumber: string;
  retentionPct: number;
  tdsPct: number;
  lines: PreviewLine[];
  summary: {
    totalUnbilledQty: number;
    estimatedGross: number;
    estimatedRetention: number;
    estimatedTds: number;
    estimatedAdvanceRecovery: number;
  };
};

export function MobileCreateRaBillButton({
  workOrderId,
  workOrderNumber,
}: {
  workOrderId: string;
  workOrderNumber: string;
}) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  // Fetch preview when sheet opens
  useEffect(() => {
    if (!open || !workOrderId) return;
    setPreviewLoading(true);
    setPreview(null);
    fetch(`/api/ra-bills?preview=unbilled&workOrderId=${workOrderId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setPreview(data);
      })
 .catch(() => setPreview(null))
      .finally(() => setPreviewLoading(false));
  }, [open, workOrderId]);

  async function handleSubmit() {
    if (!periodFrom || !periodTo) {
      toast.error("Select a billing period");
      return;
    }
    if (new Date(periodFrom) > new Date(periodTo)) {
      toast.error("Period 'From' cannot be after 'To'");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/ra-bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workOrderId,
          periodFrom: new Date(periodFrom).toISOString(),
          periodTo: new Date(periodTo).toISOString(),
          notes: notes || undefined,
          autoSubmit: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      if (data.submitted) {
        toast.success(`RA bill ${data.raBillNumber} submitted for approval`, {
          description: `Gross: ${formatCurrency(data.grossAmount)} · Net: ${formatCurrency(data.netPayable)}`,
        });
      } else {
        toast.warning(`RA bill ${data.raBillNumber} saved as draft`, {
          description: data.submitError
            ? `Auto-submit failed: ${data.submitError}`
            : "You can submit it for approval from the RA bill detail page.",
        });
      }
      setOpen(false);
      setPeriodFrom("");
      setPeriodTo("");
      setNotes("");
      // Trigger page refresh
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  const totalUnbilled = preview?.lines.reduce((s, l) => s + l.unbilledEntries.length, 0) ?? 0;
  const hasUnbilled = totalUnbilled > 0;
  const estNet = preview
    ? preview.summary.estimatedGross - preview.summary.estimatedRetention - preview.summary.estimatedTds - preview.summary.estimatedAdvanceRecovery
    : 0;

  const inputClass = "w-full h-9 px-2 text-m-body outline-none border-b focus:border-b-2 transition-colors";
  const inputStyle = { borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" };
  const labelClass = "block text-m-caption font-bold mb-1";
  const labelStyle = { color: "var(--color-ink-700)" };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center justify-center gap-1.5 h-9 rounded-[0.5rem] font-bold text-m-caption press active:scale-95 w-full"
        style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
      >
        <Plus className="size-3.5" />
        Create RA Bill
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end"
          style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 40%, transparent)" }}
          onClick={() => !saving && setOpen(false)}
        >
          <div
            className="w-full rounded-t-[1rem] mx-auto max-w-md max-h-[85vh] overflow-y-auto"
            style={{ backgroundColor: "var(--color-paper)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle + header */}
            <div className="flex justify-center pt-2 pb-1 sticky top-0" style={{ backgroundColor: "var(--color-paper)" }}>
              <div className="h-1 w-10 rounded-full" style={{ backgroundColor: "var(--color-line)" }} />
            </div>
            <div className="flex items-center justify-between px-3 pb-2 sticky top-3" style={{ backgroundColor: "var(--color-paper)" }}>
              <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
                Create RA Bill
              </p>
              <button onClick={() => setOpen(false)} disabled={saving} aria-label="Close" className="text-m-body press p-1">
                <X className="size-4" style={{ color: "var(--color-ink-500)" }} />
              </button>
            </div>

            <div className="px-3 pb-4 flex flex-col gap-3">
              <p className="text-m-label" style={{ color: "var(--color-ink-500)" }}>
                {workOrderNumber} — billing period for completed work
              </p>

              {/* Billing period */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass} style={labelStyle}>Period From *</label>
                  <input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} className={inputClass} style={inputStyle} />
                </div>
                <div>
                  <label className={labelClass} style={labelStyle}>Period To *</label>
                  <input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} className={inputClass} style={inputStyle} />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className={labelClass} style={labelStyle}>Notes (optional)</label>
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. RA Bill 1 — Ground floor brickwork"
                  className={inputClass}
                  style={inputStyle}
                />
              </div>

              {/* Preview */}
              {previewLoading ? (
                <div className="rounded-[0.5rem] border p-3 text-center text-m-caption" style={{ borderColor: "var(--color-line)", color: "var(--color-ink-500)" }}>
                  <Loader2 className="size-4 animate-spin mx-auto mb-1" />
                  Loading available MB entries…
                </div>
              ) : preview ? (
                hasUnbilled ? (
                  <div className="rounded-[0.5rem] border p-3 flex flex-col gap-2" style={{ borderColor: "var(--color-line)" }}>
                    <div className="flex items-center gap-1.5">
                      <FileText className="size-3.5" style={{ color: "var(--color-ink-500)" }} />
                      <p className="text-m-caption font-bold uppercase" style={{ color: "var(--color-ink-500)" }}>
                        Unbilled MB Entries ({totalUnbilled})
                      </p>
                    </div>
                    {/* Summary */}
                    <div className="grid grid-cols-2 gap-2 text-m-caption">
                      <div>
                        <p style={{ color: "var(--color-ink-500)" }}>Est. Gross</p>
                        <p className="font-bold tnum" style={{ color: "var(--color-ink-950)" }}>{formatCurrency(preview.summary.estimatedGross)}</p>
                      </div>
                      <div>
                        <p style={{ color: "var(--color-ink-500)" }}>Est. Net Payable</p>
                        <p className="font-bold tnum" style={{ color: "var(--color-go)" }}>{formatCurrency(estNet)}</p>
                      </div>
                      {preview.summary.estimatedRetention > 0 && (
                        <div>
                          <p style={{ color: "var(--color-ink-500)" }}>Retention ({preview.retentionPct}%)</p>
                          <p className="tnum" style={{ color: "var(--color-ink-700)" }}>-{formatCurrency(preview.summary.estimatedRetention)}</p>
                        </div>
                      )}
                      {preview.summary.estimatedTds > 0 && (
                        <div>
                          <p style={{ color: "var(--color-ink-500)" }}>TDS ({preview.tdsPct}%)</p>
                          <p className="tnum" style={{ color: "var(--color-ink-700)" }}>-{formatCurrency(preview.summary.estimatedTds)}</p>
                        </div>
                      )}
                      {preview.summary.estimatedAdvanceRecovery > 0 && (
                        <div>
                          <p style={{ color: "var(--color-ink-500)" }}>Advance Recovery</p>
                          <p className="tnum" style={{ color: "var(--color-ink-700)" }}>-{formatCurrency(preview.summary.estimatedAdvanceRecovery)}</p>
                        </div>
                      )}
                    </div>
                    {/* Entry list */}
                    <div className="flex flex-col gap-1 mt-1">
                      {preview.lines.filter((l) => l.unbilledEntries.length > 0).map((l) =>
                        l.unbilledEntries.map((e) => (
                          <div key={`${l.boqItemId}-${e.id}`} className="flex items-center justify-between text-m-caption py-1 border-t" style={{ borderColor: "var(--color-line)" }}>
                            <div className="min-w-0 flex-1">
                              <p className="font-bold" style={{ color: "var(--color-ink-950)" }}>{e.mbNumber}</p>
                              <p className="truncate" style={{ color: "var(--color-ink-500)" }}>{l.description}</p>
                            </div>
                            <div className="text-right ml-2">
                              <p className="tnum font-bold" style={{ color: "var(--color-ink-950)" }}>{e.measuredQty} {l.unit ?? ""}</p>
                              <p className="tnum" style={{ color: "var(--color-ink-500)" }}>{formatDate(e.measureDate)}</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-[0.5rem] border p-3 text-center text-m-caption" style={{ borderColor: "var(--color-line)", color: "var(--color-ink-500)" }}>
                    No unbilled MB entries found. Approve measurement book entries first, then create an RA bill.
                  </div>
                )
              ) : (
                <div className="rounded-[0.5rem] border p-3 text-center text-m-caption" style={{ borderColor: "var(--color-line)", color: "var(--color-ink-500)" }}>
                  Failed to load preview. You can still create the bill.
                </div>
              )}

              {/* Submit */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setOpen(false)}
                  disabled={saving}
                  className="flex-1 h-10 rounded-[0.5rem] border text-m-label font-bold text-m-body press"
                  style={{ borderColor: "var(--color-line)", color: "var(--color-ink-700)" }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={saving || !periodFrom || !periodTo || (preview !== null && !hasUnbilled)}
                  className="flex-1 h-10 rounded-[0.5rem] text-m-label font-bold text-m-body press flex items-center justify-center gap-1.5"
                  style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)", opacity: saving || !periodFrom || !periodTo || (preview !== null && !hasUnbilled) ? 0.5 : 1 }}
                >
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <IndianRupee className="size-4" />}
                  Create & Submit
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
