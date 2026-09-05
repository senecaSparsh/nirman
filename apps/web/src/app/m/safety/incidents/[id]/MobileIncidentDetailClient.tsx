"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import {Loader2, Send, Check, Ban, Trash2, X, Pencil} from "lucide-react";
import { haptic } from "@/lib/haptic";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useConfirm } from "@/lib/use-confirm";
import { ActionBar, MobileStatusBadge } from "@/components/mobile/v2/primitives";

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

const TYPE_OPTIONS = [
  { value: "ACCIDENT", label: "Accident" }, { value: "NEAR_MISS", label: "Near Miss" }, { value: "INJURY", label: "Injury" },
  { value: "FATALITY", label: "Fatality" }, { value: "PROPERTY_DAMAGE", label: "Property Damage" }, { value: "ENVIRONMENTAL", label: "Environmental" },
  { value: "FIRE", label: "Fire" }, { value: "STRUCTURAL", label: "Structural" }, { value: "OTHER", label: "Other" },
];

const SEVERITY_OPTIONS = [
  { value: "FIRST_AID", label: "First Aid" }, { value: "LOST_TIME", label: "Lost Time" }, { value: "SERIOUS", label: "Serious" },
  { value: "FATAL", label: "Fatal" }, { value: "PROPERTY_ONLY", label: "Property Only" },
];

const SEVERITY_COLORS: Record<string, string> = {
  FIRST_AID: "var(--color-ink-500)", LOST_TIME: "var(--color-signal)",
  SERIOUS: "var(--color-stop)", FATAL: "var(--color-stop)", PROPERTY_ONLY: "var(--color-ink-500)",
};

export function MobileIncidentDetailClient({ incident, canManage }: { incident: IncidentDetail; canManage: boolean }) {
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const [acting, setActing] = useState<string | null>(null);
  const [showInvestigate, setShowInvestigate] = useState(false);
  const [investigateForm, setInvestigateForm] = useState({ rootCause: "", correctiveActions: "" });
  const [showClose, setShowClose] = useState(false);
  const [closureNotes, setClosureNotes] = useState("");
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    title: incident.title, description: incident.description, type: incident.type, severity: incident.severity,
    incidentDate: incident.incidentDate.slice(0, 10), incidentTime: incident.incidentTime ?? "", location: incident.location ?? "",
    peopleInvolved: incident.peopleInvolved ?? "", injuredCount: String(incident.injuredCount), fatalities: String(incident.fatalities),
    propertyDamageEstimate: String(incident.propertyDamageEstimate),
  });

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

  async function saveEdit() {
    setActing("edit"); haptic(20);
    try {
      const res = await fetch(`/api/safety/incidents/${incident.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editForm.title, description: editForm.description, type: editForm.type, severity: editForm.severity,
          incidentDate: editForm.incidentDate, incidentTime: editForm.incidentTime || null, location: editForm.location || null,
          peopleInvolved: editForm.peopleInvolved || null, injuredCount: Number(editForm.injuredCount) || 0,
          fatalities: Number(editForm.fatalities) || 0, propertyDamageEstimate: editForm.propertyDamageEstimate ? Number(editForm.propertyDamageEstimate) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success("Incident updated"); router.refresh();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setActing(null); setShowEdit(false); }
  }

  const sevColor = SEVERITY_COLORS[incident.severity] ?? "var(--color-ink-500)";

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div className="rounded-[0.5rem] border p-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-m-label font-bold tabular-nums" style={{ color: "var(--color-ink-500)" }}>{incident.incidentNumber}</p>
          <MobileStatusBadge status={incident.status} />
        </div>
        <h1 className="text-m-section font-bold leading-tight mb-1" style={{ color: "var(--color-ink-950)" }}>{incident.title}</h1>
        <p className="text-m-label" style={{ color: sevColor, fontWeight: 600 }}>
          {incident.severity.replace("_", " ")} · {TYPE_LABELS[incident.type] ?? incident.type}
        </p>
        <p className="text-m-label mt-1" style={{ color: "var(--color-ink-500)" }}>{incident.projectName}</p>
      </div>

      {/* Description */}
      <div className="rounded-[0.5rem] border p-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
        <p className="text-m-label font-semibold uppercase mb-1" style={{ color: "var(--color-ink-500)" }}>Description</p>
        <p className="text-m-section leading-relaxed" style={{ color: "var(--color-ink-950)" }}>{incident.description}</p>
        {incident.attachments.length > 0 && (
          <div className="mt-2">
            <p className="text-m-caption font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--color-steel)" }}>
              Photo Evidence ({incident.attachments.length})
            </p>
            <div className="grid grid-cols-2 gap-2">
              {incident.attachments.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="relative block overflow-hidden rounded-[0.375rem] border aspect-video" style={{ borderColor: "var(--color-line)" }}>
                  <Image src={url} alt={`Evidence ${i + 1}`} fill className="object-cover" sizes="(max-width: 768px) 100vw, 400px" />
                </a>
              ))}
            </div>
          </div>
        )}
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
          <p className="text-m-label font-semibold uppercase mb-1" style={{ color: "var(--color-ink-500)" }}>Root Cause</p>
          <p className="text-m-section" style={{ color: "var(--color-ink-950)" }}>{incident.rootCause}</p>
          <p className="text-m-label font-semibold uppercase mt-2 mb-1" style={{ color: "var(--color-ink-500)" }}>Corrective Actions</p>
          <p className="text-m-section" style={{ color: "var(--color-ink-950)" }}>{incident.correctiveActions}</p>
        </div>
      )}

      {/* Timeline */}
      <div className="rounded-[0.5rem] border p-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
        <p className="text-m-label font-semibold uppercase mb-2" style={{ color: "var(--color-ink-500)" }}>Timeline</p>
        <div className="space-y-1.5">
          <TimelineRow label="Reported" date={incident.reportedAt} name={incident.reportedByName} />
          {incident.investigatedAt && <TimelineRow label="Investigated" date={incident.investigatedAt} name={incident.investigatedByName} />}
          {incident.closedAt && <TimelineRow label="Closed" date={incident.closedAt} name={incident.closedByName} />}
        </div>
        {incident.closureNotes && (
          <div className="mt-2 rounded-[0.375rem] p-2" style={{ backgroundColor: "var(--color-concrete)" }}>
            <p className="text-m-caption font-bold uppercase" style={{ color: "var(--color-ink-500)" }}>Closure Notes</p>
            <p className="text-m-label" style={{ color: "var(--color-ink-950)" }}>{incident.closureNotes}</p>
          </div>
        )}
      </div>

      {/* Actions */}
      {canManage && (
        <ActionBar>
          <ActionButton onClick={() => setShowEdit(true)} loading={false} icon={Pencil} label="Edit" variant="secondary" />
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
            <ActionButton onClick={async () => { const ok = await confirm({ title: "Delete?", description: "Delete this incident?", confirmLabel: "Delete", variant: "destructive" }); if (!ok) return; await doAction("delete"); router.push("/m/safety"); }} loading={acting === "delete"} icon={Trash2} label="Delete" variant="danger" />
          )}
        </ActionBar>
      )}

      {/* Investigate dialog */}
      {showInvestigate && (
        <BottomSheet title="Investigate Incident" onClose={() => setShowInvestigate(false)}>
          <div className="flex flex-col gap-3">
            <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
              <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
                Investigation
              </p>
              <div>
                <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>Root Cause</label>
                <textarea value={investigateForm.rootCause} onChange={(e) => setInvestigateForm((f) => ({ ...f, rootCause: e.target.value }))} rows={2} placeholder="Why did the incident happen?" className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors resize-none" style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }} />
              </div>
              <div>
                <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>Corrective Actions</label>
                <textarea value={investigateForm.correctiveActions} onChange={(e) => setInvestigateForm((f) => ({ ...f, correctiveActions: e.target.value }))} rows={2} placeholder="What will prevent recurrence?" className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors resize-none" style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }} />
              </div>
            </div>
            <button onClick={() => { if (!investigateForm.rootCause.trim() || !investigateForm.correctiveActions.trim()) { toast.error("Both fields are required"); return; } doAction("investigate", investigateForm); }} disabled={acting === "investigate"} className="w-full h-11 rounded-[0.5rem] text-m-section font-bold flex items-center justify-center gap-1.5 text-m-body press" style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}>
              {acting === "investigate" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Submit Investigation
            </button>
          </div>
        </BottomSheet>
      )}

      {/* Close dialog */}
      {showClose && (
        <BottomSheet title="Close Incident" onClose={() => setShowClose(false)}>
          <div className="flex flex-col gap-3">
            <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
              <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
                Closure
              </p>
              <div>
                <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>Closure Notes</label>
                <textarea value={closureNotes} onChange={(e) => setClosureNotes(e.target.value)} rows={2} placeholder="How was the incident resolved?" className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors resize-none" style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }} />
              </div>
            </div>
            <button onClick={() => { if (!closureNotes.trim()) { toast.error("Closure notes required"); return; } doAction("close", { closureNotes }); }} disabled={acting === "close"} className="w-full h-11 rounded-[0.5rem] text-m-section font-bold flex items-center justify-center gap-1.5 text-m-body press" style={{ backgroundColor: "var(--color-go)", color: "var(--color-ink-950)" }}>
              {acting === "close" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Confirm Closure
            </button>
          </div>
        </BottomSheet>
      )}
      {/* Edit dialog */}
      {showEdit && (
        <BottomSheet title="Edit Incident" onClose={() => setShowEdit(false)}>
          <div className="flex flex-col gap-3">
            <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
              <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
                Incident Details
              </p>
              <div>
                <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>Title</label>
                <input value={editForm.title} onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))} className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors" style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }} />
              </div>
              <div>
                <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>Description</label>
                <textarea value={editForm.description} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))} rows={2} className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors resize-none" style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }} />
              </div>
              <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
                <div>
                  <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>Type</label>
                  <select value={editForm.type} onChange={(e) => setEditForm((f) => ({ ...f, type: e.target.value }))} className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors" style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}>
                    {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="pl-2">
                  <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>Severity</label>
                  <select value={editForm.severity} onChange={(e) => setEditForm((f) => ({ ...f, severity: e.target.value }))} className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors" style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }}>
                    {SEVERITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 divide-x" style={{ borderColor: "var(--color-line)" }}>
                <div>
                  <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>Date</label>
                  <input type="date" value={editForm.incidentDate} onChange={(e) => setEditForm((f) => ({ ...f, incidentDate: e.target.value }))} className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors" style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }} />
                </div>
                <div className="pl-2">
                  <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>Time</label>
                  <input type="time" value={editForm.incidentTime} onChange={(e) => setEditForm((f) => ({ ...f, incidentTime: e.target.value }))} className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors" style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }} />
                </div>
              </div>
            </div>
            <div className="rounded-[0.625rem] border p-3 flex flex-col gap-3" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
              <p className="text-m-section font-extrabold tracking-tight" style={{ color: "var(--color-ink-950)" }}>
                People & Damage
              </p>
              <div>
                <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>Location</label>
                <input value={editForm.location} onChange={(e) => setEditForm((f) => ({ ...f, location: e.target.value }))} placeholder="Where did it happen?" className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors" style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }} />
              </div>
              <div>
                <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>People Involved</label>
                <input value={editForm.peopleInvolved} onChange={(e) => setEditForm((f) => ({ ...f, peopleInvolved: e.target.value }))} placeholder="Names of people involved" className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors" style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>Injured</label>
                  <input type="number" min={0} value={editForm.injuredCount} onChange={(e) => setEditForm((f) => ({ ...f, injuredCount: e.target.value }))} className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors" style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }} />
                </div>
                <div>
                  <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>Fatalities</label>
                  <input type="number" min={0} value={editForm.fatalities} onChange={(e) => setEditForm((f) => ({ ...f, fatalities: e.target.value }))} className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors" style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }} />
                </div>
                <div>
                  <label className="block text-m-caption font-bold mb-0" style={{ color: "var(--color-ink-700)" }}>Damage ₹</label>
                  <input type="number" min={0} value={editForm.propertyDamageEstimate} onChange={(e) => setEditForm((f) => ({ ...f, propertyDamageEstimate: e.target.value }))} className="w-full h-7 px-1 text-m-caption outline-none border-b focus:border-b-2 transition-colors" style={{ borderColor: "var(--color-line)", backgroundColor: "transparent", color: "var(--color-ink-950)" }} />
                </div>
              </div>
            </div>
            <button onClick={() => { if (!editForm.title.trim() || !editForm.description.trim()) { toast.error("Title and description are required"); return; } saveEdit(); }} disabled={acting === "edit"} className="w-full h-11 rounded-[0.5rem] text-m-section font-bold flex items-center justify-center gap-1.5 text-m-body press" style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}>
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
    danger: { backgroundColor: "var(--color-stop)", color: "var(--color-paper)", borderColor: "var(--color-stop-active)" },
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
    <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-950) 40%, transparent)" }}>
      <div className="mt-auto rounded-t-[1rem] max-h-[80vh] overflow-y-auto" style={{ backgroundColor: "var(--color-paper)", animation: "slideUp 0.25s ease-out" }}>
        <div className="sticky top-0 flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
          <h2 className="text-m-section font-bold" style={{ color: "var(--color-ink-950)" }}>{title}</h2>
          <button onClick={onClose} className="text-m-body press"><X className="size-4" style={{ color: "var(--color-ink-500)" }} /></button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
