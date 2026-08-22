"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Send, Check, X, Ban, Trash2, Play, ShieldCheck, ClipboardCheck } from "lucide-react";
import { haptic } from "@/lib/haptic";
import { formatDate } from "@/lib/utils";
import { MobileStatusBadge } from "@/components/mobile/v2/primitives";

interface NcrDetail {
  id: string;
  ncrNumber: string;
  title: string;
  description: string;
  category: string;
  severity: string;
  status: string;
  projectName: string;
  location: string | null;
  wbsNodeName: string | null;
  boqItemSerial: string | null;
  boqItemDescription: string | null;
  responsibleParty: string | null;
  subcontractorName: string | null;
  attachments: string[];
  reviewNotes: string | null;
  closureNotes: string | null;
  raisedAt: string;
  raisedByName: string | null;
  reviewedAt: string | null;
  reviewedByName: string | null;
  closedAt: string | null;
  closedByName: string | null;
  capa: {
    id: string;
    capaNumber: string;
    status: string;
    rootCause: string;
    correctiveAction: string;
    correctiveDueDate: string | null;
    correctiveDoneAt: string | null;
    correctiveDoneByName: string | null;
    preventiveAction: string;
    preventiveDueDate: string | null;
    preventiveDoneAt: string | null;
    preventiveDoneByName: string | null;
    verificationMethod: string | null;
    verificationNotes: string | null;
    verifiedAt: string | null;
    verifiedByName: string | null;
    closureNotes: string | null;
    closedAt: string | null;
    closedByName: string | null;
  } | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  MATERIAL: "Material", WORKMANSHIP: "Workmanship", DESIGN: "Design",
  DOCUMENT: "Document", PROCESS: "Process", SAFETY: "Safety", OTHER: "Other",
};

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: "var(--color-stop)", MAJOR: "var(--color-signal)",
  MINOR: "var(--color-ink-500)", OBSERVATION: "var(--color-ink-500)",
};

export function MobileNcrDetailClient({
  ncr,
  canManage,
}: {
  ncr: NcrDetail;
  canManage: boolean;
}) {
  const router = useRouter();
  const [acting, setActing] = useState<string | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [reviewForm, setReviewForm] = useState({ outcome: "CAPA_REQUIRED" as "CAPA_REQUIRED" | "ACCEPTED" | "REJECTED", reviewNotes: "" });
  const [showClose, setShowClose] = useState(false);
  const [closureNotes, setClosureNotes] = useState("");
  const [showCapa, setShowCapa] = useState(false);
  const [capaForm, setCapaForm] = useState({
    rootCause: "", correctiveAction: "", preventiveAction: "",
    correctiveDueDate: "", preventiveDueDate: "",
  });
  const [showVerify, setShowVerify] = useState(false);
  const [verifyForm, setVerifyForm] = useState({ verificationMethod: "", verificationNotes: "", effective: true });
  const [showCapaClose, setShowCapaClose] = useState(false);
  const [capaClosureNotes, setCapaClosureNotes] = useState("");

  async function ncrAction(action: string, extra?: Record<string, unknown>) {
    setActing(action);
    haptic(20);
    try {
      const res = await fetch(`/api/quality-control/ncr/${ncr.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success(`NCR ${action}ed`);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setActing(null);
      setShowReview(false);
      setShowClose(false);
      setReviewForm({ outcome: "CAPA_REQUIRED", reviewNotes: "" });
      setClosureNotes("");
    }
  }

  async function capaAction(action: string, extra?: Record<string, unknown>) {
    if (!ncr.capa) return;
    setActing(action);
    haptic(20);
    try {
      const res = await fetch(`/api/quality-control/capa/${ncr.capa.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success(`CAPA ${action}`);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setActing(null);
      setShowVerify(false);
      setShowCapaClose(false);
      setVerifyForm({ verificationMethod: "", verificationNotes: "", effective: true });
      setCapaClosureNotes("");
    }
  }

  async function createCapa() {
    if (!capaForm.rootCause.trim() || !capaForm.correctiveAction.trim() || !capaForm.preventiveAction.trim()) {
      toast.error("Root cause, corrective action, and preventive action are all required");
      return;
    }
    setActing("create_capa");
    haptic(20);
    try {
      const res = await fetch("/api/quality-control/capa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ncrId: ncr.id,
          rootCause: capaForm.rootCause.trim(),
          correctiveAction: capaForm.correctiveAction.trim(),
          preventiveAction: capaForm.preventiveAction.trim(),
          correctiveDueDate: capaForm.correctiveDueDate || null,
          preventiveDueDate: capaForm.preventiveDueDate || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success("CAPA created");
      setShowCapa(false);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setActing(null);
    }
  }

  const sevColor = SEVERITY_COLORS[ncr.severity] ?? "var(--color-ink-500)";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-[0.5rem] border p-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[0.625rem] font-bold tabular-nums" style={{ color: "var(--color-ink-500)" }}>{ncr.ncrNumber}</p>
          <MobileStatusBadge status={ncr.status} />
        </div>
        <h1 className="text-[0.875rem] font-bold leading-tight mb-1" style={{ color: "var(--color-ink-950)" }}>{ncr.title}</h1>
        <p className="text-[0.625rem]" style={{ color: sevColor, fontWeight: 600 }}>
          {ncr.severity} · {CATEGORY_LABELS[ncr.category] ?? ncr.category}
        </p>
        <p className="text-[0.625rem] mt-1" style={{ color: "var(--color-ink-500)" }}>{ncr.projectName}</p>
      </div>

      {/* Description */}
      <div className="rounded-[0.5rem] border p-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
        <p className="text-[0.625rem] font-semibold uppercase mb-1" style={{ color: "var(--color-ink-500)" }}>Description</p>
        <p className="text-[0.75rem] leading-relaxed" style={{ color: "var(--color-ink-950)" }}>{ncr.description}</p>
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-2 gap-2">
        {ncr.location && <DetailCard label="Location" value={ncr.location} />}
        {ncr.responsibleParty && <DetailCard label="Responsible" value={ncr.responsibleParty} />}
        {ncr.subcontractorName && <DetailCard label="Subcontractor" value={ncr.subcontractorName} />}
        {ncr.wbsNodeName && <DetailCard label="WBS Node" value={ncr.wbsNodeName} />}
        {ncr.boqItemSerial && <DetailCard label="BOQ Item" value={`${ncr.boqItemSerial} — ${ncr.boqItemDescription}`} />}
      </div>

      {/* Timeline */}
      <div className="rounded-[0.5rem] border p-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
        <p className="text-[0.625rem] font-semibold uppercase mb-2" style={{ color: "var(--color-ink-500)" }}>Timeline</p>
        <div className="space-y-1.5">
          <TimelineRow label="Raised" date={ncr.raisedAt} name={ncr.raisedByName} />
          {ncr.reviewedAt && <TimelineRow label="Reviewed" date={ncr.reviewedAt} name={ncr.reviewedByName} />}
          {ncr.closedAt && <TimelineRow label="Closed" date={ncr.closedAt} name={ncr.closedByName} />}
        </div>
        {ncr.reviewNotes && (
          <div className="mt-2 rounded-[0.375rem] p-2" style={{ backgroundColor: "var(--color-concrete)" }}>
            <p className="text-[0.5rem] font-bold uppercase" style={{ color: "var(--color-ink-500)" }}>Review Notes</p>
            <p className="text-[0.625rem]" style={{ color: "var(--color-ink-950)" }}>{ncr.reviewNotes}</p>
          </div>
        )}
        {ncr.closureNotes && (
          <div className="mt-2 rounded-[0.375rem] p-2" style={{ backgroundColor: "var(--color-concrete)" }}>
            <p className="text-[0.5rem] font-bold uppercase" style={{ color: "var(--color-ink-500)" }}>Closure Notes</p>
            <p className="text-[0.625rem]" style={{ color: "var(--color-ink-950)" }}>{ncr.closureNotes}</p>
          </div>
        )}
      </div>

      {/* CAPA section */}
      {ncr.capa ? (
        <CapaSection capa={ncr.capa} />
      ) : ncr.status === "CAPA_REQUIRED" && canManage ? (
        <div className="rounded-[0.5rem] border p-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="size-4" style={{ color: "var(--color-signal)" }} />
            <p className="text-[0.75rem] font-bold" style={{ color: "var(--color-ink-950)" }}>CAPA Required</p>
          </div>
          <p className="text-[0.625rem] mb-3" style={{ color: "var(--color-ink-500)" }}>
            Create a Corrective And Preventive Action plan for this NCR.
          </p>
          <button
            onClick={() => setShowCapa(true)}
            className="w-full h-10 rounded-[0.5rem] text-[0.75rem] font-bold flex items-center justify-center gap-1.5 press"
            style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}
          >
            <ShieldCheck className="size-4" /> Create CAPA
          </button>
        </div>
      ) : null}

      {/* NCR Workflow actions */}
      {canManage && (
        <div className="flex flex-wrap gap-2">
          {(ncr.status === "OPEN" || ncr.status === "UNDER_REVIEW") && (
            <ActionButton onClick={() => setShowReview(true)} loading={false} icon={Send} label="Review" variant="primary" />
          )}
          {["CAPA_REQUIRED", "ACCEPTED", "REJECTED"].includes(ncr.status) && (
            <ActionButton onClick={() => setShowClose(true)} loading={false} icon={Check} label="Close NCR" variant="go" />
          )}
          {ncr.status === "OPEN" && (
            <ActionButton onClick={() => ncrAction("cancel")} loading={acting === "cancel"} icon={Ban} label="Cancel" variant="secondary" />
          )}
          {(ncr.status === "OPEN" || ncr.status === "CANCELLED") && (
            <ActionButton
              onClick={async () => {
                if (!confirm("Delete this NCR? This cannot be undone.")) return;
                await ncrAction("delete");
                router.push("/m/quality-control");
              }}
              loading={acting === "delete"}
              icon={Trash2}
              label="Delete"
              variant="danger"
            />
          )}
        </div>
      )}

      {/* CAPA workflow actions */}
      {canManage && ncr.capa && (
        <div className="flex flex-wrap gap-2">
          {ncr.capa.status === "DRAFT" && (
            <ActionButton onClick={() => capaAction("start")} loading={acting === "start"} icon={Play} label="Start CAPA" variant="primary" />
          )}
          {ncr.capa.status === "IN_PROGRESS" && !ncr.capa.correctiveDoneAt && (
            <ActionButton onClick={() => capaAction("corrective_done")} loading={acting === "corrective_done"} icon={Check} label="Corrective Done" variant="go" />
          )}
          {ncr.capa.status === "IN_PROGRESS" && ncr.capa.correctiveDoneAt && !ncr.capa.preventiveDoneAt && (
            <ActionButton onClick={() => capaAction("preventive_done")} loading={acting === "preventive_done"} icon={Check} label="Preventive Done" variant="go" />
          )}
          {ncr.capa.status === "VERIFICATION" && (
            <ActionButton onClick={() => setShowVerify(true)} loading={false} icon={ShieldCheck} label="Verify" variant="primary" />
          )}
          {ncr.capa.status === "VERIFIED" && (
            <ActionButton onClick={() => setShowCapaClose(true)} loading={false} icon={Check} label="Close CAPA" variant="go" />
          )}
          {ncr.capa.status === "REJECTED" && (
            <ActionButton onClick={() => capaAction("start")} loading={acting === "start"} icon={Play} label="Restart CAPA" variant="primary" />
          )}
        </div>
      )}

      {/* Review dialog */}
      {showReview && (
        <BottomSheet title="Review NCR" onClose={() => setShowReview(false)}>
          <div className="space-y-3">
            <div>
              <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Outcome</label>
              <select
                value={reviewForm.outcome}
                onChange={(e) => setReviewForm((f) => ({ ...f, outcome: e.target.value as any }))}
                className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem]"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
              >
                <option value="CAPA_REQUIRED">CAPA Required</option>
                <option value="ACCEPTED">Accepted (with concession)</option>
                <option value="REJECTED">Rejected (rework required)</option>
              </select>
            </div>
            <div>
              <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Review Notes</label>
              <textarea
                value={reviewForm.reviewNotes}
                onChange={(e) => setReviewForm((f) => ({ ...f, reviewNotes: e.target.value }))}
                rows={3}
                placeholder="Findings from the review…"
                className="w-full rounded-[0.5rem] border px-3 py-2 text-[0.75rem]"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
              />
            </div>
            <button
              onClick={() => {
                if (!reviewForm.reviewNotes.trim()) { toast.error("Review notes are required"); return; }
                ncrAction("review", { outcome: reviewForm.outcome, reviewNotes: reviewForm.reviewNotes });
              }}
              disabled={acting === "review"}
              className="w-full h-11 rounded-[0.5rem] text-[0.75rem] font-bold flex items-center justify-center gap-1.5 press"
              style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}
            >
              {acting === "review" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Submit Review
            </button>
          </div>
        </BottomSheet>
      )}

      {/* Close NCR dialog */}
      {showClose && (
        <BottomSheet title="Close NCR" onClose={() => setShowClose(false)}>
          <div className="space-y-3">
            <div>
              <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Closure Notes</label>
              <textarea
                value={closureNotes}
                onChange={(e) => setClosureNotes(e.target.value)}
                rows={3}
                placeholder="How was the non-conformance resolved?"
                className="w-full rounded-[0.5rem] border px-3 py-2 text-[0.75rem]"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
              />
            </div>
            <button
              onClick={() => {
                if (!closureNotes.trim()) { toast.error("Closure notes are required"); return; }
                ncrAction("close", { closureNotes });
              }}
              disabled={acting === "close"}
              className="w-full h-11 rounded-[0.5rem] text-[0.75rem] font-bold flex items-center justify-center gap-1.5 press"
              style={{ backgroundColor: "var(--color-go)", color: "var(--color-ink-950)" }}
            >
              {acting === "close" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              Confirm Closure
            </button>
          </div>
        </BottomSheet>
      )}

      {/* Create CAPA dialog */}
      {showCapa && (
        <BottomSheet title="Create CAPA" onClose={() => setShowCapa(false)}>
          <div className="space-y-3">
            <div>
              <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Root Cause</label>
              <textarea value={capaForm.rootCause} onChange={(e) => setCapaForm((f) => ({ ...f, rootCause: e.target.value }))} rows={2} placeholder="Why did the non-conformance happen?" className="w-full rounded-[0.5rem] border px-3 py-2 text-[0.75rem]" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }} />
            </div>
            <div>
              <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Corrective Action</label>
              <textarea value={capaForm.correctiveAction} onChange={(e) => setCapaForm((f) => ({ ...f, correctiveAction: e.target.value }))} rows={2} placeholder="What will be done to fix it?" className="w-full rounded-[0.5rem] border px-3 py-2 text-[0.75rem]" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }} />
            </div>
            <div>
              <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Preventive Action</label>
              <textarea value={capaForm.preventiveAction} onChange={(e) => setCapaForm((f) => ({ ...f, preventiveAction: e.target.value }))} rows={2} placeholder="What will prevent recurrence?" className="w-full rounded-[0.5rem] border px-3 py-2 text-[0.75rem]" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Corrective Due</label>
                <input type="date" value={capaForm.correctiveDueDate} onChange={(e) => setCapaForm((f) => ({ ...f, correctiveDueDate: e.target.value }))} className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem]" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }} />
              </div>
              <div>
                <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Preventive Due</label>
                <input type="date" value={capaForm.preventiveDueDate} onChange={(e) => setCapaForm((f) => ({ ...f, preventiveDueDate: e.target.value }))} className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem]" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }} />
              </div>
            </div>
            <button onClick={createCapa} disabled={acting === "create_capa"} className="w-full h-11 rounded-[0.5rem] text-[0.75rem] font-bold flex items-center justify-center gap-1.5 press" style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}>
              {acting === "create_capa" ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
              Create CAPA
            </button>
          </div>
        </BottomSheet>
      )}

      {/* Verify CAPA dialog */}
      {showVerify && (
        <BottomSheet title="Verify CAPA" onClose={() => setShowVerify(false)}>
          <div className="space-y-3">
            <div>
              <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Verification Method</label>
              <input value={verifyForm.verificationMethod} onChange={(e) => setVerifyForm((f) => ({ ...f, verificationMethod: e.target.value }))} placeholder="e.g. Site inspection, test report" className="w-full h-10 rounded-[0.5rem] border px-3 text-[0.75rem]" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }} />
            </div>
            <div>
              <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Verification Notes</label>
              <textarea value={verifyForm.verificationNotes} onChange={(e) => setVerifyForm((f) => ({ ...f, verificationNotes: e.target.value }))} rows={3} placeholder="Was the corrective action effective?" className="w-full rounded-[0.5rem] border px-3 py-2 text-[0.75rem]" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => { if (!verifyForm.verificationMethod.trim() || !verifyForm.verificationNotes.trim()) { toast.error("All fields required"); return; } capaAction("verify", { ...verifyForm, effective: true }); }} disabled={acting === "verify"} className="h-11 rounded-[0.5rem] text-[0.75rem] font-bold flex items-center justify-center gap-1.5 press" style={{ backgroundColor: "var(--color-go)", color: "var(--color-ink-950)" }}>
                {acting === "verify" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Effective
              </button>
              <button onClick={() => { if (!verifyForm.verificationMethod.trim() || !verifyForm.verificationNotes.trim()) { toast.error("All fields required"); return; } capaAction("verify", { ...verifyForm, effective: false }); }} disabled={acting === "verify"} className="h-11 rounded-[0.5rem] text-[0.75rem] font-bold flex items-center justify-center gap-1.5 press" style={{ backgroundColor: "var(--color-stop)", color: "#fff" }}>
                <X className="size-4" /> Not Effective
              </button>
            </div>
          </div>
        </BottomSheet>
      )}

      {/* Close CAPA dialog */}
      {showCapaClose && (
        <BottomSheet title="Close CAPA" onClose={() => setShowCapaClose(false)}>
          <div className="space-y-3">
            <div>
              <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Closure Notes</label>
              <textarea value={capaClosureNotes} onChange={(e) => setCapaClosureNotes(e.target.value)} rows={3} placeholder="Final closure notes…" className="w-full rounded-[0.5rem] border px-3 py-2 text-[0.75rem]" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }} />
            </div>
            <button onClick={() => { if (!capaClosureNotes.trim()) { toast.error("Closure notes required"); return; } capaAction("close", { closureNotes: capaClosureNotes }); }} disabled={acting === "close"} className="w-full h-11 rounded-[0.5rem] text-[0.75rem] font-bold flex items-center justify-center gap-1.5 press" style={{ backgroundColor: "var(--color-go)", color: "var(--color-ink-950)" }}>
              {acting === "close" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Confirm Closure
            </button>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}

function CapaSection({ capa }: { capa: NonNullable<NcrDetail["capa"]> }) {
  return (
    <div className="rounded-[0.5rem] border overflow-hidden" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
      <div className="px-3 py-2 border-b flex items-center justify-between" style={{ borderColor: "var(--color-line)" }}>
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4" style={{ color: "var(--color-go)" }} />
          <p className="text-[0.75rem] font-bold" style={{ color: "var(--color-ink-950)" }}>{capa.capaNumber}</p>
        </div>
        <MobileStatusBadge status={capa.status} />
      </div>
      <div className="p-3 space-y-2">
        <CapaField label="Root Cause" value={capa.rootCause} />
        <CapaField label="Corrective Action" value={capa.correctiveAction} done={!!capa.correctiveDoneAt} doneByName={capa.correctiveDoneByName} doneAt={capa.correctiveDoneAt} dueDate={capa.correctiveDueDate} />
        <CapaField label="Preventive Action" value={capa.preventiveAction} done={!!capa.preventiveDoneAt} doneByName={capa.preventiveDoneByName} doneAt={capa.preventiveDoneAt} dueDate={capa.preventiveDueDate} />
        {capa.verificationMethod && <CapaField label="Verification Method" value={capa.verificationMethod} />}
        {capa.verificationNotes && <CapaField label="Verification Notes" value={capa.verificationNotes} done={!!capa.verifiedAt} doneByName={capa.verifiedByName} doneAt={capa.verifiedAt} />}
        {capa.closureNotes && <CapaField label="Closure Notes" value={capa.closureNotes} done={!!capa.closedAt} doneByName={capa.closedByName} doneAt={capa.closedAt} />}
      </div>
    </div>
  );
}

function CapaField({ label, value, done, doneByName, doneAt, dueDate }: { label: string; value: string; done?: boolean; doneByName?: string | null; doneAt?: string | null; dueDate?: string | null }) {
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <p className="text-[0.5rem] font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>{label}</p>
        {done && <Check className="size-3" style={{ color: "var(--color-go)" }} />}
      </div>
      <p className="text-[0.625rem] leading-relaxed" style={{ color: "var(--color-ink-950)" }}>{value}</p>
      {(doneAt || dueDate) && (
        <p className="text-[0.5rem] mt-0.5" style={{ color: "var(--color-ink-500)" }}>
          {doneAt ? `Done ${formatDate(doneAt)}${doneByName ? ` by ${doneByName}` : ""}` : dueDate ? `Due ${formatDate(dueDate)}` : ""}
        </p>
      )}
    </div>
  );
}

function DetailCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[0.5rem] border p-2.5" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
      <p className="text-[0.375rem] font-semibold uppercase mb-0.5" style={{ color: "var(--color-ink-500)" }}>{label}</p>
      <p className="text-[0.625rem] font-bold" style={{ color: "var(--color-ink-950)" }}>{value}</p>
    </div>
  );
}

function TimelineRow({ label, date, name }: { label: string; date: string; name?: string | null }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-[0.625rem] font-semibold" style={{ color: "var(--color-ink-950)" }}>{label}</p>
        {name && <p className="text-[0.5rem]" style={{ color: "var(--color-ink-500)" }}>by {name}</p>}
      </div>
      <p className="text-[0.625rem] tabular-nums" style={{ color: "var(--color-ink-500)" }}>{formatDate(date)}</p>
    </div>
  );
}

function ActionButton({ onClick, loading, icon: Icon, label, variant }: { onClick: () => void; loading: boolean; icon: React.ComponentType<{ className?: string }>; label: string; variant: "primary" | "go" | "danger" | "secondary" }) {
  const styles: Record<string, React.CSSProperties> = {
    primary: { backgroundColor: "var(--color-ink-950)", color: "#fff", borderColor: "var(--color-ink-950)" },
    go: { backgroundColor: "var(--color-go)", color: "var(--color-ink-950)", borderColor: "var(--color-go-active)" },
    danger: { backgroundColor: "var(--color-stop)", color: "#fff", borderColor: "var(--color-stop-active)" },
    secondary: { backgroundColor: "var(--color-paper)", color: "var(--color-ink-700)", borderColor: "var(--color-line)" },
  };
  return (
    <button onClick={onClick} disabled={loading} className="flex-1 min-w-[140px] h-11 rounded-[0.5rem] border text-[0.6875rem] font-bold flex items-center justify-center gap-1.5 press" style={styles[variant]}>
      {loading ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
      {label}
    </button>
  );
}

function BottomSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
      <div className="mt-auto rounded-t-[1rem] max-h-[80vh] overflow-y-auto" style={{ backgroundColor: "var(--color-paper)", animation: "slideUp 0.25s ease-out" }}>
        <div className="sticky top-0 flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
          <h2 className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>{title}</h2>
          <button onClick={onClose} className="press"><X className="size-4" style={{ color: "var(--color-ink-500)" }} /></button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
