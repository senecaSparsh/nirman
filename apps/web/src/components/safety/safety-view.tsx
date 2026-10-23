"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/field";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DataTable, type Column } from "@/components/ui/data-table";
import { localDateISO, formatDate } from "@/lib/utils";
import { StatusPill } from "@/components/page";
import { AlertTriangle, ShieldAlert, ClipboardCheck, Plus, Loader2 } from "lucide-react";
import { computeRiskLevel } from "@nirman/services/safety";
import { PhotoUploader } from "@/components/ui/photo-uploader";
import { EmptyState } from "@/components/empty-state";

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
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [dialogOpen, setDialogOpen] = useState(false);

  const filteredIncidents = useMemo(
    () => (statusFilter === "ALL" ? incidents : incidents.filter((i) => i.status === statusFilter)),
    [incidents, statusFilter],
  );
  const filteredHazards = useMemo(
    () => (statusFilter === "ALL" ? hazards : hazards.filter((h) => h.status === statusFilter)),
    [hazards, statusFilter],
  );
  const filteredInspections = useMemo(
    () => (statusFilter === "ALL" ? inspections : inspections.filter((i) => i.status === statusFilter)),
    [inspections, statusFilter],
  );

  function switchTab(t: Tab) {
    setTab(t);
    setStatusFilter("ALL");
    setDialogOpen(false);
  }

  const statusOptions = tab === "incidents"
    ? [["REPORTED", "Reported"], ["UNDER_INVESTIGATION", "Investigating"], ["INVESTIGATED", "Investigated"], ["CLOSED", "Closed"], ["CANCELLED", "Cancelled"]]
    : tab === "hazards"
    ? [["IDENTIFIED", "Identified"], ["MITIGATING", "Mitigating"], ["RESOLVED", "Resolved"]]
    : [["SCHEDULED", "Scheduled"], ["IN_PROGRESS", "In Progress"], ["COMPLETED", "Completed"], ["CANCELLED", "Cancelled"]];

  const statusSelect = (
    <Select aria-label="Filter by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-7 w-[150px] text-caption">
      <option value="ALL">All Status</option>
      {statusOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </Select>
  );

  const ctaLabel = tab === "incidents" ? "Report Incident" : tab === "hazards" ? "Report Hazard" : "Schedule Inspection";
  const ctaButton = canManage && projects.length > 0 ? (
    <Button size="sm" onClick={() => setDialogOpen(true)}>
      <Plus className="size-3.5" /> {ctaLabel}
    </Button>
  ) : undefined;

  const incidentColumns: Column<IncidentItem>[] = [
    {
      key: "incidentNumber",
      label: "Number",
      sortable: true,
      render: (i) => <span className="font-mono text-caption font-semibold text-foreground">{i.incidentNumber}</span>,
    },
    {
      key: "title",
      label: "Title",
      sortable: true,
      render: (i) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-foreground">{i.title}</div>
          <div className="truncate text-caption text-muted-foreground">
            {i.location ? `${i.location} · ` : ""}{i.injuredCount > 0 ? `${i.injuredCount} injured` : ""}{i.fatalities > 0 ? ` · ${i.fatalities} fatal` : ""}
          </div>
        </div>
      ),
    },
    {
      key: "projectName",
      label: "Project",
      sortable: true,
      render: (i) => <span className="text-muted-foreground">{i.projectName}</span>,
    },
    {
      key: "type",
      label: "Type",
      sortable: true,
      render: (i) => <span className="text-caption">{TYPE_LABELS[i.type] ?? i.type}</span>,
    },
    {
      key: "severity",
      label: "Severity",
      sortable: true,
      render: (i) => <Badge variant={SEVERITY_VARIANTS[i.severity] ?? "default"}>{i.severity.replace("_", " ")}</Badge>,
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (i) => <StatusPill status={i.status} />,
    },
    {
      key: "incidentDate",
      label: "Date",
      align: "right",
      sortable: true,
      sortValue: (i) => new Date(i.incidentDate),
      render: (i) => <span className="tnum text-caption text-muted-foreground">{formatDate(i.incidentDate)}</span>,
    },
  ];

  const hazardColumns: Column<HazardItem>[] = [
    {
      key: "hazardNumber",
      label: "Number",
      sortable: true,
      render: (h) => <span className="font-mono text-caption font-semibold text-foreground">{h.hazardNumber}</span>,
    },
    {
      key: "title",
      label: "Title",
      sortable: true,
      render: (h) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-foreground">{h.title}</div>
          {h.location && <div className="truncate text-caption text-muted-foreground">{h.location}</div>}
        </div>
      ),
    },
    {
      key: "projectName",
      label: "Project",
      sortable: true,
      render: (h) => <span className="text-muted-foreground">{h.projectName}</span>,
    },
    {
      key: "riskLevel",
      label: "Risk",
      sortable: true,
      render: (h) => <Badge variant={RISK_VARIANTS[h.riskLevel] ?? "default"}>{h.riskLevel}</Badge>,
    },
    {
      key: "score",
      label: "Score",
      align: "right",
      sortable: true,
      sortValue: (h) => h.likelihood * h.severity,
      render: (h) => <span className="tnum text-body font-medium">{h.likelihood * h.severity}</span>,
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (h) => <StatusPill status={h.status} />,
    },
    {
      key: "targetResolutionDate",
      label: "Target",
      align: "right",
      sortable: true,
      sortValue: (h) => (h.targetResolutionDate ? new Date(h.targetResolutionDate) : ""),
      render: (h) => <span className="tnum text-caption text-muted-foreground">{h.targetResolutionDate ? formatDate(h.targetResolutionDate) : "—"}</span>,
    },
  ];

  const inspectionColumns: Column<InspectionItem>[] = [
    {
      key: "inspectionNumber",
      label: "Number",
      sortable: true,
      render: (i) => <span className="font-mono text-caption font-semibold text-foreground">{i.inspectionNumber}</span>,
    },
    {
      key: "title",
      label: "Title",
      sortable: true,
      render: (i) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-foreground">{i.title}</div>
          {i.inspectorName && <div className="truncate text-caption text-muted-foreground">{i.inspectorName}</div>}
        </div>
      ),
    },
    {
      key: "projectName",
      label: "Project",
      sortable: true,
      render: (i) => <span className="text-muted-foreground">{i.projectName}</span>,
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (i) => <StatusPill status={i.status} />,
    },
    {
      key: "result",
      label: "Result",
      sortable: true,
      sortValue: (i) => i.result ?? "",
      render: (i) => i.result ? <Badge variant={RESULT_VARIANTS[i.result] ?? "default"}>{i.result.replace(/_/g, " ")}</Badge> : <span className="text-muted-foreground">—</span>,
    },
    {
      key: "scheduledDate",
      label: "Scheduled",
      align: "right",
      sortable: true,
      sortValue: (i) => new Date(i.scheduledDate),
      render: (i) => <span className="tnum text-caption text-muted-foreground">{formatDate(i.scheduledDate)}</span>,
    },
    {
      key: "conductedDate",
      label: "Conducted",
      align: "right",
      sortable: true,
      sortValue: (i) => (i.conductedDate ? new Date(i.conductedDate) : ""),
      render: (i) => <span className="tnum text-caption text-muted-foreground">{i.conductedDate ? formatDate(i.conductedDate) : "—"}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={switchTab}>
        <TabsList>
          <TabsTrigger value="incidents" count={incidents.length}>
            <span className="flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Incidents</span>
          </TabsTrigger>
          <TabsTrigger value="hazards" count={hazards.length}>
            <span className="flex items-center gap-1.5"><ShieldAlert className="h-3.5 w-3.5" /> Hazards</span>
          </TabsTrigger>
          <TabsTrigger value="inspections" count={inspections.length}>
            <span className="flex items-center gap-1.5"><ClipboardCheck className="h-3.5 w-3.5" /> Inspections</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="incidents">
          {incidents.length === 0 ? (
            <EmptyState
              icon={<AlertTriangle />}
              title="No incidents reported yet"
              description="Report accidents, near-misses, and injuries here."
              action={ctaButton}
            />
          ) : (
            <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
              <DataTable
                columns={incidentColumns}
                data={filteredIncidents}
                getRowId={(i) => i.id}
                storageKey="safety-incidents"
                searchable
                searchPlaceholder="Search incidents…"
                hideable
                exportFileName="safety-incidents"
                initialSort={{ key: "incidentDate", direction: "desc" }}
                onRowClick={(i) => router.push(`/safety/incidents/${i.id}`)}
                onAddRow={canManage && projects.length > 0 ? () => setDialogOpen(true) : undefined}
                addRowLabel="Report Incident"
                toolbarLeading={statusSelect}
                toolbarTrailing={ctaButton}
              />
            </div>
          )}
        </TabsContent>

        <TabsContent value="hazards">
          {hazards.length === 0 ? (
            <EmptyState
              icon={<ShieldAlert />}
              title="No hazards identified yet"
              description="Report site hazards with risk assessment here."
              action={ctaButton}
            />
          ) : (
            <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
              <DataTable
                columns={hazardColumns}
                data={filteredHazards}
                getRowId={(h) => h.id}
                storageKey="safety-hazards"
                searchable
                searchPlaceholder="Search hazards…"
                hideable
                exportFileName="safety-hazards"
                initialSort={{ key: "score", direction: "desc" }}
                onRowClick={(h) => router.push(`/safety/hazards/${h.id}`)}
                onAddRow={canManage && projects.length > 0 ? () => setDialogOpen(true) : undefined}
                addRowLabel="Report Hazard"
                toolbarLeading={statusSelect}
                toolbarTrailing={ctaButton}
              />
            </div>
          )}
        </TabsContent>

        <TabsContent value="inspections">
          {inspections.length === 0 ? (
            <EmptyState
              icon={<ClipboardCheck />}
              title="No inspections scheduled yet"
              description="Plan safety walkthroughs and audits here."
              action={ctaButton}
            />
          ) : (
            <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
              <DataTable
                columns={inspectionColumns}
                data={filteredInspections}
                getRowId={(i) => i.id}
                storageKey="safety-inspections"
                searchable
                searchPlaceholder="Search inspections…"
                hideable
                exportFileName="safety-inspections"
                initialSort={{ key: "scheduledDate", direction: "desc" }}
                onRowClick={(i) => router.push(`/safety/inspections/${i.id}`)}
                onAddRow={canManage && projects.length > 0 ? () => setDialogOpen(true) : undefined}
                addRowLabel="Schedule Inspection"
                toolbarLeading={statusSelect}
                toolbarTrailing={ctaButton}
              />
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      {dialogOpen && tab === "incidents" && <NewIncidentDialog open={dialogOpen} onOpenChange={setDialogOpen} projects={projects} onSaved={() => { setDialogOpen(false); router.refresh(); }} />}
      {dialogOpen && tab === "hazards" && <NewHazardDialog open={dialogOpen} onOpenChange={setDialogOpen} projects={projects} onSaved={() => { setDialogOpen(false); router.refresh(); }} />}
      {dialogOpen && tab === "inspections" && <NewInspectionDialog open={dialogOpen} onOpenChange={setDialogOpen} projects={projects} onSaved={() => { setDialogOpen(false); router.refresh(); }} />}
    </div>
  );
}

type IncidentType = "ACCIDENT" | "NEAR_MISS" | "INJURY" | "FATALITY" | "PROPERTY_DAMAGE" | "ENVIRONMENTAL" | "FIRE" | "STRUCTURAL" | "OTHER";
type IncidentSeverity = "FIRST_AID" | "LOST_TIME" | "SERIOUS" | "FATAL" | "PROPERTY_ONLY";

function NewIncidentDialog({ open, onOpenChange, projects, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; projects: Project[]; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [attachments, setAttachments] = useState<{ url: string; fileName?: string }[]>([]);
  const [form, setForm] = useState({
    projectId: projects[0]?.id ?? "", title: "", description: "", type: "ACCIDENT" as IncidentType, severity: "FIRST_AID" as IncidentSeverity,
    incidentDate: localDateISO(), incidentTime: "", location: "", peopleInvolved: "",
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
        attachments: attachments.map((a) => a.url),
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
          <Field label="Date" required><Input aria-label="Incident Date" type="date" value={form.incidentDate} onChange={(e) => set("incidentDate", e.target.value)} required /></Field>
          <Field label="Time"><Input aria-label="Incident Time" type="time" value={form.incidentTime} onChange={(e) => set("incidentTime", e.target.value)} /></Field>
        </div>
        <Field label="Location"><Input aria-label="Property Only" value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="e.g. Tower B, 5th floor" /></Field>
        <Field label="People Involved"><Input aria-label="Names or description" value={form.peopleInvolved} onChange={(e) => set("peopleInvolved", e.target.value)} placeholder="Names or description" /></Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Injured"><Input aria-label="Injured Count" type="number" value={form.injuredCount} onChange={(e) => set("injuredCount", e.target.value)} /></Field>
          <Field label="Fatalities"><Input aria-label="Fatalities" type="number" value={form.fatalities} onChange={(e) => set("fatalities", e.target.value)} /></Field>
          <Field label="Property Damage ₹"><Input aria-label="Property Only" type="number" value={form.propertyDamageEstimate} onChange={(e) => set("propertyDamageEstimate", e.target.value)} placeholder="0" /></Field>
        </div>
        <div>
          <p className="text-sm font-medium mb-1.5">Photo Evidence</p>
          <PhotoUploader photos={attachments} onChange={setAttachments} maxPhotos={8} label="Add Photo" />
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
  const [attachments, setAttachments] = useState<{ url: string; fileName?: string }[]>([]);
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
        attachments: attachments.map((a) => a.url),
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
              <input aria-label="Likelihood" type="range" min="1" max="5" value={form.likelihood} onChange={(e) => set("likelihood", e.target.value)} className="w-full" />
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
        <Field label="Mitigation Plan (optional)"><Textarea aria-label="How will the hazard be controlled?" value={form.mitigationPlan} onChange={(e) => set("mitigationPlan", e.target.value)} rows={2} placeholder="How will the hazard be controlled?" /></Field>
        <Field label="Target Resolution Date"><Input type="date" value={form.targetResolutionDate} onChange={(e) => set("targetResolutionDate", e.target.value)} /></Field>
        <div>
          <p className="text-sm font-medium mb-1.5">Photo Evidence</p>
          <PhotoUploader photos={attachments} onChange={setAttachments} maxPhotos={8} label="Add Photo" />
        </div>
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
  const [form, setForm] = useState({ projectId: projects[0]?.id ?? "", title: "", scheduledDate: localDateISO(), inspectorName: "" });
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
        <Field label="Inspector Name (optional)"><Input aria-label="Inspector Name" value={form.inspectorName} onChange={(e) => set("inspectorName", e.target.value)} placeholder="e.g. External safety auditor" /></Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}{saving ? "Scheduling…" : "Schedule"}</Button>
        </div>
      </form>
    </Dialog>
  );
}