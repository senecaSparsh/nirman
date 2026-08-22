"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Plus, ClipboardList, X, Check, ShoppingCart, Trash2, Zap, Loader2, Printer, FileText, FileSpreadsheet, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { DataTable, type Column } from "@/components/ui/data-table";
import { SelectWithCreate } from "@/components/ui/select-with-create";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import { MaterialFormDialog } from "@/components/materials/material-form-dialog";
import { LocationFormDialog } from "@/components/materials/location-form-dialog";
import { SupplierFormDialog } from "@/components/procurement/supplier-form-dialog";
import { StatusPill } from "@/components/page";
import { formatDate, formatNumber } from "@/lib/utils";
import { downloadExcel } from "@/lib/export";
import { ComparativeQuotePanel } from "./comparative-quote-panel";
import type { RequisitionRow, RequisitionStatus } from "@/lib/types";

type ProjectOption = { id: string; name: string; type: string; status: string };
type PhaseOption = { id: string; name: string; projectId: string };
type MaterialOption = { id: string; code: string; name: string; unit: string };
type SupplierOption = { id: string; name: string };
type LocationOption = { id: string; name: string; type: "COMPANY_WAREHOUSE" | "PROJECT_SITE" | "DEPARTMENT" };
type CategoryOption = { id: string; name: string; unit: string };

/** Column definitions for the requisitions DataTable. */
const reqColumns: Column<RequisitionRow>[] = [
  {
    key: "reqNumber",
    label: "Indent No",
    sortable: true,
    render: (r) => <span className="font-mono text-caption font-bold text-foreground">{r.reqNumber}</span>,
  },
  {
    key: "projectName",
    label: "Project",
    sortable: true,
    render: (r) => (
      <div>
        <span className="font-medium text-foreground">{r.projectName}</span>
        {r.phaseName && <span className="ml-2 text-caption text-muted-foreground">{r.phaseName}</span>}
      </div>
    ),
  },
  {
    key: "status",
    label: "Status",
    sortable: true,
    render: (r) => <StatusPill status={r.status} />,
  },
  {
    key: "lineCount",
    label: "Items",
    align: "right",
    sortable: true,
    render: (r) => <span className="tnum text-muted-foreground">{r.lineCount}</span>,
  },
  {
    key: "totalQty",
    label: "Total Qty",
    align: "right",
    sortable: true,
    render: (r) => <span className="tnum text-muted-foreground">{formatNumber(r.totalQty, 3)}</span>,
  },
  {
    key: "requestDate",
    label: "Requested",
    sortable: true,
    sortValue: (r) => new Date(r.requestDate),
    render: (r) => <span className="tnum text-muted-foreground">{formatDate(r.requestDate)}</span>,
  },
  {
    key: "neededByDate",
    label: "Needed By",
    sortable: true,
    sortValue: (r) => (r.neededByDate ? new Date(r.neededByDate) : new Date(0)),
    render: (r) => {
      if (!r.neededByDate) return <span className="text-muted-foreground">—</span>;
      const isOverdue = new Date(r.neededByDate) < new Date() && r.status !== "CONVERTED" && r.status !== "REJECTED";
      return (
        <span className={`tnum ${isOverdue ? "text-danger font-medium" : "text-muted-foreground"}`}>
          {formatDate(r.neededByDate)}
        </span>
      );
    },
  },
  {
    key: "quotes",
    label: "Quotes",
    align: "right",
    render: (r) => {
      if (r.status !== "APPROVED") return <span className="text-muted-foreground">—</span>;
      if (r.quotesWaived) return <span className="text-caption text-muted-foreground">waived</span>;
      const count = r.quoteCount ?? 0;
      const min = r.minQuotesRequired ?? 3;
      return (
        <span className={`tnum ${count >= min ? "text-success font-medium" : "text-warning font-medium"}`}>
          {count}/{min}
        </span>
      );
    },
  },
];

export function RequisitionsView({
  requisitions,
  projects,
  phases,
  materials,
  suppliers,
  locations,
  categories,
  permissions,
}: {
  requisitions: RequisitionRow[];
  projects: ProjectOption[];
  phases: PhaseOption[];
  materials: MaterialOption[];
  suppliers: SupplierOption[];
  locations: LocationOption[];
  categories: CategoryOption[];
  permissions?: { canCreate?: boolean; canApprove?: boolean };
}) {
  const canCreate = permissions?.canCreate ?? false;
  const canApprove = permissions?.canApprove ?? false;
  const [formOpen, setFormOpen] = useState(false);
  const [convertTarget, setConvertTarget] = useState<RequisitionRow | null>(null);
  const [deleting, setDeleting] = useState<RequisitionRow | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [autoOpen, setAutoOpen] = useState(false);
  const [autoProjectId, setAutoProjectId] = useState("");
  const [autoLoading, setAutoLoading] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<RequisitionRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [view, setView] = useState<"list" | "board">("list");
  const router = useRouter();
  const searchParams = useSearchParams();

  // Auto-open convert dialog when navigated with ?req=<id> (e.g. from approvals)
  useEffect(() => {
    const reqId = searchParams.get("req");
    if (reqId) {
      const req = requisitions.find((r) => r.id === reqId);
      if (req && req.status === "APPROVED") setConvertTarget(req);
    }
  }, [searchParams, requisitions]);

  const filtered = statusFilter ? requisitions.filter((r) => r.status === statusFilter) : requisitions;

  const rejectedItems = filtered.filter((r) => r.status === "REJECTED");
  const convertedItems = filtered.filter((r) => r.status === "CONVERTED");

  const pipelineColumns: { status: RequisitionStatus; label: string; color: string }[] = [
    { status: "DRAFT", label: "Draft", color: "var(--color-stage-system)" },
    { status: "SUBMITTED", label: "Submitted", color: "var(--color-stage-manage)" },
    { status: "APPROVED", label: "Approved", color: "var(--color-stage-procure)" },
  ];

  async function action(reqId: string, action: string, extra?: Record<string, unknown>) {
    try {
      const res = await fetch(`/api/requisitions/${reqId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (action === "submit") {
        toast.success("Indent submitted", {
          description: "It's now in the approval queue.",
          action: { label: "View Queue", onClick: () => router.push("/approvals") },
        });
      } else {
        toast.success(`${action} successful`);
      }
      router.refresh();
    } catch (err: unknown) {
      toast.error((err instanceof Error ? err.message : "Action failed"));
    }
  }

  async function confirmReject() {
    if (!rejectTarget) return;
    await action(rejectTarget.id, "reject", { rejectReason: rejectReason.trim() || undefined });
    setRejectTarget(null);
    setRejectReason("");
  }

  async function generateAuto() {
    if (!autoProjectId) {
      toast.error("Select a project first");
      return;
    }
    setAutoLoading(true);
    try {
      const res = await fetch("/api/requisitions/auto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: autoProjectId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.generated) {
        toast.success(
          `Generated ${data.reqNumber} — ${data.lineCount} material(s) below reorder point.`,
        );
        setAutoOpen(false);
        setAutoProjectId("");
      } else {
        toast.info(data.message ?? "Nothing to generate.");
      }
      router.refresh();
    } catch (err: unknown) {
      toast.error((err instanceof Error ? err.message : "Auto-generation failed"));
    } finally {
      setAutoLoading(false);
    }
  }

  // Extract the List/Board toggle + status filter so it can be reused in both
  // list and board views without TypeScript narrowing issues.
  const viewToggle = (
    <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
      <button
        onClick={() => setView("list")}
        className={`rounded px-2 py-1 text-caption font-medium transition-colors ${view === "list" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
      >
        List
      </button>
      <button
        onClick={() => setView("board")}
        className={`rounded px-2 py-1 text-caption font-medium transition-colors ${view === "board" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
      >
        Board
      </button>
    </div>
  );
  const statusSelect = (
    <div className="relative shrink-0" style={{ width: 110 }}>
      <select
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value)}
        style={{ width: 110 }}
        className="h-8 shrink-0 appearance-none rounded-md border border-input bg-card pl-2.5 pr-7 text-[13px] text-foreground transition-[border-color,box-shadow] hover:border-border-strong focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/20"
      >
        <option value="">All statuses</option>
        <option value="DRAFT">Draft</option>
        <option value="SUBMITTED">Submitted</option>
        <option value="APPROVED">Approved</option>
        <option value="REJECTED">Rejected</option>
        <option value="CONVERTED">Converted</option>
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
    </div>
  );

  return (
    <div className="space-y-5">
      {filtered.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-5 w-5" />}
          title={requisitions.length === 0 ? "No indents yet" : "No indents match the filter"}
          description={requisitions.length === 0 ? "Create a material indent to request materials for a project site." : "Try a different status filter."}
          action={requisitions.length === 0 ? (
            <Button onClick={() => setFormOpen(true)} disabled={projects.length === 0}>
              <Plus className="h-4 w-4" /> New Indent
            </Button>
          ) : undefined}
        />
      ) : (
        <>
          {view === "list" ? (
            /* ── Data Table view (default, enterprise-grade) ──────────
               Dense, sortable columns. Click a row to open the detail
               dialog. Switch to Board for the kanban flow view. */
            <div className="rounded-lg border border-border overflow-hidden">
              <DataTable
                data={filtered}
                initialSort={{ key: "requestDate", direction: "desc" }}
                columns={reqColumns}
                onRowClick={(r) => {
                  if (r.status === "APPROVED") setConvertTarget(r);
                }}
                searchable
                searchPlaceholder="Search by indent no, project…"
                showTotals
                sumColumns={["totalQty"]}
                totalFormat={(_key, sum) => formatNumber(sum, 3)}
                hideable
                pageSize={50}
                exportFileName="requisitions"
                onAddRow={canCreate && projects.length > 0 ? () => setFormOpen(true) : undefined}
                addRowLabel="New Indent"
                toolbarLeading={
                  <div className="flex w-fit shrink-0 items-center gap-2">
                    {viewToggle}
                    {statusSelect}
                  </div>
                }
                toolbarTrailing={
                  <>
                    {/* Excel export (icon-only) */}
                    <div className="group relative">
                      <button
                        onClick={() => downloadExcel("purchase-trends")}
                        disabled={filtered.length === 0}
                        className="inline-flex h-7 items-center justify-center rounded-md border border-input bg-card px-2 text-caption font-medium text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                      >
                        <FileSpreadsheet className="size-3.5" />
                      </button>
                      <span className="pointer-events-none absolute top-full left-1/2 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[11px] text-background opacity-0 transition-opacity group-hover:opacity-100 z-50">
                        Export Excel
                      </span>
                    </div>
                    {/* Auto-generate (icon-only) */}
                    {canCreate && (
                      <div className="group relative">
                        <button
                          onClick={() => setAutoOpen(true)}
                          disabled={projects.length === 0}
                          className="inline-flex h-7 items-center justify-center rounded-md border border-input bg-card px-2 text-caption font-medium text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                        >
                          <Zap className="size-3.5" />
                        </button>
                        <span className="pointer-events-none absolute top-full left-1/2 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[11px] text-background opacity-0 transition-opacity group-hover:opacity-100 z-50">
                          Auto-generate
                        </span>
                      </div>
                    )}
                  </>
                }
              />
            </div>
          ) : (
          <>
          {/* Board view toolbar */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {viewToggle}
              {statusSelect}
            </div>
            <div className="flex gap-2">
              {canCreate && (
                <Button variant="outline" size="icon" title="Auto-generate from low stock" onClick={() => setAutoOpen(true)} disabled={projects.length === 0}>
                  <Zap className="h-4 w-4" />
                </Button>
              )}
              <Button onClick={() => setFormOpen(true)} disabled={projects.length === 0}>
                <Plus className="h-4 w-4" /> New Indent
              </Button>
            </div>
          </div>
          {/* ── Pipeline (kanban by status) ───────────────────────────
              Indents flow Draft → Submitted → Approved → Converted.
              Rejected drop out to a compact section below. Each card
              shows the key info and the action available at that stage. */}
          <div className="flex gap-3 overflow-x-auto pb-2">
            {pipelineColumns.map((col) => {
              const items = filtered.filter((r) => r.status === col.status);
              return (
                <div key={col.status} className="flex w-64 shrink-0 flex-col">
                  {/* Column header */}
                  <div className="mb-2 flex items-center gap-2 px-1">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: col.color }} />
                    <span className="text-label text-muted-foreground">{col.label}</span>
                    <span className="ml-auto text-caption font-semibold tnum text-muted-foreground">{items.length}</span>
                  </div>

                  {/* Column body */}
                  <div className="flex-1 space-y-2">
                    {items.length === 0 && (
                      <div className="rounded-md border border-dashed border-border/60 py-6 text-center text-micro text-muted-foreground/50">
                        empty
                      </div>
                    )}
                    {items.map((r) => {
                      const isOverdue = r.neededByDate && new Date(r.neededByDate) < new Date();
                      return (
                        <div key={r.id} className="rounded-lg border border-border bg-card p-3 transition-all hover:border-foreground/20 hover:shadow-sm">
                          {/* Req number + status badge */}
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-caption font-bold text-foreground">{r.reqNumber}</span>
                            <div className="flex items-center gap-1.5">
                              <a
                                href={`/print/requisition/${r.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-foreground"
                                title="Print indent"
                              >
                                <Printer className="h-3.5 w-3.5" />
                              </a>
                              <StatusPill status={r.status} />
                            </div>
                          </div>

                          {/* Project + phase */}
                          <div className="mt-1.5 truncate text-body font-medium text-foreground">{r.projectName}</div>
                          {r.phaseName && <div className="truncate text-caption text-muted-foreground">{r.phaseName}</div>}

                          {/* Line count + needed-by */}
                          <div className="mt-2 flex items-center justify-between">
                            <span className="text-caption text-muted-foreground">{r.lineCount} item{r.lineCount !== 1 ? "s" : ""}</span>
                            <span className={`text-caption tnum ${isOverdue ? "text-danger font-semibold" : "text-muted-foreground"}`}>
                              {r.neededByDate ? formatDate(r.neededByDate) : "—"}
                            </span>
                          </div>

                          {/* Quote badge */}
                          {r.status === "APPROVED" && (
                            <div className="mt-1.5 flex items-center gap-1.5">
                              <FileText className="h-3 w-3 text-muted-foreground" />
                              <span className={`text-caption ${r.quotesWaived ? "text-muted-foreground" : (r.quoteCount ?? 0) >= (r.minQuotesRequired ?? 3) ? "text-success font-medium" : "text-warning font-medium"}`}>
                                {r.quotesWaived ? "Quotes waived" : `Quotes: ${r.quoteCount ?? 0}/${r.minQuotesRequired ?? 3}`}
                              </span>
                            </div>
                          )}

                          {/* Actions */}
                          <div className="mt-2.5 flex gap-1.5">
                            {r.status === "DRAFT" && (
                              <>
                                <Button size="sm" variant="outline" className="h-7 flex-1" onClick={() => action(r.id, "submit")}>Submit</Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-danger" onClick={() => setDeleting(r)} title="Delete">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                            {r.status === "SUBMITTED" && canApprove && (
                              <>
                                <Button size="sm" variant="outline" className="h-7 flex-1" onClick={() => action(r.id, "approve")}><Check className="h-3.5 w-3.5" /> Approve</Button>
                                <Button size="sm" variant="outline" className="h-7 flex-1" onClick={() => { setRejectTarget(r); setRejectReason(""); }}><X className="h-3.5 w-3.5" /> Reject</Button>
                              </>
                            )}
                            {r.status === "SUBMITTED" && !canApprove && (
                              <span className="text-micro text-muted-foreground">Awaiting approval</span>
                            )}
                            {r.status === "APPROVED" && (
                              <Button size="sm" className="h-7 w-full" onClick={() => setConvertTarget(r)}>
                                <ShoppingCart className="h-3.5 w-3.5" /> Convert to PO
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Rejected (compact section) ──────────────────────────── */}
          {rejectedItems.length > 0 && (
            <div className="rounded-lg border border-border">
              <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--color-danger)" }} />
                <span className="text-label text-muted-foreground">Rejected</span>
                <span className="ml-auto text-caption font-semibold tnum text-muted-foreground">{rejectedItems.length}</span>
              </div>
              <div className="divide-y divide-border">
                {rejectedItems.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 px-3 py-2">
                    <span className="font-mono text-caption font-bold text-foreground w-28 shrink-0">{r.reqNumber}</span>
                    <span className="flex-1 truncate text-body font-medium">{r.projectName}</span>
                    <span className="text-caption text-muted-foreground shrink-0">{r.lineCount} item{r.lineCount !== 1 ? "s" : ""}</span>
                    <StatusPill status={r.status} />
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-danger" onClick={() => setDeleting(r)} title="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Converted (compact section) ─────────────────────────── */}
          {convertedItems.length > 0 && (
            <div className="rounded-lg border border-border">
              <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--color-success)" }} />
                <span className="text-label text-muted-foreground">Converted</span>
                <span className="ml-auto text-caption font-semibold tnum text-muted-foreground">{convertedItems.length}</span>
              </div>
              <div className="divide-y divide-border">
                {convertedItems.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 px-3 py-2">
                    <span className="font-mono text-caption font-bold text-foreground w-28 shrink-0">{r.reqNumber}</span>
                    <span className="flex-1 truncate text-body font-medium">{r.projectName}</span>
                    <span className="text-caption text-muted-foreground shrink-0">{r.lineCount} item{r.lineCount !== 1 ? "s" : ""}</span>
                    <span className="text-caption text-success font-medium shrink-0">PO created</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          </>
          )}
        </>
      )}

      {formOpen && (
        <RequisitionFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          projects={projects}
          phases={phases}
          materials={materials}
          suppliers={suppliers}
          categories={categories}
        />
      )}
      {convertTarget && (
        <ConvertDialog
          requisition={convertTarget}
          suppliers={suppliers}
          materials={materials}
          locations={locations}
          projects={projects}
          canApprove={canApprove}
          onOpenChange={(o) => !o && setConvertTarget(null)}
        />
      )}
      {deleting && (
        <DeleteConfirmDialog
          open={deleting !== null}
          onOpenChange={(o) => !o && setDeleting(null)}
          endpoint={`/api/requisitions/${deleting.id}`}
          title="Delete indent"
          description={`Delete indent ${deleting.reqNumber}? Only draft or rejected indents can be deleted.`}
          successMessage="Indent deleted"
        />
      )}

      <Dialog
        open={autoOpen}
        onOpenChange={setAutoOpen}
        title="Auto-generate indents"
        description="Creates a DRAFT indent for every material at or below its reorder point. You still review and submit it."
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Project</Label>
            <Select value={autoProjectId} onChange={(e) => setAutoProjectId(e.target.value)}>
              <option value="">Select a project…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </div>
          <p className="text-meta text-muted-foreground">
            Materials already covered by an open indent for this project are skipped. Quantities use the
            material&apos;s EOQ when set, otherwise replenish to 2× reorder point.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setAutoOpen(false)}>Cancel</Button>
            <Button type="button" onClick={generateAuto} disabled={autoLoading || !autoProjectId}>
              {autoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              Generate
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={!!rejectTarget}
        onOpenChange={(o) => { if (!o) { setRejectTarget(null); setRejectReason(""); } }}
        title={`Reject ${rejectTarget?.reqNumber ?? ""}`}
        description="Provide a reason for rejecting this indent. The requester will see it."
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Insufficient budget, duplicate request, wrong material spec…"
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => { setRejectTarget(null); setRejectReason(""); }}>Cancel</Button>
            <Button type="button" variant="destructive" onClick={confirmReject}><X className="h-4 w-4" /> Reject</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function RequisitionFormDialog({
  open,
  onOpenChange,
  projects,
  phases,
  materials,
  suppliers,
  categories,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projects: ProjectOption[];
  phases: PhaseOption[];
  materials: MaterialOption[];
  suppliers: SupplierOption[];
  categories: CategoryOption[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    projectId: "",
    phaseId: "",
    neededByDate: "",
    notes: "",
  });
  const [lines, setLines] = useState<{ id: string; materialId: string; qty: string; notes: string; preferredSupplierId: string; stockLoading: boolean; currentStock: number | null; stockUnit: string | null }[]>([{ id: crypto.randomUUID(), materialId: "", qty: "", notes: "", preferredSupplierId: "", stockLoading: false, currentStock: null, stockUnit: null }]);
  // Local copies so freshly created masters appear in their dropdowns without
  // waiting for router.refresh.
  const [localProjects, setLocalProjects] = useState<ProjectOption[]>(projects);
  const [localMaterials, setLocalMaterials] = useState<MaterialOption[]>(materials);
  const [localSuppliers, setLocalSuppliers] = useState<SupplierOption[]>(suppliers);
  useEffect(() => { setLocalProjects(projects); }, [projects]);
  useEffect(() => { setLocalMaterials(materials); }, [materials]);
  useEffect(() => { setLocalSuppliers(suppliers); }, [suppliers]);

  const filteredPhases = form.projectId ? phases.filter((p) => p.projectId === form.projectId) : [];

  async function fetchStockContext(i: number, materialId: string) {
    if (!materialId) {
      setLines((ls) => ls.map((l, idx) => idx === i ? { ...l, currentStock: null, stockUnit: null, stockLoading: false } : l));
      return;
    }
    setLines((ls) => ls.map((l, idx) => idx === i ? { ...l, stockLoading: true } : l));
    try {
      const res = await fetch(`/api/stock/available?materialId=${materialId}`);
      if (res.ok) {
        const data = await res.json();
        const mat = localMaterials.find((m) => m.id === materialId);
        setLines((ls) => ls.map((l, idx) => idx === i ? { ...l, currentStock: data.totalQty ?? 0, stockUnit: mat?.unit ?? null, stockLoading: false } : l));
      } else {
        setLines((ls) => ls.map((l, idx) => idx === i ? { ...l, stockLoading: false } : l));
      }
    } catch {
      setLines((ls) => ls.map((l, idx) => idx === i ? { ...l, stockLoading: false } : l));
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.projectId) return toast.error("Project is required");
    const validLines = lines.filter((l) => l.materialId && Number(l.qty) > 0);
    if (validLines.length === 0) return toast.error("At least one valid line is required");
    setSaving(true);
    try {
      const res = await fetch("/api/requisitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: form.projectId,
          phaseId: form.phaseId || null,
          neededByDate: form.neededByDate || null,
          notes: form.notes.trim() || null,
          lines: validLines.map((l) => ({
            materialId: l.materialId,
            qtyRequested: Number(l.qty),
            notes: l.notes.trim() || null,
            preferredSupplierId: l.preferredSupplierId || null,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`Indent ${data.reqNumber ?? ""} created`);
      onOpenChange(false);
      setForm({ projectId: "", phaseId: "", neededByDate: "", notes: "" });
      setLines([{ id: crypto.randomUUID(), materialId: "", qty: "", notes: "", preferredSupplierId: "", stockLoading: false, currentStock: null, stockUnit: null }]);
      router.refresh();
    } catch (err: unknown) {
      toast.error((err instanceof Error ? err.message : "Failed"));
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New Material Indent (Demand Slip)"
      description="Request materials for a project site. The approver sees current stock and last purchase rate to decide."
      className="max-w-2xl"
    >
      <form onSubmit={save} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Project *</Label>
            <SelectWithCreate
              value={form.projectId}
              onChange={(v) => setForm((f) => ({ ...f, projectId: v, phaseId: "" }))}
              required
              placeholder="Select…"
              createLabel="project"
              options={localProjects.map((p) => ({ value: p.id, label: p.name }))}
              renderCreateDialog={({ open: o, onCreated, onClose }) => (
                <ProjectFormDialog open={o} onOpenChange={onClose} onCreated={(e) => { setLocalProjects((p) => [...p, { id: e.id, name: e.label ?? "", type: "RESIDENTIAL", status: "PLANNED" }]); onCreated(e); }} />
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Phase</Label>
            <Select value={form.phaseId} onChange={(e) => setForm((f) => ({ ...f, phaseId: e.target.value }))} disabled={filteredPhases.length === 0}>
              <option value="">None</option>
              {filteredPhases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Needed By Date</Label>
          <Input type="date" value={form.neededByDate} onChange={(e) => setForm((f) => ({ ...f, neededByDate: e.target.value }))} />
        </div>

        <div className="space-y-2">
          <Label>Lines</Label>
          {lines.map((line, i) => (
            <div key={line.id} className="space-y-1 rounded-md border p-2">
              <div className="flex gap-2">
                <SelectWithCreate
                  value={line.materialId}
                  onChange={(v) => { setLines((ls) => ls.map((l, idx) => idx === i ? { ...l, materialId: v } : l)); fetchStockContext(i, v); }}
                  placeholder="Select material…"
                  createLabel="material"
                  className="flex-1"
                  options={localMaterials.map((m) => ({ value: m.id, label: `${m.code} — ${m.name} (${m.unit})` }))}
                  renderCreateDialog={({ open: o, onCreated, onClose }) => (
                    <MaterialFormDialog open={o} onOpenChange={onClose} categories={categories} material={null} onCreated={(e) => { setLocalMaterials((p) => [...p, { id: e.id, code: "", name: e.label ?? "", unit: "" }]); onCreated(e); }} />
                  )}
                />
                <Input type="number" placeholder="Qty" value={line.qty} onChange={(e) => setLines((ls) => ls.map((l, idx) => idx === i ? { ...l, qty: e.target.value } : l))} className="w-24" />
                <Button type="button" variant="ghost" size="icon" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))} disabled={lines.length === 1} aria-label="Remove line">
                  <X className="h-4 w-4" />
                </Button>
              </div>
              {/* Stock context — demand-slip enrichment */}
              {line.materialId && (
                <div className="flex items-center gap-2 px-1 text-caption text-muted-foreground">
                  {line.stockLoading ? (
                    <span className="animate-pulse">Checking stock…</span>
                  ) : line.currentStock !== null ? (
                    <span>
                      Current stock:{" "}
                      <span className={`tnum font-medium ${line.currentStock > 0 ? "text-foreground" : "text-danger"}`}>
                        {line.currentStock} {line.stockUnit ?? ""}
                      </span>
                      {line.currentStock <= 0 && <span className="ml-1 text-danger">— out of stock</span>}
                    </span>
                  ) : null}
                </div>
              )}
              {/* Preferred supplier */}
              {line.materialId && (
                <SelectWithCreate
                  value={line.preferredSupplierId}
                  onChange={(v) => setLines((ls) => ls.map((l, idx) => idx === i ? { ...l, preferredSupplierId: v } : l))}
                  placeholder="No preferred supplier"
                  createLabel="supplier"
                  options={localSuppliers.map((s) => ({ value: s.id, label: s.name }))}
                  renderCreateDialog={({ open: o, onCreated, onClose }) => (
                    <SupplierFormDialog open={o} onOpenChange={onClose} onCreated={(e) => { setLocalSuppliers((p) => [...p, { id: e.id, name: e.label ?? "" }]); onCreated(e); }} supplier={null} />
                  )}
                />
              )}
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, { id: crypto.randomUUID(), materialId: "", qty: "", notes: "", preferredSupplierId: "", stockLoading: false, currentStock: null, stockUnit: null }])}>
            <Plus className="h-3.5 w-3.5" /> Add Line
          </Button>
        </div>

        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Creating…" : "Create"}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function ConvertDialog({
  requisition,
  suppliers,
  materials,
  locations,
  projects,
  canApprove,
  onOpenChange,
}: {
  requisition: RequisitionRow;
  suppliers: SupplierOption[];
  materials: MaterialOption[];
  locations: LocationOption[];
  projects: ProjectOption[];
  canApprove: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<{ lines: { id: string; materialId: string; materialCode: string; materialName: string; unit: string; qtyRequested: number; notes: string | null }[] } | null>(null);
  const [form, setForm] = useState({
    supplierId: "",
    procurementScope: "PROJECT" as "COMPANY" | "PROJECT",
    destinationLocationId: "",
    expectedDate: "",
    notes: "",
  });
  const [lineCosts, setLineCosts] = useState<Record<string, string>>({});
  // Local copies so freshly created masters appear in their dropdowns without
  // waiting for router.refresh.
  const [localSuppliers, setLocalSuppliers] = useState<SupplierOption[]>(suppliers);
  const [localLocations, setLocalLocations] = useState<LocationOption[]>(locations);
  useEffect(() => { setLocalSuppliers(suppliers); }, [suppliers]);
  useEffect(() => { setLocalLocations(locations); }, [locations]);

  // Fetch detail (with lines) on mount
  useEffect(() => {
    fetch(`/api/requisitions/${requisition.id}`)
      .then((r) => r.json())
      .then((d) => { if (!d.error) setDetail(d); })
      .catch(() => toast.error("Failed to load requisition details"));
  }, [requisition.id]);

  async function convert(e: React.FormEvent) {
    e.preventDefault();
    if (!form.supplierId) return toast.error("Supplier is required");
    if (!form.destinationLocationId) return toast.error("Destination location is required");
    if (!detail) return toast.error("Loading requisition details…");
    const costs: Record<string, number> = {};
    for (const line of detail.lines) {
      const cost = Number(lineCosts[line.materialId] ?? 0);
      if (cost < 0) return toast.error(`Cost for ${line.materialName} must be >= 0`);
      costs[line.materialId] = cost;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/requisitions/${requisition.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "convert",
          supplierId: form.supplierId,
          procurementScope: form.procurementScope,
          destinationLocationId: form.destinationLocationId,
          lineCosts: costs,
          expectedDate: form.expectedDate || null,
          notes: form.notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`PO created: ${data.poNumber}`);
      onOpenChange(false);
      router.refresh();
    } catch (err: unknown) {
      toast.error((err instanceof Error ? err.message : "Failed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title="Convert Requisition to PO"
      description={`${requisition.reqNumber} · ${requisition.projectName}`}
      className="max-w-2xl"
    >
      <form onSubmit={convert} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Supplier *</Label>
            <SelectWithCreate
              value={form.supplierId}
              onChange={(v) => setForm((f) => ({ ...f, supplierId: v }))}
              required
              placeholder="Select…"
              createLabel="supplier"
              options={localSuppliers.map((s) => ({ value: s.id, label: s.name }))}
              renderCreateDialog={({ open: o, onCreated, onClose }) => (
                <SupplierFormDialog open={o} onOpenChange={onClose} onCreated={(e) => { setLocalSuppliers((p) => [...p, { id: e.id, name: e.label ?? "" }]); onCreated(e); }} supplier={null} />
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Procurement Scope</Label>
            <Select value={form.procurementScope} onChange={(e) => setForm((f) => ({ ...f, procurementScope: e.target.value as "COMPANY" | "PROJECT" }))}>
              <option value="PROJECT">Project</option>
              <option value="COMPANY">Company</option>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Destination Location *</Label>
            <SelectWithCreate
              value={form.destinationLocationId}
              onChange={(v) => setForm((f) => ({ ...f, destinationLocationId: v }))}
              required
              placeholder="Select…"
              createLabel="location"
              options={localLocations
                .filter((l) => form.procurementScope === "COMPANY" ? l.type === "COMPANY_WAREHOUSE" : l.type === "PROJECT_SITE")
                .map((l) => ({ value: l.id, label: l.name }))}
              renderCreateDialog={({ open: o, onCreated, onClose }) => (
                <LocationFormDialog open={o} onOpenChange={onClose} onCreated={(e) => { setLocalLocations((p) => [...p, { id: e.id, name: e.label ?? "", type: "PROJECT_SITE", projectId: null }]); onCreated(e); }} projects={projects} location={null} />
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Expected Date</Label>
            <Input type="date" value={form.expectedDate} onChange={(e) => setForm((f) => ({ ...f, expectedDate: e.target.value }))} />
          </div>
        </div>

        {/* ── Comparative Quote Engine ── */}
        {detail && (
          <div className="space-y-2 rounded-md border border-border p-3">
            <div className="flex items-center gap-2">
              <span className="text-label font-semibold text-foreground">Vendor Quotes</span>
              <span className="text-caption text-muted-foreground">— upload ≥3 quotes, system flags the cheapest</span>
            </div>
            <ComparativeQuotePanel
              requisitionId={requisition.id}
              reqNumber={requisition.reqNumber}
              requisitionLines={detail.lines.map((l) => ({
                materialId: l.materialId,
                materialCode: l.materialCode,
                materialName: l.materialName,
                unit: l.unit,
                qtyRequested: l.qtyRequested,
              }))}
              suppliers={suppliers}
              materials={materials}
              canApprove={canApprove}
              canCreate={true}
            />
          </div>
        )}

        <div className="space-y-2">
          <Label>Line Costs (unit cost per material)</Label>
          {!detail ? (
            <p className="text-body text-muted-foreground">Loading lines…</p>
          ) : (
            detail.lines.map((line) => (
              <div key={line.id} className="flex items-center gap-2">
                <span className="flex-1 text-body">{line.materialName} ({line.materialCode})</span>
                <span className="tnum text-body text-muted-foreground">{formatNumber(line.qtyRequested, 3)} {line.unit}</span>
                <Input
                  type="number"
                  placeholder="Unit cost"
                  value={lineCosts[line.materialId] ?? ""}
                  onChange={(e) => setLineCosts((c) => ({ ...c, [line.materialId]: e.target.value }))}
                  className="w-32"
                />
              </div>
            ))
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Converting…" : "Convert to PO"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
