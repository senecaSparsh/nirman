"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Play, Check, Trash2, ShieldAlert, X, Pencil } from "lucide-react";
import { haptic } from "@/lib/haptic";
import { formatDate } from "@/lib/utils";
import { useConfirm } from "@/lib/use-confirm";
import { ActionBar, MobileStatusBadge } from "@/components/mobile/v2/primitives";

interface HazardDetail {
  id: string; hazardNumber: string; title: string; description: string;
  status: string; riskLevel: string; likelihood: number; severity: number;
  projectName: string; location: string | null; wbsNodeName: string | null;
  mitigationPlan: string | null; resolutionNotes: string | null;
  targetResolutionDate: string | null; attachments: string[];
  identifiedAt: string; identifiedByName: string | null;
  mitigatedAt: string | null; mitigatedByName: string | null;
  resolvedAt: string | null; resolvedByName: string | null;
}

const RISK_COLORS: Record<string, string> = {
  LOW: "var(--color-go)", MEDIUM: "var(--color-signal)", HIGH: "var(--color-stop)", CRITICAL: "var(--color-stop)",
};

const RISK_BG: Record<string, string> = {
  LOW: "rgba(22,163,74,0.1)", MEDIUM: "rgba(224,154,16,0.1)", HIGH: "rgba(220,38,38,0.1)", CRITICAL: "rgba(220,38,38,0.15)",
};

export function MobileHazardDetailClient({ hazard, canManage }: { hazard: HazardDetail; canManage: boolean }) {
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const [acting, setActing] = useState<string | null>(null);
  const [showMitigate, setShowMitigate] = useState(false);
  const [mitigationPlan, setMitigationPlan] = useState(hazard.mitigationPlan ?? "");
  const [showResolve, setShowResolve] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    title: hazard.title,
    description: hazard.description,
    likelihood: String(hazard.likelihood),
    severity: String(hazard.severity),
    location: hazard.location ?? "",
    mitigationPlan: hazard.mitigationPlan ?? "",
    targetResolutionDate: hazard.targetResolutionDate ? hazard.targetResolutionDate.slice(0, 10) : "",
  });

  async function doAction(action: string, extra?: Record<string, unknown>) {
    setActing(action); haptic(20);
    try {
      const res = await fetch(`/api/safety/hazards/${hazard.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success(`Hazard ${action}d`); router.refresh();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setActing(null); setShowMitigate(false); setShowResolve(false); setShowEdit(false); setResolutionNotes(""); }
  }

  async function saveEdit() {
    haptic(20);
    const likelihood = parseInt(editForm.likelihood, 10);
    const severity = parseInt(editForm.severity, 10);
    if (isNaN(likelihood) || likelihood < 1 || likelihood > 5) { toast.error("Likelihood must be 1-5"); return; }
    if (isNaN(severity) || severity < 1 || severity > 5) { toast.error("Severity must be 1-5"); return; }
    if (!editForm.title.trim()) { toast.error("Title is required"); return; }
    if (!editForm.description.trim()) { toast.error("Description is required"); return; }
    setActing("edit");
    try {
      const body: Record<string, unknown> = {
        title: editForm.title.trim(),
        description: editForm.description.trim(),
        likelihood,
        severity,
        location: editForm.location.trim() || null,
        mitigationPlan: editForm.mitigationPlan.trim() || null,
        targetResolutionDate: editForm.targetResolutionDate || null,
      };
      const res = await fetch(`/api/safety/hazards/${hazard.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success("Hazard updated"); router.refresh();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setActing(null); setShowEdit(false); }
  }

  const riskColor = RISK_COLORS[hazard.riskLevel] ?? "var(--color-ink-500)";
  const riskBg = RISK_BG[hazard.riskLevel] ?? "var(--color-concrete)";

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div className="rounded-[0.5rem] border p-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-m-label font-bold tabular-nums" style={{ color: "var(--color-ink-500)" }}>{hazard.hazardNumber}</p>
          <MobileStatusBadge status={hazard.status} />
        </div>
        <h1 className="text-m-section font-bold leading-tight mb-1" style={{ color: "var(--color-ink-950)" }}>{hazard.title}</h1>
        <p className="text-m-label" style={{ color: "var(--color-ink-500)" }}>{hazard.projectName}</p>
      </div>

      {/* Risk assessment */}
      <div className="rounded-[0.5rem] border p-3" style={{ borderColor: "var(--color-line)", backgroundColor: riskBg }}>
        <p className="text-m-label font-semibold uppercase mb-2" style={{ color: "var(--color-ink-500)" }}>Risk Assessment</p>
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-m-caption font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Likelihood</p>
            <p className="text-m-section font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>{hazard.likelihood}/5</p>
          </div>
          <div className="w-px h-8" style={{ backgroundColor: "var(--color-line)" }} />
          <div>
            <p className="text-m-caption font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Severity</p>
            <p className="text-m-section font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>{hazard.severity}/5</p>
          </div>
          <div className="w-px h-8" style={{ backgroundColor: "var(--color-line)" }} />
          <div>
            <p className="text-m-caption font-semibold uppercase" style={{ color: "var(--color-ink-500)" }}>Score</p>
            <p className="text-m-section font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>{hazard.likelihood * hazard.severity}</p>
          </div>
          <div className="ml-auto">
            <span className="text-m-section font-bold uppercase" style={{ color: riskColor }}>{hazard.riskLevel}</span>
          </div>
        </div>
      </div>

      {/* Description */}
      <div className="rounded-[0.5rem] border p-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
        <p className="text-m-label font-semibold uppercase mb-1" style={{ color: "var(--color-ink-500)" }}>Description</p>
        <p className="text-m-section leading-relaxed" style={{ color: "var(--color-ink-950)" }}>{hazard.description}</p>
      </div>

      {/* Details */}
      <div className="grid grid-cols-2 gap-2">
        {hazard.location && <DetailCard label="Location" value={hazard.location} />}
        {hazard.wbsNodeName && <DetailCard label="WBS Node" value={hazard.wbsNodeName} />}
        {hazard.targetResolutionDate && <DetailCard label="Target Date" value={formatDate(hazard.targetResolutionDate)} />}
      </div>

      {/* Mitigation plan */}
      {hazard.mitigationPlan && (
        <div className="rounded-[0.5rem] border p-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
          <p className="text-m-label font-semibold uppercase mb-1" style={{ color: "var(--color-ink-500)" }}>Mitigation Plan</p>
          <p className="text-m-section" style={{ color: "var(--color-ink-950)" }}>{hazard.mitigationPlan}</p>
        </div>
      )}

      {/* Resolution */}
      {hazard.resolutionNotes && (
        <div className="rounded-[0.5rem] border p-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
          <p className="text-m-label font-semibold uppercase mb-1" style={{ color: "var(--color-ink-500)" }}>Resolution Notes</p>
          <p className="text-m-section" style={{ color: "var(--color-ink-950)" }}>{hazard.resolutionNotes}</p>
        </div>
      )}

      {/* Timeline */}
      <div className="rounded-[0.5rem] border p-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
        <p className="text-m-label font-semibold uppercase mb-2" style={{ color: "var(--color-ink-500)" }}>Timeline</p>
        <div className="space-y-1.5">
          <TimelineRow label="Identified" date={hazard.identifiedAt} name={hazard.identifiedByName} />
          {hazard.mitigatedAt && <TimelineRow label="Mitigation Started" date={hazard.mitigatedAt} name={hazard.mitigatedByName} />}
          {hazard.resolvedAt && <TimelineRow label="Resolved" date={hazard.resolvedAt} name={hazard.resolvedByName} />}
        </div>
      </div>

      {/* Actions */}
      {canManage && (
        <ActionBar>
          <ActionButton onClick={() => setShowEdit(true)} loading={false} icon={Pencil} label="Edit" variant="secondary" />
          {hazard.status === "IDENTIFIED" && (
            <ActionButton onClick={() => setShowMitigate(true)} loading={false} icon={Play} label="Start Mitigation" variant="primary" />
          )}
          {(hazard.status === "IDENTIFIED" || hazard.status === "MITIGATING") && (
            <ActionButton onClick={() => setShowResolve(true)} loading={false} icon={Check} label="Resolve" variant="go" />
          )}
          {hazard.status !== "RESOLVED" && (
            <ActionButton onClick={async () => { const ok = await confirm({ title: "Delete?", description: "Delete this hazard?", confirmLabel: "Delete", variant: "destructive" }); if (!ok) return; await doAction("delete"); router.push("/m/safety"); }} loading={acting === "delete"} icon={Trash2} label="Delete" variant="danger" />
          )}
        </ActionBar>
      )}

      {/* Mitigate dialog */}
      {showMitigate && (
        <BottomSheet title="Start Mitigation" onClose={() => setShowMitigate(false)}>
          <div className="space-y-3">
            <div>
              <label className="text-m-label font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Mitigation Plan (optional)</label>
              <textarea value={mitigationPlan} onChange={(e) => setMitigationPlan(e.target.value)} rows={3} placeholder="How will the hazard be controlled?" className="w-full rounded-[0.5rem] border px-3 py-2 text-m-section" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }} />
            </div>
            <button onClick={() => doAction("mitigate", mitigationPlan ? { mitigationPlan } : {})} disabled={acting === "mitigate"} className="w-full h-11 rounded-[0.5rem] text-m-section font-bold flex items-center justify-center gap-1.5 text-m-body press" style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}>
              {acting === "mitigate" ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />} Start Mitigation
            </button>
          </div>
        </BottomSheet>
      )}

      {/* Resolve dialog */}
      {showResolve && (
        <BottomSheet title="Resolve Hazard" onClose={() => setShowResolve(false)}>
          <div className="space-y-3">
            <div>
              <label className="text-m-label font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Resolution Notes</label>
              <textarea value={resolutionNotes} onChange={(e) => setResolutionNotes(e.target.value)} rows={3} placeholder="How was the hazard eliminated/controlled?" className="w-full rounded-[0.5rem] border px-3 py-2 text-m-section" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }} />
            </div>
            <button onClick={() => { if (!resolutionNotes.trim()) { toast.error("Resolution notes required"); return; } doAction("resolve", { resolutionNotes }); }} disabled={acting === "resolve"} className="w-full h-11 rounded-[0.5rem] text-m-section font-bold flex items-center justify-center gap-1.5 text-m-body press" style={{ backgroundColor: "var(--color-go)", color: "var(--color-ink-950)" }}>
              {acting === "resolve" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Confirm Resolution
            </button>
          </div>
        </BottomSheet>
      )}
      {/* Edit dialog */}
      {showEdit && (
        <BottomSheet title="Edit Hazard" onClose={() => setShowEdit(false)}>
          <div className="space-y-3">
            <div>
              <label className="text-m-label font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Title</label>
              <input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} className="w-full rounded-[0.5rem] border px-3 py-2 text-m-section" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }} />
            </div>
            <div>
              <label className="text-m-label font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Description</label>
              <textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} rows={3} className="w-full rounded-[0.5rem] border px-3 py-2 text-m-section" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-m-label font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Likelihood (1-5)</label>
                <input type="number" min={1} max={5} value={editForm.likelihood} onChange={(e) => setEditForm({ ...editForm, likelihood: e.target.value })} className="w-full rounded-[0.5rem] border px-3 py-2 text-m-section tabular-nums" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }} />
              </div>
              <div>
                <label className="text-m-label font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Severity (1-5)</label>
                <input type="number" min={1} max={5} value={editForm.severity} onChange={(e) => setEditForm({ ...editForm, severity: e.target.value })} className="w-full rounded-[0.5rem] border px-3 py-2 text-m-section tabular-nums" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }} />
              </div>
            </div>
            <div>
              <label className="text-m-label font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Location</label>
              <input value={editForm.location} onChange={(e) => setEditForm({ ...editForm, location: e.target.value })} placeholder="Where on site?" className="w-full rounded-[0.5rem] border px-3 py-2 text-m-section" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }} />
            </div>
            <div>
              <label className="text-m-label font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Mitigation Plan</label>
              <textarea value={editForm.mitigationPlan} onChange={(e) => setEditForm({ ...editForm, mitigationPlan: e.target.value })} rows={2} placeholder="How will the hazard be controlled?" className="w-full rounded-[0.5rem] border px-3 py-2 text-m-section" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }} />
            </div>
            <div>
              <label className="text-m-label font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Target Resolution Date</label>
              <input type="date" value={editForm.targetResolutionDate} onChange={(e) => setEditForm({ ...editForm, targetResolutionDate: e.target.value })} className="w-full rounded-[0.5rem] border px-3 py-2 text-m-section tabular-nums" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }} />
            </div>
            <button onClick={saveEdit} disabled={acting === "edit"} className="w-full h-11 rounded-[0.5rem] text-m-section font-bold flex items-center justify-center gap-1.5 text-m-body press" style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}>
              {acting === "edit" ? <Loader2 className="size-4 animate-spin" /> : <Pencil className="size-4" />} Save Changes
            </button>
          </div>
        </BottomSheet>
      )}
      {confirmDialog}
    </div>
  );
}

function DetailCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[0.5rem] border p-2.5" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
      <p className="text-m-caption font-semibold uppercase mb-0.5" style={{ color: "var(--color-ink-500)" }}>{label}</p>
      <p className="text-m-label font-bold" style={{ color: "var(--color-ink-950)" }}>{value}</p>
    </div>
  );
}

function TimelineRow({ label, date, name }: { label: string; date: string; name?: string | null }) {
  return (
    <div className="flex items-center justify-between">
      <div><p className="text-m-label font-semibold" style={{ color: "var(--color-ink-950)" }}>{label}</p>{name && <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>by {name}</p>}</div>
      <p className="text-m-label tabular-nums" style={{ color: "var(--color-ink-500)" }}>{formatDate(date)}</p>
    </div>
  );
}

function ActionButton({ onClick, loading, icon: Icon, label, variant }: { onClick: () => void; loading: boolean; icon: React.ComponentType<{ className?: string }>; label: string; variant: "primary" | "go" | "danger" | "secondary" }) {
  const styles: Record<string, React.CSSProperties> = {
    primary: { backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)", borderColor: "var(--color-ink-950)" },
    go: { backgroundColor: "var(--color-go)", color: "var(--color-ink-950)", borderColor: "var(--color-go-active)" },
    danger: { backgroundColor: "var(--color-stop)", color: "#fff", borderColor: "var(--color-stop-active)" },
    secondary: { backgroundColor: "var(--color-paper)", color: "var(--color-ink-700)", borderColor: "var(--color-line)" },
  };
  return (
    <button onClick={onClick} disabled={loading} className="w-full h-11 rounded-[0.5rem] border text-m-body font-bold flex items-center justify-center gap-1.5 text-m-body press" style={styles[variant]}>
      {loading ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}{label}
    </button>
  );
}

function BottomSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: "rgba(18, 17, 13, 0.4)" }}>
      <div className="mt-auto rounded-t-[1rem] max-h-[70vh] overflow-y-auto" style={{ backgroundColor: "var(--color-paper)", animation: "slideUp 0.25s ease-out" }}>
        <div className="sticky top-0 flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
          <h2 className="text-m-section font-bold" style={{ color: "var(--color-ink-950)" }}>{title}</h2>
          <button onClick={onClose} className="text-m-body press"><X className="size-4" style={{ color: "var(--color-ink-500)" }} /></button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
