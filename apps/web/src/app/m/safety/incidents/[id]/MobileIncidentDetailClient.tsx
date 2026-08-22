"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Send, Check, Ban, Trash2, AlertTriangle, X } from "lucide-react";
import { haptic } from "@/lib/haptic";
import { formatCurrency, formatDate } from "@/lib/utils";
import { MobileStatusBadge } from "@/components/mobile/v2/primitives";

interface IncidentDetail {
  id: string; incidentNumber: string; title: string; description: string;
  type: string; severity: string; status: string;
  projectName: string; location: string | null; wbsNodeName: string | null;
  peopleInvolved: string | null; injuredCount: number; fatalities: number;
  propertyDamageEstimate: number; incidentDate: string; incidentTime: string | null;
  rootCause: string | null; correctiveActions: string | null; closureNotes: string | null;
  attachments: string[];
  reportedAt: string; reportedByName: string | null;
  investigatedAt: string | null; investigatedByName: string | null;
  closedAt: string | null; closedByName: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  ACCIDENT: "Accident", NEAR_MISS: "Near Miss", INJURY: "Injury", FATALITY: "Fatality",
  PROPERTY_DAMAGE: "Property Damage", ENVIRONMENTAL: "Environmental", FIRE: "Fire",
  STRUCTURAL: "Structural", OTHER: "Other",
};

const SEVERITY_COLORS: Record<string, string> = {
  FIRST_AID: "var(--color-ink-500)", LOST_TIME: "var(--color-signal)",
  SERIOUS: "var(--color-stop)", FATAL: "var(--color-stop)", PROPERTY_ONLY: "var(--color-ink-500)",
};

export function MobileIncidentDetailClient({ incident, canManage }: { incident: IncidentDetail; canManage: boolean }) {
  const router = useRouter();
  const [acting, setActing] = useState<string | null>(null);
  const [showInvestigate, setShowInvestigate] = useState(false);
  const [investigateForm, setInvestigateForm] = useState({ rootCause: "", correctiveActions: "" });
  const [showClose, setShowClose] = useState(false);
  const [closureNotes, setClosureNotes] = useState("");

  async function doAction(action: string, extra?: Record<string, unknown>) {
    setActing(action); haptic(20);
    try {
      const res = await fetch(`/api/safety/incidents/${incident.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success(`Incident ${action}ed`); router.refresh();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setActing(null); setShowInvestigate(false); setShowClose(false); setInvestigateForm({ rootCause: "", correctiveActions: "" }); setClosureNotes(""); }
  }

  const sevColor = SEVERITY_COLORS[incident.severity] ?? "var(--color-ink-500)";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-[0.5rem] border p-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[0.625rem] font-bold tabular-nums" style={{ color: "var(--color-ink-500)" }}>{incident.incidentNumber}</p>
          <MobileStatusBadge status={incident.status} />
        </div>
        <h1 className="text-[0.875rem] font-bold leading-tight mb-1" style={{ color: "var(--color-ink-950)" }}>{incident.title}</h1>
        <p className="text-[0.625rem]" style={{ color: sevColor, fontWeight: 600 }}>
          {incident.severity.replace("_", " ")} · {TYPE_LABELS[incident.type] ?? incident.type}
        </p>
        <p className="text-[0.625rem] mt-1" style={{ color: "var(--color-ink-500)" }}>{incident.projectName}</p>
      </div>

      {/* Description */}
      <div className="rounded-[0.5rem] border p-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
        <p className="text-[0.625rem] font-semibold uppercase mb-1" style={{ color: "var(--color-ink-500)" }}>Description</p>
        <p className="text-[0.75rem] leading-relaxed" style={{ color: "var(--color-ink-950)" }}>{incident.description}</p>
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-2 gap-2">
        <DetailCard label="Date" value={formatDate(incident.incidentDate)} />
        {incident.incidentTime && <DetailCard label="Time" value={incident.incidentTime} />}
        {incident.location && <DetailCard label="Location" value={incident.location} />}
        {incident.peopleInvolved && <DetailCard label="People" value={incident.peopleInvolved} />}
        {incident.injuredCount > 0 && <DetailCard label="Injured" value={String(incident.injuredCount)} />}
        {incident.fatalities > 0 && <DetailCard label="Fatalities" value={String(incident.fatalities)} />}
        {incident.propertyDamageEstimate > 0 && <DetailCard label="Damage Est." value={formatCurrency(incident.propertyDamageEstimate)} />}
        {incident.wbsNodeName && <DetailCard label="WBS Node" value={incident.wbsNodeName} />}
      </div>

      {/* Investigation */}
      {incident.rootCause && (
        <div className="rounded-[0.5rem] border p-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
          <p className="text-[0.625rem] font-semibold uppercase mb-1" style={{ color: "var(--color-ink-500)" }}>Root Cause</p>
          <p className="text-[0.75rem]" style={{ color: "var(--color-ink-950)" }}>{incident.rootCause}</p>
          <p className="text-[0.625rem] font-semibold uppercase mt-2 mb-1" style={{ color: "var(--color-ink-500)" }}>Corrective Actions</p>
          <p className="text-[0.75rem]" style={{ color: "var(--color-ink-950)" }}>{incident.correctiveActions}</p>
        </div>
      )}

      {/* Timeline */}
      <div className="rounded-[0.5rem] border p-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
        <p className="text-[0.625rem] font-semibold uppercase mb-2" style={{ color: "var(--color-ink-500)" }}>Timeline</p>
        <div className="space-y-1.5">
          <TimelineRow label="Reported" date={incident.reportedAt} name={incident.reportedByName} />
          {incident.investigatedAt && <TimelineRow label="Investigated" date={incident.investigatedAt} name={incident.investigatedByName} />}
          {incident.closedAt && <TimelineRow label="Closed" date={incident.closedAt} name={incident.closedByName} />}
        </div>
        {incident.closureNotes && (
          <div className="mt-2 rounded-[0.375rem] p-2" style={{ backgroundColor: "var(--color-concrete)" }}>
            <p className="text-[0.5rem] font-bold uppercase" style={{ color: "var(--color-ink-500)" }}>Closure Notes</p>
            <p className="text-[0.625rem]" style={{ color: "var(--color-ink-950)" }}>{incident.closureNotes}</p>
          </div>
        )}
      </div>

      {/* Actions */}
      {canManage && (
        <div className="flex flex-wrap gap-2">
          {(incident.status === "REPORTED" || incident.status === "UNDER_INVESTIGATION") && (
            <ActionButton onClick={() => setShowInvestigate(true)} loading={false} icon={Send} label="Investigate" variant="primary" />
          )}
          {incident.status === "INVESTIGATED" && (
            <ActionButton onClick={() => setShowClose(true)} loading={false} icon={Check} label="Close" variant="go" />
          )}
          {incident.status === "REPORTED" && (
            <ActionButton onClick={() => doAction("cancel")} loading={acting === "cancel"} icon={Ban} label="Cancel" variant="secondary" />
          )}
          {(incident.status === "REPORTED" || incident.status === "CANCELLED") && (
            <ActionButton onClick={async () => { if (!confirm("Delete this incident?")) return; await doAction("delete"); router.push("/m/safety"); }} loading={acting === "delete"} icon={Trash2} label="Delete" variant="danger" />
          )}
        </div>
      )}

      {/* Investigate dialog */}
      {showInvestigate && (
        <BottomSheet title="Investigate Incident" onClose={() => setShowInvestigate(false)}>
          <div className="space-y-3">
            <div>
              <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Root Cause</label>
              <textarea value={investigateForm.rootCause} onChange={(e) => setInvestigateForm((f) => ({ ...f, rootCause: e.target.value }))} rows={3} placeholder="Why did the incident happen?" className="w-full rounded-[0.5rem] border px-3 py-2 text-[0.75rem]" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }} />
            </div>
            <div>
              <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Corrective Actions</label>
              <textarea value={investigateForm.correctiveActions} onChange={(e) => setInvestigateForm((f) => ({ ...f, correctiveActions: e.target.value }))} rows={3} placeholder="What will prevent recurrence?" className="w-full rounded-[0.5rem] border px-3 py-2 text-[0.75rem]" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }} />
            </div>
            <button onClick={() => { if (!investigateForm.rootCause.trim() || !investigateForm.correctiveActions.trim()) { toast.error("Both fields are required"); return; } doAction("investigate", investigateForm); }} disabled={acting === "investigate"} className="w-full h-11 rounded-[0.5rem] text-[0.75rem] font-bold flex items-center justify-center gap-1.5 press" style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}>
              {acting === "investigate" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Submit Investigation
            </button>
          </div>
        </BottomSheet>
      )}

      {/* Close dialog */}
      {showClose && (
        <BottomSheet title="Close Incident" onClose={() => setShowClose(false)}>
          <div className="space-y-3">
            <div>
              <label className="text-[0.625rem] font-semibold uppercase mb-1 block" style={{ color: "var(--color-ink-500)" }}>Closure Notes</label>
              <textarea value={closureNotes} onChange={(e) => setClosureNotes(e.target.value)} rows={3} placeholder="How was the incident resolved?" className="w-full rounded-[0.5rem] border px-3 py-2 text-[0.75rem]" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }} />
            </div>
            <button onClick={() => { if (!closureNotes.trim()) { toast.error("Closure notes required"); return; } doAction("close", { closureNotes }); }} disabled={acting === "close"} className="w-full h-11 rounded-[0.5rem] text-[0.75rem] font-bold flex items-center justify-center gap-1.5 press" style={{ backgroundColor: "var(--color-go)", color: "var(--color-ink-950)" }}>
              {acting === "close" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Confirm Closure
            </button>
          </div>
        </BottomSheet>
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
      <div><p className="text-[0.625rem] font-semibold" style={{ color: "var(--color-ink-950)" }}>{label}</p>{name && <p className="text-[0.5rem]" style={{ color: "var(--color-ink-500)" }}>by {name}</p>}</div>
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
    <button onClick={onClick} disabled={loading} className="flex-1 min-w-[120px] h-11 rounded-[0.5rem] border text-[0.6875rem] font-bold flex items-center justify-center gap-1.5 press" style={styles[variant]}>
      {loading ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}{label}
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
