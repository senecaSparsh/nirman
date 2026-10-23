"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/field";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatDate } from "@/lib/utils";
import { StatusPill } from "@/components/page";
import {Plus, ClipboardCheck, Loader2} from "lucide-react";
import { PhotoUploader } from "@/components/ui/photo-uploader";
import { EmptyState } from "@/components/empty-state";

type NcrCategory = "MATERIAL" | "WORKMANSHIP" | "DESIGN" | "DOCUMENT" | "PROCESS" | "SAFETY" | "OTHER";
type NcrSeverity = "CRITICAL" | "MAJOR" | "MINOR" | "OBSERVATION";

interface NcrItem {
  id: string;
  ncrNumber: string;
  title: string;
  severity: string;
  status: string;
  category: string;
  projectName: string;
  subcontractorName: string | null;
  location: string | null;
  hasCapa: boolean;
  capaStatus: string | null;
  raisedAt: string;
}

type Project = { id: string; name: string; type: string; status: string };
type Subcontractor = { id: string; name: string; trade: string | null };

const CATEGORY_LABELS: Record<string, string> = {
  MATERIAL: "Material", WORKMANSHIP: "Workmanship", DESIGN: "Design",
  DOCUMENT: "Document", PROCESS: "Process", SAFETY: "Safety", OTHER: "Other",
};

const SEVERITY_VARIANTS: Record<string, "danger" | "warning" | "default"> = {
  CRITICAL: "danger", MAJOR: "warning", MINOR: "default", OBSERVATION: "default",
};

export function QualityControlView({
  ncrs,
  projects,
  subcontractors,
  canManage,
}: {
  ncrs: NcrItem[];
  projects: Project[];
  subcontractors: Subcontractor[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [dialogOpen, setDialogOpen] = useState(false);

  const filtered = useMemo(() => {
    let result = ncrs;
    if (statusFilter !== "ALL") result = result.filter((n) => n.status === statusFilter);
    if (severityFilter !== "ALL") result = result.filter((n) => n.severity === severityFilter);
    return result;
  }, [ncrs, statusFilter, severityFilter]);

  const columns: Column<NcrItem>[] = [
    {
      key: "ncrNumber",
      label: "NCR Number",
      sortable: true,
      render: (n) => <span className="font-mono text-caption font-semibold text-foreground">{n.ncrNumber}</span>,
    },
    {
      key: "title",
      label: "Title",
      sortable: true,
      render: (n) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-foreground">{n.title}</div>
          <div className="truncate text-caption text-muted-foreground">
            {n.location ? `${n.location} · ` : ""}{n.subcontractorName ?? ""}
            {n.hasCapa && <span className="ml-1 text-success">· CAPA {n.capaStatus}</span>}
          </div>
        </div>
      ),
    },
    {
      key: "projectName",
      label: "Project",
      sortable: true,
      render: (n) => <span className="text-muted-foreground">{n.projectName}</span>,
    },
    {
      key: "category",
      label: "Category",
      sortable: true,
      render: (n) => <span className="text-caption">{CATEGORY_LABELS[n.category] ?? n.category}</span>,
    },
    {
      key: "severity",
      label: "Severity",
      sortable: true,
      render: (n) => <Badge variant={SEVERITY_VARIANTS[n.severity] ?? "default"}>{n.severity}</Badge>,
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (n) => {
        const capaDone = n.status === "CAPA_REQUIRED" && (n.capaStatus === "VERIFIED" || n.capaStatus === "CLOSED");
        const effective = capaDone ? "READY_TO_CLOSE" : n.status;
        return <StatusPill status={effective} />;
      },
    },
    {
      key: "raisedAt",
      label: "Raised",
      align: "right",
      sortable: true,
      sortValue: (n) => new Date(n.raisedAt),
      render: (n) => <span className="tnum text-caption text-muted-foreground">{formatDate(n.raisedAt)}</span>,
    },
  ];

  const filters = (
    <div className="flex items-center gap-2">
      <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-7 w-[140px] text-caption" aria-label="Status filter">
        <option value="ALL">All Status</option>
        <option value="OPEN">Open</option>
        <option value="UNDER_REVIEW">Under Review</option>
        <option value="CAPA_REQUIRED">CAPA Required</option>
        <option value="ACCEPTED">Accepted</option>
        <option value="REJECTED">Rejected</option>
        <option value="CLOSED">Closed</option>
        <option value="CANCELLED">Cancelled</option>
      </Select>
      <Select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)} className="h-7 w-[130px] text-caption" aria-label="Severity filter">
        <option value="ALL">All Severity</option>
        <option value="CRITICAL">Critical</option>
        <option value="MAJOR">Major</option>
        <option value="MINOR">Minor</option>
        <option value="OBSERVATION">Observation</option>
      </Select>
    </div>
  );

  return (
    <div className="space-y-4">
      {ncrs.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck />}
          title="No NCRs raised yet"
          description="Raise a Non-Conformance Report to track quality issues, root causes, and CAPA resolutions."
          action={
            canManage && projects.length > 0 ? (
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                <Plus className="size-4" /> Raise NCR
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
          <DataTable
            columns={columns}
            data={filtered}
            getRowId={(n) => n.id}
            storageKey="quality-control-ncrs"
            searchable
            searchPlaceholder="Search NCR number, title, project…"
            hideable
            exportFileName="ncrs"
            initialSort={{ key: "raisedAt", direction: "desc" }}
            onRowClick={(n) => router.push(`/quality-control/ncr/${n.id}`)}
            onAddRow={canManage && projects.length > 0 ? () => setDialogOpen(true) : undefined}
            addRowLabel="Raise NCR"
            toolbarLeading={filters}
            toolbarTrailing={
              canManage && projects.length > 0 ? (
                <Button size="sm" onClick={() => setDialogOpen(true)}>
                  <Plus className="size-3.5" /> Raise NCR
                </Button>
              ) : undefined
            }
          />
        </div>
      )}

      {dialogOpen && (
        <NewNcrDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          projects={projects}
          subcontractors={subcontractors}
          onSaved={() => router.refresh()}
        />
      )}
    </div>
  );
}

function NewNcrDialog({
  open,
  onOpenChange,
  projects,
  subcontractors,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: Project[];
  subcontractors: Subcontractor[];
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [attachments, setAttachments] = useState<{ url: string; fileName?: string }[]>([]);
  const [form, setForm] = useState({
    projectId: projects[0]?.id ?? "",
    title: "",
    description: "",
    category: "WORKMANSHIP" as NcrCategory,
    severity: "MINOR" as NcrSeverity,
    location: "",
    workType: "",
    responsibleParty: "",
    subcontractorId: "",
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.description.trim()) {
      toast.error("Title and description are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/quality-control/ncr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: form.projectId,
          title: form.title.trim(),
          description: form.description.trim(),
          category: form.category,
          severity: form.severity,
          location: form.location || null,
          workType: form.workType || null,
          responsibleParty: form.responsibleParty || null,
          subcontractorId: form.subcontractorId || null,
          attachments: attachments.map((a) => a.url),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create");
      toast.success("NCR raised");
      onOpenChange(false);
      onSaved();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Raise Non-Conformance Report"
      description="Document a quality issue found on site."
      className="max-w-2xl"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Project" required>
            <Select value={form.projectId} onChange={(e) => set("projectId", e.target.value)}>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="Subcontractor (if responsible)">
            <Select value={form.subcontractorId} onChange={(e) => set("subcontractorId", e.target.value)}>
              <option value="">— None —</option>
              {subcontractors.map((s) => <option key={s.id} value={s.id}>{s.name}{s.trade ? ` (${s.trade})` : ""}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Title" required>
          <Input aria-label="Title" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Uneven plaster in flat 302" required />
        </Field>
        <Field label="Description" required>
          <Textarea aria-label="What is non-conforming? Be specific" value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} placeholder="What is non-conforming? Be specific…" required />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Category">
            <Select value={form.category} onChange={(e) => set("category", e.target.value as NcrCategory)}>
              <option value="WORKMANSHIP">Workmanship</option>
              <option value="MATERIAL">Material</option>
              <option value="DESIGN">Design</option>
              <option value="DOCUMENT">Document</option>
              <option value="PROCESS">Process</option>
              <option value="SAFETY">Safety</option>
              <option value="OTHER">Other</option>
            </Select>
          </Field>
          <Field label="Severity">
            <Select value={form.severity} onChange={(e) => set("severity", e.target.value as NcrSeverity)}>
              <option value="CRITICAL">Critical</option>
              <option value="MAJOR">Major</option>
              <option value="MINOR">Minor</option>
              <option value="OBSERVATION">Observation</option>
            </Select>
          </Field>
          <Field label="Responsible Party">
            <Input aria-label="Observation" value={form.responsibleParty} onChange={(e) => set("responsibleParty", e.target.value)} placeholder="e.g. In-house team" />
          </Field>
        </div>
        <Field label="Location">
          <Input aria-label="Observation" value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="e.g. Tower A, 3rd floor, flat 302" />
        </Field>
        <Field label="Work Type">
          <Input aria-label="Observation" value={form.workType} onChange={(e) => set("workType", e.target.value)} placeholder="e.g. Plastering, Concrete Pour" />
        </Field>
        <div>
          <p className="text-sm font-medium mb-1.5">Photo Evidence</p>
          <PhotoUploader photos={attachments} onChange={setAttachments} maxPhotos={8} label="Add Photo" />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={saving}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
            {saving ? "Raising…" : "Raise NCR"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}