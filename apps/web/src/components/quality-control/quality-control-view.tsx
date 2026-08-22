"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/field";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { cn, formatDate } from "@/lib/utils";
import { Plus, ClipboardCheck, Search, AlertTriangle, ShieldCheck, Loader2 } from "lucide-react";

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

const STATUS_VARIANTS: Record<string, "default" | "warning" | "success" | "danger"> = {
  OPEN: "warning", UNDER_REVIEW: "warning", CAPA_REQUIRED: "warning",
  ACCEPTED: "success", REJECTED: "danger", CLOSED: "success", CANCELLED: "default",
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
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [dialogOpen, setDialogOpen] = useState(false);

  const filtered = useMemo(() => {
    let result = ncrs;
    if (statusFilter !== "ALL") result = result.filter((n) => n.status === statusFilter);
    if (severityFilter !== "ALL") result = result.filter((n) => n.severity === severityFilter);
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (n) => n.title.toLowerCase().includes(q) || n.ncrNumber.toLowerCase().includes(q) || n.projectName.toLowerCase().includes(q),
      );
    }
    return result;
  }, [ncrs, query, statusFilter, severityFilter]);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search NCRs…" className="pl-8" />
        </div>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-[140px]">
          <option value="ALL">All Status</option>
          <option value="OPEN">Open</option>
          <option value="UNDER_REVIEW">Under Review</option>
          <option value="CAPA_REQUIRED">CAPA Required</option>
          <option value="ACCEPTED">Accepted</option>
          <option value="REJECTED">Rejected</option>
          <option value="CLOSED">Closed</option>
          <option value="CANCELLED">Cancelled</option>
        </Select>
        <Select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)} className="w-[130px]">
          <option value="ALL">All Severity</option>
          <option value="CRITICAL">Critical</option>
          <option value="MAJOR">Major</option>
          <option value="MINOR">Minor</option>
          <option value="OBSERVATION">Observation</option>
        </Select>
        {canManage && projects.length > 0 && (
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Raise NCR
          </Button>
        )}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-border p-12 text-center">
          <ClipboardCheck className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">
            {ncrs.length === 0 ? "No NCRs raised yet. Raise one to track quality issues." : "No NCRs match your filters."}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="grid grid-cols-[120px_1fr_120px_100px_100px_100px_90px] gap-2 border-b border-border bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
            <div>NCR Number</div>
            <div>Title</div>
            <div>Project</div>
            <div>Category</div>
            <div>Severity</div>
            <div>Status</div>
            <div className="text-right">Raised</div>
          </div>
          {filtered.map((n) => (
            <button
              key={n.id}
              onClick={() => router.push(`/quality-control/ncr/${n.id}`)}
              className="grid w-full grid-cols-[120px_1fr_120px_100px_100px_100px_90px] gap-2 border-b border-border/50 px-3 py-2 text-sm text-left hover:bg-muted/30 transition-colors"
            >
              <div className="font-mono text-xs text-muted-foreground self-center">{n.ncrNumber}</div>
              <div className="min-w-0 self-center">
                <div className="truncate font-medium">{n.title}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {n.location ? `${n.location} · ` : ""}{n.subcontractorName ?? ""}
                  {n.hasCapa && <span className="ml-1 text-green-600">· CAPA {n.capaStatus}</span>}
                </div>
              </div>
              <div className="text-xs text-muted-foreground self-center truncate">{n.projectName}</div>
              <div className="text-xs self-center">{CATEGORY_LABELS[n.category] ?? n.category}</div>
              <div className="self-center"><Badge variant={SEVERITY_VARIANTS[n.severity] ?? "default"}>{n.severity}</Badge></div>
              <div className="self-center"><Badge variant={STATUS_VARIANTS[n.status] ?? "default"}>{n.status}</Badge></div>
              <div className="text-right text-xs text-muted-foreground self-center tabular-nums">{formatDate(n.raisedAt)}</div>
            </button>
          ))}
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
  const [form, setForm] = useState({
    projectId: projects[0]?.id ?? "",
    title: "",
    description: "",
    category: "WORKMANSHIP" as NcrCategory,
    severity: "MINOR" as NcrSeverity,
    location: "",
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
          responsibleParty: form.responsibleParty || null,
          subcontractorId: form.subcontractorId || null,
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
          <Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Uneven plaster in flat 302" required />
        </Field>
        <Field label="Description" required>
          <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} placeholder="What is non-conforming? Be specific…" required />
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
            <Input value={form.responsibleParty} onChange={(e) => set("responsibleParty", e.target.value)} placeholder="e.g. In-house team" />
          </Field>
        </div>
        <Field label="Location">
          <Input value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="e.g. Tower A, 3rd floor, flat 302" />
        </Field>
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
