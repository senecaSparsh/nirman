"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import {Loader2, Play, Check, Ban, Trash2} from "lucide-react";
import { haptic } from "@/lib/haptic";
import { formatDate } from "@/lib/utils";
import { useConfirm } from "@/lib/use-confirm";
import { ActionBar } from "@/components/mobile/v2/primitives";
import { MobileDialog } from "@/components/mobile/v2/dialog";
import { DetailHeroCard, DetailAlertBanner, DetailStatGrid, DetailKeyValueCard } from "@/components/mobile/v2/detail-primitives";

interface InspectionDetail {
  id: string; inspectionNumber: string; title: string; status: string; result: string | null;
  projectName: string; inspectorName: string | null;
  findings: string | null; complianceNotes: string | null; followUpActions: string | null;
  attachments: string[];
  scheduledDate: string;
  conductedDate: string | null; conductedByName: string | null;
}

type InspResult = "PASSED" | "PASSED_WITH_NOTES" | "FAILED" | "STOP_WORK";

const RESULT_TONES: Record<string, string> = {
  PASSED: "var(--color-go)", PASSED_WITH_NOTES: "var(--color-signal)",
  FAILED: "var(--color-stop)", STOP_WORK: "var(--color-stop)",
};

const RESULT_BG: Record<string, string> = {
  PASSED: "rgba(22,163,74,0.1)", PASSED_WITH_NOTES: "rgba(224,154,16,0.1)",
  FAILED: "rgba(220,38,38,0.1)", STOP_WORK: "rgba(220,38,38,0.15)",
};

export function MobileInspectionDetailClient({ inspection, canManage }: { inspection: InspectionDetail; canManage: boolean }) {
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const [acting, setActing] = useState<string | null>(null);
  const [showComplete, setShowComplete] = useState(false);
  const [completeForm, setCompleteForm] = useState<{ result: InspResult; findings: string; complianceNotes: string; followUpActions: string }>({ result: "PASSED", findings: "", complianceNotes: "", followUpActions: "" });

  async function doAction(action: string, extra?: Record<string, unknown>) {
    setActing(action); haptic(20);
    try {
      const res = await fetch(`/api/safety/inspections/${inspection.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success(`Inspection ${action}d`); router.refresh();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setActing(null); setShowComplete(false); setCompleteForm({ result: "PASSED", findings: "", complianceNotes: "", followUpActions: "" }); }
  }

  return (
    <div className="pb-20">
      {/* Header */}
      <DetailHeroCard
        title={inspection.title}
        subtitle={inspection.projectName}
        status={inspection.status}
      >
        <p className="text-m-label font-bold tabular-nums mt-2" style={{ color: "var(--color-ink-500)" }}>{inspection.inspectionNumber}</p>
      </DetailHeroCard>

      {/* Result banner */}
      {inspection.result && (
        <DetailAlertBanner
          tone={inspection.result === "PASSED" ? "success" : inspection.result === "PASSED_WITH_NOTES" ? "warning" : "danger"}
          title={inspection.result.replace(/_/g, " ")}
        />
      )}

      {/* Details */}
      <DetailStatGrid
        cols={2}
        stats={[
          { label: "Scheduled", value: formatDate(inspection.scheduledDate) },
          ...(inspection.conductedDate ? [{ label: "Conducted", value: formatDate(inspection.conductedDate) }] : []),
          ...(inspection.inspectorName ? [{ label: "Inspector", value: inspection.inspectorName }] : []),
        ]}
      />

      {/* Findings */}
      {inspection.findings && (
        <div className="rounded-[0.625rem] border p-3 mb-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
          <p className="text-m-label font-semibold uppercase mb-1" style={{ color: "var(--color-ink-500)" }}>Findings</p>
          <p className="text-m-section" style={{ color: "var(--color-ink-950)" }}>{inspection.findings}</p>
        </div>
      )}
      {inspection.complianceNotes && (
        <div className="rounded-[0.625rem] border p-3 mb-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
          <p className="text-m-label font-semibold uppercase mb-1" style={{ color: "var(--color-ink-500)" }}>Compliance Notes</p>
          <p className="text-m-section" style={{ color: "var(--color-ink-950)" }}>{inspection.complianceNotes}</p>
        </div>
      )}
      {inspection.followUpActions && (
        <div className="rounded-[0.625rem] border p-3 mb-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
          <p className="text-m-label font-semibold uppercase mb-1" style={{ color: "var(--color-ink-500)" }}>Follow-Up Actions</p>
          <p className="text-m-section" style={{ color: "var(--color-ink-950)" }}>{inspection.followUpActions}</p>
        </div>
      )}

      {/* Photo evidence */}
      {inspection.attachments.length > 0 && (
        <div className="mb-3">
          <p className="text-m-caption font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--color-steel)" }}>
            Photo Evidence ({inspection.attachments.length})
          </p>
          <div className="grid grid-cols-2 gap-2">
            {inspection.attachments.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="relative block overflow-hidden rounded-[0.375rem] border aspect-video" style={{ borderColor: "var(--color-line)" }}>
                <Image src={url} alt={`Evidence ${i + 1}`} fill className="object-cover" sizes="(max-width: 768px) 100vw, 400px" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Timeline */}
      <DetailKeyValueCard
        title="Timeline"
        entries={[
          { label: "Scheduled", value: formatDate(inspection.scheduledDate) },
          ...(inspection.conductedDate ? [{ label: "Conducted", value: `${formatDate(inspection.conductedDate)}${inspection.conductedByName ? ` · by ${inspection.conductedByName}` : ""}` }] : []),
        ]}
      />

      {/* Actions */}
      {canManage && (
        <ActionBar>
          {inspection.status === "SCHEDULED" && (
            <ActionButton onClick={() => doAction("start")} loading={acting === "start"} icon={Play} label="Start" variant="primary" />
          )}
          {(inspection.status === "SCHEDULED" || inspection.status === "IN_PROGRESS") && (
            <ActionButton onClick={() => setShowComplete(true)} loading={false} icon={Check} label="Complete" variant="go" />
          )}
          {inspection.status !== "COMPLETED" && inspection.status !== "CANCELLED" && (
            <ActionButton onClick={() => doAction("cancel")} loading={acting === "cancel"} icon={Ban} label="Cancel" variant="secondary" />
          )}
          {(inspection.status === "SCHEDULED" || inspection.status === "CANCELLED") && (
            <ActionButton onClick={async () => { const ok = await confirm({ title: "Delete?", description: "Delete this inspection?", confirmLabel: "Delete", variant: "destructive" }); if (!ok) return; await doAction("delete"); router.push("/m/construction?tab=safety"); }} loading={acting === "delete"} icon={Trash2} label="Delete" variant="danger" />
          )}
        </ActionBar>
      )}

      {/* Complete dialog */}
      {showComplete && (
        <MobileDialog open={showComplete} onClose={() => setShowComplete(false)} title="Complete Inspection">
          <div className="flex flex-col gap-3">
            <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
              <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
                Result
              </p>
              <div>
                <label className="text-m-label font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Result</label>
                <div className="grid grid-cols-2 gap-2">
                  {([["PASSED", "Passed"], ["PASSED_WITH_NOTES", "Passed w/ Notes"], ["FAILED", "Failed"], ["STOP_WORK", "Stop Work"]] as const).map(([val, label]) => (
                    <button key={val} onClick={() => setCompleteForm((f) => ({ ...f, result: val }))} className="h-10 rounded-[0.5rem] border text-m-body font-bold text-m-body press" style={{ borderColor: completeForm.result === val ? RESULT_TONES[val] : "var(--color-line)", backgroundColor: completeForm.result === val ? RESULT_BG[val] : "var(--color-paper)", color: completeForm.result === val ? RESULT_TONES[val] : "var(--color-ink-700)" }}>{label}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>Findings</label>
                <textarea value={completeForm.findings} onChange={(e) => setCompleteForm((f) => ({ ...f, findings: e.target.value }))} rows={2} placeholder="What did you observe?" className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors resize-none" style={{ backgroundColor: "transparent" }} />
              </div>
              <div>
                <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>Compliance Notes (optional)</label>
                <textarea value={completeForm.complianceNotes} onChange={(e) => setCompleteForm((f) => ({ ...f, complianceNotes: e.target.value }))} rows={1} className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors resize-none" style={{ backgroundColor: "transparent" }} />
              </div>
              <div>
                <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>Follow-Up Actions (optional)</label>
                <textarea value={completeForm.followUpActions} onChange={(e) => setCompleteForm((f) => ({ ...f, followUpActions: e.target.value }))} rows={1} className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors resize-none" style={{ backgroundColor: "transparent" }} />
              </div>
            </div>
            <button onClick={() => { if (!completeForm.findings.trim()) { toast.error("Findings required"); return; } doAction("complete", completeForm); }} disabled={acting === "complete"} className="w-full h-11 rounded-[0.5rem] text-m-section font-bold flex items-center justify-center gap-1.5 text-m-body press" style={{ backgroundColor: "var(--color-go)", color: "var(--color-ink-950)" }}>
              {acting === "complete" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Submit Result
            </button>
          </div>
        </MobileDialog>
      )}
      {confirmDialog}
    </div>
  );
}

function ActionButton({ onClick, loading, icon: Icon, label, variant }: { onClick: () => void; loading: boolean; icon: React.ComponentType<{ className?: string }>; label: string; variant: "primary" | "go" | "danger" | "secondary" }) {
  const styles: Record<string, React.CSSProperties> = {
    primary: { backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)", borderColor: "var(--color-ink-950)" },
    go: { backgroundColor: "var(--color-go)", color: "var(--color-ink-950)", borderColor: "var(--color-go-active)" },
    danger: { backgroundColor: "var(--color-stop)", color: "var(--color-paper)", borderColor: "var(--color-stop-active)" },
    secondary: { backgroundColor: "var(--color-paper)", color: "var(--color-ink-700)", borderColor: "var(--color-line)" },
  };
  return (
    <button onClick={onClick} disabled={loading} className="w-full h-11 rounded-[0.5rem] border text-m-body font-bold flex items-center justify-center gap-1.5 text-m-body press" style={styles[variant]}>
      {loading ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}{label}
    </button>
  );
}
