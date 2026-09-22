"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Package, RefreshCw, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";

import { IssueFormDialog } from "@/components/procurement/issue-form-dialog";
import { formatCurrency, formatDate } from "@/lib/utils";
import type {
  MaterialIssueListRow,
  ProjectOption,
  DepartmentOption,
  MaterialOption,
  StockLocationOption,
} from "@/lib/types";

/**
 * Issues tab — issue materials from stock to a project (WIP) or a cost centre
 * (operating expenses). This is the "value-addition" step of the lifecycle:
 * the issued cost increments the receiving unit/project's book value.
 * Extracted from the old Procurement page so it lives with the stock lifecycle.
 */
export function IssuesTab({
  issues,
  projects,
  departments,
  materialOptions,
  locationOptions,
  categories,
  canIssue,
  autoOpenForm,
}: {
  issues: MaterialIssueListRow[];
  projects: ProjectOption[];
  departments: DepartmentOption[];
  materialOptions: MaterialOption[];
  locationOptions: StockLocationOption[];
  categories: { id: string; name: string; unit: string }[];
  canIssue: boolean;
  autoOpenForm?: boolean;
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<MaterialIssueListRow | null>(null);
  const issueDisabled = (projects.length === 0 && departments.length === 0) || materialOptions.length === 0;

  // Execute a PENDING issue (moves stock) or cancel a COMPLETED one
  // (reverses stock + GL) — the same actions the mobile issue detail offers.
  async function issueAction(id: string, action: "execute" | "cancel") {
    setBusyId(id);
    try {
      const res = await fetch(`/api/issue-materials/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Failed to ${action}`);
      toast.success(action === "execute" ? "Issue executed — stock moved" : "Issue cancelled — stock + ledger reversed");
      setCancelTarget(null);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusyId(null);
    }
  }

  // Auto-open the issue dialog when navigated from receive goods
  useEffect(() => {
    if (autoOpenForm && canIssue && !issueDisabled) setFormOpen(true);
  }, [autoOpenForm, canIssue, issueDisabled]);

  const filtered = useMemo(() => {
    let result = issues;
    if (projectFilter) result = result.filter((i) => i.projectId === projectFilter);
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter((i) =>
        (i.projectName ?? "").toLowerCase().includes(q) ||
        (i.departmentName ?? "").toLowerCase().includes(q) ||
        (i.fromLocationName ?? "").toLowerCase().includes(q) ||
        (i.issueNumber ?? "").toLowerCase().includes(q),
      );
    }
    return result;
  }, [issues, query, projectFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row">
          <div className="relative sm:max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search project, location, slip no…" className="pl-8" />
          </div>
          <Select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className="sm:max-w-[180px]">
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => router.refresh()} title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
          {canIssue && issues.length > 0 && (
            <Button onClick={() => setFormOpen(true)} disabled={issueDisabled}>
              <Plus className="h-4 w-4" /> Issue Materials
            </Button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Package className="h-5 w-5" />}
          title={issues.length === 0 ? "No material issues" : "No issues match the filters"}
          description="Issue materials from stock to a project (WIP) or a cost centre (operating expenses)."
          action={canIssue ? (
            <Button onClick={() => setFormOpen(true)} disabled={issueDisabled}>
              <Plus className="h-4 w-4" /> Issue Materials
            </Button>
          ) : undefined}
        />
      ) : (
        /* ── Timeline feed ──────────────────────────────────────────
           A vertical line with amber dots traces the history of
           material issues. Each entry shows the target (project or
           department), source location, line count, total cost
           (red, monospace), and date. */
        <div className="relative pl-6">
          {/* Vertical line */}
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />
          <div className="space-y-5">
            {issues.map((i) => (
              <div key={i.id} className="relative">
                {/* Amber dot */}
                <span className="absolute -left-[19px] top-1.5 h-3.5 w-3.5 rounded-full border-2 border-background bg-amber-500" />
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">
                    {i.projectName ?? (`${i.departmentCode ?? ""} ${i.departmentName ?? ""}`.trim() || "—")}
                  </span>
                  {i.issueNumber && (
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-micro text-muted-foreground">{i.issueNumber}</span>
                  )}
                  {i.status === "PENDING" && (
                    <span className="rounded bg-warning/15 px-1.5 py-0.5 text-micro font-medium text-warning">
                      Awaiting Gate Pass
                    </span>
                  )}
                  {i.status === "CANCELLED" && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-micro font-medium text-muted-foreground">
                      Cancelled
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-body text-muted-foreground">{i.fromLocationName}</div>
                {/* Built unit / phase / subcontractor context */}
                {(i.builtUnitName || i.phaseName || i.subcontractorName) && (
                  <div className="mt-0.5 flex flex-wrap gap-1.5 text-micro">
                    {i.builtUnitName && (
                      <span className="rounded bg-brand/10 px-1.5 py-0.5 font-medium text-brand">Unit: {i.builtUnitName}</span>
                    )}
                    {i.phaseName && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">Phase: {i.phaseName}</span>
                    )}
                    {i.subcontractorName && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">Subcon: {i.subcontractorName}</span>
                    )}
                    {i.sourceDprId && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">From DPR</span>
                    )}
                  </div>
                )}
                {i.receiverName && (
                  <div className="mt-0.5 text-caption text-muted-foreground">
                    Received by: <span className="text-foreground">{i.receiverName}</span>
                    {i.receiverMobile && <span className="ml-1 tnum">({i.receiverMobile})</span>}
                  </div>
                )}
                {(i.vehicleNumber || i.driverName) && (
                  <div className="mt-0.5 text-caption text-muted-foreground">
                    {i.vehicleNumber && <span className="font-mono">{i.vehicleNumber}</span>}
                    {i.vehicleNumber && i.driverName && <span className="text-muted-foreground/40"> · </span>}
                    {i.driverName && <span>{i.driverName}{i.driverPhone ? ` (${i.driverPhone})` : ""}</span>}
                  </div>
                )}
                <div className="mt-1 flex items-center gap-2 text-caption">
                  <span className="tnum text-muted-foreground">{i.lineCount} line{i.lineCount !== 1 ? "s" : ""}</span>
                  <span className="text-muted-foreground/40">·</span>
                  <span className="font-mono font-semibold text-danger">{formatCurrency(i.totalAmount)}</span>
                  {i.roundOff !== 0 && (
                    <>
                      <span className="text-muted-foreground/40">·</span>
                      <span className="tnum text-muted-foreground">incl. round-off {formatCurrency(i.roundOff)}</span>
                    </>
                  )}
                  <span className="text-muted-foreground/40">·</span>
                  <span className="tnum text-muted-foreground">{formatDate(i.issueDate)}</span>
                  {i.issueNumber && (
                    <>
                      <span className="text-muted-foreground/40">·</span>
                      <a
                        href={`/print/issue/${i.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground underline hover:text-foreground"
                      >
                        Print Slip
                      </a>
                    </>
                  )}
                </div>
                {/* Execute / Cancel — the lifecycle actions the mobile detail
                    page exposes. Without this the desktop register was
                    read-only: a completed issue couldn't be reversed. */}
                {canIssue && i.status !== "CANCELLED" && (
                  <div className="mt-1.5 flex gap-2">
                    {i.status === "PENDING" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === i.id}
                        onClick={() => issueAction(i.id, "execute")}
                      >
                        {busyId === i.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                        Execute Issue
                      </Button>
                    )}
                    {i.status === "COMPLETED" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-danger hover:text-danger"
                        disabled={busyId === i.id}
                        onClick={() => setCancelTarget(i)}
                      >
                        Cancel Issue
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <IssueFormDialog open={formOpen} onOpenChange={setFormOpen} projects={projects} locations={locationOptions} materials={materialOptions} departments={departments} categories={categories} />

      <ConfirmDialog
        open={cancelTarget != null}
        onOpenChange={(o) => { if (!o) setCancelTarget(null); }}
        title={`Cancel issue ${cancelTarget?.issueNumber ?? ""}?`}
        description="This returns the issued quantity to the source location and posts a reversing ledger entry. The issue stays on the register marked Cancelled."
        confirmLabel="Cancel Issue"
        variant="destructive"
        onConfirm={async () => { if (cancelTarget) await issueAction(cancelTarget.id, "cancel"); }}
      />
    </div>
  );
}
