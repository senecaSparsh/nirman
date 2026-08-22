"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Package, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";

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
  const issueDisabled = (projects.length === 0 && departments.length === 0) || materialOptions.length === 0;

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
                {i.receiverName && (
                  <div className="mt-0.5 text-caption text-muted-foreground">
                    Received by: <span className="text-foreground">{i.receiverName}</span>
                    {i.receiverMobile && <span className="ml-1 tnum">({i.receiverMobile})</span>}
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
              </div>
            ))}
          </div>
        </div>
      )}

      <IssueFormDialog open={formOpen} onOpenChange={setFormOpen} projects={projects} locations={locationOptions} materials={materialOptions} departments={departments} categories={categories} />
    </div>
  );
}
