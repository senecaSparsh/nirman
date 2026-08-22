"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/field";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { AlertTriangle, ShieldAlert, ClipboardCheck, Plus, Search, Loader2 } from "lucide-react";
import { computeRiskLevel } from "@nirman/services";

type Tab = "incidents" | "hazards" | "inspections";

interface IncidentItem {
  id: string; incidentNumber: string; title: string; type: string; severity: string; status: string;
  projectName: string; location: string | null; injuredCount: number; fatalities: number; incidentDate: string;
}
interface HazardItem {
  id: string; hazardNumber: string; title: string; status: string; riskLevel: string;
  likelihood: number; severity: number; projectName: string; location: string | null;
  targetResolutionDate: string | null; createdAt: string;
}
interface InspectionItem {
  id: string; inspectionNumber: string; title: string; status: string; result: string | null;
  projectName: string; scheduledDate: string; conductedDate: string | null; inspectorName: string | null;
}
type Project = { id: string; name: string; type: string; status: string };

const TABS: { value: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "incidents", label: "Incidents", icon: AlertTriangle },
  { value: "hazards", label: "Hazards", icon: ShieldAlert },
  { value: "inspections", label: "Inspections", icon: ClipboardCheck },
];

const INCIDENT_STATUS_VARIANTS: Record<string, "default" | "warning" | "success" | "danger"> = {
  REPORTED: "warning", UNDER_INVESTIGATION: "warning", INVESTIGATED: "default", CLOSED: "success", CANCELLED: "default",
};
const HAZARD_STATUS_VARIANTS: Record<string, "default" | "warning" | "success" | "danger"> = {
  IDENTIFIED: "warning", MITIGATING: "warning", RESOLVED: "success",
};
const INSPECTION_STATUS_VARIANTS: Record<string, "default" | "warning" | "success" | "danger"> = {
  SCHEDULED: "default", IN_PROGRESS: "warning", COMPLETED: "success", CANCELLED: "default",
};
const RISK_VARIANTS: Record<string, "default" | "warning" | "danger" | "success"> = {
  LOW: "success", MEDIUM: "warning", HIGH: "danger", CRITICAL: "danger",
};
const SEVERITY_VARIANTS: Record<string, "default" | "warning" | "danger"> = {
  FIRST_AID: "default", LOST_TIME: "warning", SERIOUS: "danger", FATAL: "danger", PROPERTY_ONLY: "default",
};
const RESULT_VARIANTS: Record<string, "default" | "warning" | "success" | "danger"> = {
  PASSED: "success", PASSED_WITH_NOTES: "warning", FAILED: "danger", STOP_WORK: "danger",
};

const TYPE_LABELS: Record<string, string> = {
  ACCIDENT: "Accident", NEAR_MISS: "Near Miss", INJURY: "Injury", FATALITY: "Fatality",
  PROPERTY_DAMAGE: "Property Damage", ENVIRONMENTAL: "Environmental", FIRE: "Fire",
  STRUCTURAL: "Structural", OTHER: "Other",
};

export function SafetyView({
  incidents, hazards, inspections, projects, canManage,
}: {
  incidents: IncidentItem[];
  hazards: HazardItem[];
  inspections: InspectionItem[];
  projects: Project[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("incidents");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [dialogOpen, setDialogOpen] = useState(false);

  const filteredIncidents = useMemo(() => {
    let r = incidents;
    if (statusFilter !== "ALL") r = r.filter((i) => i.status === statusFilter);
    if (query.trim()) {
      const q = query.toLowerCase();
      r = r.filter((i) => i.title.toLowerCase().includes(q) || i.incidentNumber.toLowerCase().includes(q) || i.projectName.toLowerCase().includes(q));
    }
    return r;
  }, [incidents, query, statusFilter]);

  const filteredHazards = useMemo(() => {
    let r = hazards;
    if (statusFilter !== "ALL") r = r.filter((h) => h.status === statusFilter);
    if (query.trim()) {
      const q = query.toLowerCase();
      r = r.filter((h) => h.title.toLowerCase().includes(q) || h.hazardNumber.toLowerCase().includes(q) || h.projectName.toLowerCase().includes(q));
    }
    return r;
  }, [hazards, query, statusFilter]);

  const filteredInspections = useMemo(() => {
    let r = inspections;
    if (statusFilter !== "ALL") r = r.filter((i) => i.status === statusFilter);
    if (query.trim()) {
      const q = query.toLowerCase();
      r = r.filter((i) => i.title.toLowerCase().includes(q) || i.inspectionNumber.toLowerCase().includes(q) || i.projectName.toLowerCase().includes(q));
    }
    return r;
  }, [inspections, query, statusFilter]);

  function switchTab(t: Tab) {
    setTab(t); setQuery(""); setStatusFilter("ALL"); setDialogOpen(false);
  }

  const statusOptions = tab === "incidents"
    ? [["REPORTED", "Reported"], ["UNDER_INVESTIGATION", "Investigating"], ["INVESTIGATED", "Investigated"], ["CLOSED", "Closed"], ["CANCELLED", "Cancelled"]]
    : tab === "hazards"
    ? [["IDENTIFIED", "Identified"], ["MITIGATING", "Mitigating"], ["RESOLVED", "Resolved"]]
    : [["SCHEDULED", "Scheduled"], ["IN_PROGRESS", "In Progress"], ["COMPLETED", "Completed"], ["CANCELLED", "Cancelled"]];

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => {
          const active = tab === t.value;
          const Icon = t.icon;
          const count = t.value === "incidents" ? incidents.length : t.value === "hazards" ? hazards.length : inspections.length;
          return (
            <button key={t.value} onClick={() => switchTab(t.value)} className={cn("flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors", active ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
              <Icon className="h-4 w-4" />{t.label}
              <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-xs tabular-nums">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${tab}…`} className="pl-8" />
        </div>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-[150px]">
          <option value="ALL">All Status</option>
          {statusOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
        {canManage && projects.length > 0 && (
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            {tab === "incidents" ? "Report Incident" : tab === "hazards" ? "Report Hazard" : "Schedule Inspection"}
          </Button>
        )}
      </div>

      {/* Tables */}
      {tab === "incidents" && (
        <IncidentTable items={filteredIncidents} totalCount={incidents.length} onRowClick={(id) => router.push(`/safety/incidents/${id}`)} />
      )}
      {tab === "hazards" && (
        <HazardTable items={filteredHazards} totalCount={hazards.length} onRowClick={(id) => router.push(`/safety/hazards/${id}`)} />
      )}
      {tab === "inspections" && (
        <InspectionTable items={filteredInspections} totalCount={inspections.length} onRowClick={(id) => router.push(`/safety/inspections/${id}`)} />
      )}

      {/* Dialogs */}
      {dialogOpen && tab === "incidents" && <NewIncidentDialog open={dialogOpen} onOpenChange={setDialogOpen} projects={projects} onSaved={() => { setDialogOpen(false); router.refresh(); }} />}
      {dialogOpen && tab === "hazards" && <NewHazardDialog open={dialogOpen} onOpenChange={setDialogOpen} projects={projects} onSaved={() => { setDialogOpen(false); router.refresh(); }} />}
      {dialogOpen && tab === "inspections" && <NewInspectionDialog open={dialogOpen} onOpenChange={setDialogOpen} projects={projects} onSaved={() => { setDialogOpen(false); router.refresh(); }} />}
    </div>
  );
}

function IncidentTable({ items, totalCount, onRowClick }: { items: IncidentItem[]; totalCount: number; onRowClick: (id: string) => void }) {
  if (items.length === 0) {
    return <EmptyState icon={AlertTriangle} message={totalCount === 0 ? "No incidents reported yet. Report accidents, near-misses, and injuries here." : "No incidents match your filters."} />;
  }
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="grid grid-cols-[130px_1fr_140px_120px_120px_120px_100px] gap-2 border-b border-border bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
        <div>Number</div><div>Title</div><div>Project</div><div>Type</div><div>Severity</div><div>Status</div><div className="text-right">Date</div>
      </div>
      {items.map((i) => (
        <button key={i.id} onClick={() => onRowClick(i.id)} className="grid w-full grid-cols-[130px_1fr_140px_120px_120px_120px_100px] gap-2 border-b border-border/50 px-3 py-2 text-sm text-left hover:bg-muted/30 transition-colors">
          <div className="font-mono text-xs text-muted-foreground self-center">{i.incidentNumber}</div>
          <div className="min-w-0 self-center">
            <div className="truncate font-medium">{i.title}</div>
            <div className="truncate text-xs text-muted-foreground">{i.location ? `${i.location} · ` : ""}{i.injuredCount > 0 ? `${i.injuredCount} injured` : ""}{i.fatalities > 0 ? ` · ${i.fatalities} fatal` : ""}</div>
          </div>
          <div className="text-xs text-muted-foreground self-center truncate">{i.projectName}</div>
          <div className="text-xs self-center">{TYPE_LABELS[i.type] ?? i.type}</div>
          <div className="self-center"><Badge variant={SEVERITY_VARIANTS[i.severity] ?? "default"}>{i.severity.replace("_", " ")}</Badge></div>
          <div className="self-center"><Badge variant={INCIDENT_STATUS_VARIANTS[i.status] ?? "default"}>{i.status.replace(/_/g, " ")}</Badge></div>
          <div className="text-right text-xs text-muted-foreground self-center tabular-nums">{formatDate(i.incidentDate)}</div>
        </button>
      ))}
    </div>
  );
}

function HazardTable({ items, totalCount, onRowClick }: { items: HazardItem[]; totalCount: number; onRowClick: (id: string) => void }) {
  if (items.length === 0) {
    return <EmptyState icon={ShieldAlert} message={totalCount === 0 ? "No hazards identified yet. Report site hazards with risk assessment here." : "No hazards match your filters."} />;
  }
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="grid grid-cols-[130px_1fr_140px_100px_80px_120px_110px] gap-2 border-b border-border bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
        <div>Number</div><div>Title</div><div>Project</div><div>Risk</div><div>Score</div><div>Status</div><div className="text-right">Target</div>
      </div>
      {items.map((h) => (
        <button key={h.id} onClick={() => onRowClick(h.id)} className="grid w-full grid-cols-[130px_1fr_140px_100px_80px_120px_110px] gap-2 border-b border-border/50 px-3 py-2 text-sm text-left hover:bg-muted/30 transition-colors">
          <div className="font-mono text-xs text-muted-foreground self-center">{h.hazardNumber}</div>
          <div className="min-w-0 self-center">
            <div className="truncate font-medium">{h.title}</div>
            <div className="truncate text-xs text-muted-foreground">{h.location ?? ""}</div>
          </div>
          <div className="text-xs text-muted-foreground self-center truncate">{h.projectName}</div>
          <div className="self-center"><Badge variant={RISK_VARIANTS[h.riskLevel] ?? "default"}>{h.riskLevel}</Badge></div>
          <div className="text-xs self-center tabular-nums">{h.likelihood * h.severity}</div>
          <div className="self-center"><Badge variant={HAZARD_STATUS_VARIANTS[h.status] ?? "default"}>{h.status}</Badge></div>
          <div className="text-right text-xs text-muted-foreground self-center tabular-nums">{h.targetResolutionDate ? formatDate(h.targetResolutionDate) : "—"}</div>
        </button>
      ))}
    </div>
  );
}

function InspectionTable({ items, totalCount, onRowClick }: { items: InspectionItem[]; totalCount: number; onRowClick: (id: string) => void }) {
  if (items.length === 0) {
    return <EmptyState icon={ClipboardCheck} message={totalCount === 0 ? "No inspections scheduled yet. Plan safety walkthroughs and audits here." : "No inspections match your filters."} />;
  }
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="grid grid-cols-[130px_1fr_140px_120px_120px_110px_110px] gap-2 border-b border-border bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
        <div>Number</div><div>Title</div><div>Project</div><div>Status</div><div>Result</div><div className="text-right">Scheduled</div><div className="text-right">Conducted</div>
      </div>
      {items.map((i) => (
        <button key={i.id} onClick={() => onRowClick(i.id)} className="grid w-full grid-cols-[130px_1fr_140px_120px_120px_110px_110px] gap-2 border-b border-border/50 px-3 py-2 text-sm text-left hover:bg-muted/30 transition-colors">
          <div className="font-mono text-xs text-muted-foreground self-center">{i.inspectionNumber}</div>
          <div className="min-w-0 self-center">
            <div className="truncate font-medium">{i.title}</div>
            <div className="truncate text-xs text-muted-foreground">{i.inspectorName ?? ""}</div>
          </div>
          <div className="text-xs text-muted-foreground self-center truncate">{i.projectName}</div>
          <div className="self-center"><Badge variant={INSPECTION_STATUS_VARIANTS[i.status] ?? "default"}>{i.status.replace(/_/g, " ")}</Badge></div>
          <div className="self-center">{i.result ? <Badge variant={RESULT_VARIANTS[i.result] ?? "default"}>{i.result.replace(/_/g, " ")}</Badge> : <span className="text-xs text-muted-foreground">—</span>}</div>
          <div className="text-right text-xs text-muted-foreground self-center tabular-nums">{formatDate(i.scheduledDate)}</div>
          <div className="text-right text-xs text-muted-foreground self-center tabular-nums">{i.conductedDate ? formatDate(i.conductedDate) : "—"}</div>
        </button>
      ))}
    </div>
  );
}

function EmptyState({ icon: Icon, message }: { icon: React.ComponentType<{ className?: string }>; message: string }) {
  return (
    <div className="rounded-lg border border-border p-12 text-center">
      <Icon className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

type IncidentType = "ACCIDENT" | "NEAR_MISS" | "INJURY" | "FATALITY" | "PROPERTY_DAMAGE" | "ENVIRONMENTAL" | "FIRE" | "STRUCTURAL" | "OTHER";
type IncidentSeverity = "FIRST_AID" | "LOST_TIME" | "SERIOUS" | "FATAL" | "PROPERTY_ONLY";

function NewIncidentDialog({ open, onOpenChange, projects, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; projects: Project[]; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    projectId: projects[0]?.id ?? "", title: "", description: "", type: "ACCIDENT" as IncidentType, severity: "FIRST_AID" as IncidentSeverity,
    incidentDate: new Date().toISOString().slice(0, 10), incidentTime: "", location: "", peopleInvolved: "",
    injuredCount: "0", fatalities: "0", propertyDamageEstimate: "",
  });
  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) { setForm((f) => ({ ...f, [k]: v })); }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.description.trim()) { toast.error("Title and description are required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/safety/incidents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        projectId: form.projectId, title: form.title.trim(), description: form.description.trim(), type: form.type, severity: form.severity,
        incidentDate: form.incidentDate, incidentTime: form.incidentTime || null, location: form.location || null,
        peopleInvolved: form.peopleInvolved || null, injuredCount: parseInt(form.injuredCount) || 0, fatalities: parseInt(form.fatalities) || 0,
        propertyDamageEstimate: form.propertyDamageEstimate ? parseFloat(form.propertyDamageEstimate) : null,
      }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success("Incident reported"); onSaved();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Failed"); } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Report Safety Incident" description="Document an accident, near-miss, or injury on site." className="max-w-2xl">
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Project" required>
          <Select value={form.projectId} onChange={(e) => set("projectId", e.target.value)}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="Title" required>
          <Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Worker fell from scaffolding" required />
        </Field>
        <Field label="Description" required>
          <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} placeholder="What happened? Be specific…" required />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Type">
            <Select value={form.type} onChange={(e) => set("type", e.target.value as IncidentType)}>
              <option value="ACCIDENT">Accident</option><option value="NEAR_MISS">Near Miss</option><option value="INJURY">Injury</option>
              <option value="FATALITY">Fatality</option><option value="PROPERTY_DAMAGE">Property Damage</option><option value="ENVIRONMENTAL">Environmental</option>
              <option value="FIRE">Fire</option><option value="STRUCTURAL">Structural</option><option value="OTHER">Other</option>
            </Select>
          </Field>
          <Field label="Severity">
            <Select value={form.severity} onChange={(e) => set("severity", e.target.value as IncidentSeverity)}>
              <option value="FIRST_AID">First Aid</option><option value="LOST_TIME">Lost Time</option><option value="SERIOUS">Serious</option>
              <option value="FATAL">Fatal</option><option value="PROPERTY_ONLY">Property Only</option>
            </Select>
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date" required><Input type="date" value={form.incidentDate} onChange={(e) => set("incidentDate", e.target.value)} required /></Field>
          <Field label="Time"><Input type="time" value={form.incidentTime} onChange={(e) => set("incidentTime", e.target.value)} /></Field>
        </div>
        <Field label="Location"><Input value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="e.g. Tower B, 5th floor" /></Field>
        <Field label="People Involved"><Input value={form.peopleInvolved} onChange={(e) => set("peopleInvolved", e.target.value)} placeholder="Names or description" /></Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Injured"><Input type="number" value={form.injuredCount} onChange={(e) => set("injuredCount", e.target.value)} /></Field>
          <Field label="Fatalities"><Input type="number" value={form.fatalities} onChange={(e) => set("fatalities", e.target.value)} /></Field>
          <Field label="Property Damage ₹"><Input type="number" value={form.propertyDamageEstimate} onChange={(e) => set("propertyDamageEstimate", e.target.value)} placeholder="0" /></Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}{saving ? "Reporting…" : "Report"}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function NewHazardDialog({ open, onOpenChange, projects, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; projects: Project[]; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    projectId: projects[0]?.id ?? "", title: "", description: "", likelihood: "2", severity: "2",
    location: "", mitigationPlan: "", targetResolutionDate: "",
  });
  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) { setForm((f) => ({ ...f, [k]: v })); }
  const lk = parseInt(form.likelihood) || 1; const sv = parseInt(form.severity) || 1;
  const riskLevel = computeRiskLevel(lk, sv);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.description.trim()) { toast.error("Title and description are required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/safety/hazards", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        projectId: form.projectId, title: form.title.trim(), description: form.description.trim(),
        likelihood: lk, severity: sv, location: form.location || null,
        mitigationPlan: form.mitigationPlan || null, targetResolutionDate: form.targetResolutionDate || null,
      }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success("Hazard reported"); onSaved();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Failed"); } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Report Hazard" description="Identify a site hazard with risk assessment." className="max-w-2xl">
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Project" required>
          <Select value={form.projectId} onChange={(e) => set("projectId", e.target.value)}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="Title" required><Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Unprotected edge at 5th floor" required /></Field>
        <Field label="Description" required><Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} placeholder="What is the hazard?" required /></Field>
        <div className="rounded-lg border border-border p-3 bg-muted/30">
          <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Risk Assessment</p>
          <div className="grid gap-3 sm:grid-cols-2 mb-2">
            <Field label={`Likelihood: ${lk} — ${["", "Rare", "Unlikely", "Possible", "Likely", "Certain"][lk]}`}>
              <input type="range" min="1" max="5" value={form.likelihood} onChange={(e) => set("likelihood", e.target.value)} className="w-full" />
            </Field>
            <Field label={`Severity: ${sv} — ${["", "Minor", "Moderate", "Serious", "Major", "Catastrophic"][sv]}`}>
              <input type="range" min="1" max="5" value={form.severity} onChange={(e) => set("severity", e.target.value)} className="w-full" />
            </Field>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Score: {lk * sv}</span>
            <Badge variant={RISK_VARIANTS[riskLevel] ?? "default"}>{riskLevel}</Badge>
          </div>
        </div>
        <Field label="Location"><Input value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="e.g. Tower B, east side" /></Field>
        <Field label="Mitigation Plan (optional)"><Textarea value={form.mitigationPlan} onChange={(e) => set("mitigationPlan", e.target.value)} rows={2} placeholder="How will the hazard be controlled?" /></Field>
        <Field label="Target Resolution Date"><Input type="date" value={form.targetResolutionDate} onChange={(e) => set("targetResolutionDate", e.target.value)} /></Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}{saving ? "Reporting…" : "Report"}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function NewInspectionDialog({ open, onOpenChange, projects, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; projects: Project[]; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ projectId: projects[0]?.id ?? "", title: "", scheduledDate: new Date().toISOString().slice(0, 10), inspectorName: "" });
  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) { setForm((f) => ({ ...f, [k]: v })); }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/safety/inspections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        projectId: form.projectId, title: form.title.trim(), scheduledDate: form.scheduledDate, inspectorName: form.inspectorName || null,
      }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success("Inspection scheduled"); onSaved();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Failed"); } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Schedule Safety Inspection" description="Plan a safety walkthrough or audit." className="max-w-lg">
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Project" required>
          <Select value={form.projectId} onChange={(e) => set("projectId", e.target.value)}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="Title" required><Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Weekly safety walkthrough" required /></Field>
        <Field label="Scheduled Date" required><Input type="date" value={form.scheduledDate} onChange={(e) => set("scheduledDate", e.target.value)} required /></Field>
        <Field label="Inspector Name (optional)"><Input value={form.inspectorName} onChange={(e) => set("inspectorName", e.target.value)} placeholder="e.g. External safety auditor" /></Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}{saving ? "Scheduling…" : "Schedule"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
