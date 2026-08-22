"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Truck, ArrowRight, Building2, Check, X, Printer, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Dialog } from "@/components/ui/dialog";
import { StatusPill } from "@/components/page";
import { TransferFormDialog } from "@/components/procurement/transfer-form-dialog";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { StockLocationRow, TransferRow, ProjectOption } from "@/lib/types";

/**
 * Transfers tab — move stock between warehouses and project sites, within the
 * same company or across the company group (inter-company STO). Extracted from
 * the old Procurement page so it lives with the rest of the stock lifecycle.
 */
export function TransfersTab({ transfers, locations, projects, canTransfer }: { transfers: TransferRow[]; locations: StockLocationRow[]; projects: ProjectOption[]; canTransfer: boolean }) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [selected, setSelected] = useState<TransferRow | null>(null);

  const filtered = useMemo(() => {
    let result = transfers;
    if (statusFilter) result = result.filter((t) => t.status === statusFilter);
    return result;
  }, [transfers, statusFilter]);
  const canCreate = canTransfer && locations.length >= 2;

  const transferColumns: Column<TransferRow>[] = [
    {
      key: "transferDate",
      label: "Date",
      sortable: true,
      sortValue: (t) => new Date(t.transferDate),
      render: (t) => <span className="tnum text-muted-foreground">{formatDate(t.transferDate)}</span>,
    },
    {
      key: "route",
      label: "Route",
      sortable: true,
      sortValue: (t) => `${t.fromLocationName} → ${t.toLocationName}`,
      render: (t) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium text-foreground">{t.fromLocationName}</span>
          {t.isInterCompany && t.fromCompanyName && (
            <span className="text-micro text-muted-foreground">· {t.fromCompanyName}</span>
          )}
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="font-medium text-foreground">{t.toLocationName}</span>
          {t.isInterCompany && t.toCompanyName && (
            <span className="text-micro text-muted-foreground">· {t.toCompanyName}</span>
          )}
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (t) => (
        <div className="flex items-center gap-1.5">
          <StatusPill status={t.status} />
          {t.isInterCompany && (
            <span className="inline-flex items-center gap-1 rounded-full border border-brand/40 bg-brand/10 px-2 py-0.5 text-micro font-medium text-brand">
              <Building2 className="h-3 w-3" /> STO
            </span>
          )}
        </div>
      ),
    },
    {
      key: "lineCount",
      label: "Lines",
      align: "right",
      sortable: true,
      render: (t) => <span className="tnum text-muted-foreground">{t.lineCount}</span>,
    },
    {
      key: "materials",
      label: "Materials",
      render: (t) => (
        <span className="truncate text-caption text-muted-foreground">{t.materials.join(", ") || "—"}</span>
      ),
    },
  ];

  // Extract the status filter so it can be used in the DataTable toolbar.
  const statusSelect = (
    <div className="relative shrink-0" style={{ width: 140 }}>
      <select
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value)}
        style={{ width: 140 }}
        className="h-8 shrink-0 appearance-none rounded-md border border-input bg-card pl-2.5 pr-7 text-[13px] text-foreground transition-[border-color,box-shadow] hover:border-border-strong focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/20"
      >
        <option value="">All statuses</option>
        <option value="DRAFT">Draft</option>
        <option value="IN_TRANSIT">In Transit</option>
        <option value="COMPLETED">Completed</option>
        <option value="CANCELLED">Cancelled</option>
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
    </div>
  );

  return (
    <div className="space-y-4">
      {canTransfer && locations.length < 2 && (
        <p className="rounded-md border border-dashed p-3 text-body text-muted-foreground">
          You need at least two stock locations to create a transfer. Add locations in Settings → Locations.
        </p>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Truck className="h-5 w-5" />}
          title={transfers.length === 0 ? "No transfers yet" : "No transfers match the filter"}
          description={transfers.length === 0 ? "Move stock between warehouses and project sites — within the same company or across the company group." : "Try a different status filter."}
          action={transfers.length === 0 && canCreate ? (
            <Button onClick={() => setFormOpen(true)} disabled={locations.length < 2}>
              <Plus className="h-4 w-4" /> New Transfer
            </Button>
          ) : undefined}
        />
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <DataTable
            data={filtered}
            onRowClick={(t) => setSelected(t)}
            initialSort={{ key: "transferDate", direction: "desc" }}
            columns={transferColumns}
            searchable
            searchPlaceholder="Search locations, materials…"
            hideable
            pageSize={50}
            onAddRow={canCreate ? () => setFormOpen(true) : undefined}
            addRowLabel="New Transfer"
            toolbarLeading={statusSelect}
          />
        </div>
      )}

      {selected && (
        <Dialog
          open={!!selected}
          onOpenChange={(o) => { if (!o) setSelected(null); }}
          title="Transfer Details"
          description={formatDate(selected.transferDate)}
          size="lg"
        >
          <TransferDetailPanel transfer={selected} />
        </Dialog>
      )}

      <TransferFormDialog open={formOpen} onOpenChange={setFormOpen} locations={locations} projects={projects} />
    </div>
  );
}

function TransferCard({ transfer }: { transfer: TransferRow }) {
  const router = useRouter();
  const [acting, setActing] = useState(false);

  async function doAction(action: "complete" | "cancel") {
    setActing(true);
    try {
      const res = await fetch(`/api/transfers/${transfer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Action failed");
      toast.success(`Transfer ${action}d`);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setActing(false);
    }
  }

  return (
    <div className="flex flex-col rounded-lg border border-border bg-card p-4 transition-all hover:border-foreground/20 hover:shadow-sm">
      {/* Route: From → To (with company labels for cross-company STOs) */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-semibold text-foreground">{transfer.fromLocationName}</span>
        {transfer.isInterCompany && transfer.fromCompanyName && (
          <span className="text-micro text-muted-foreground">· {transfer.fromCompanyName}</span>
        )}
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="font-semibold text-foreground">{transfer.toLocationName}</span>
        {transfer.isInterCompany && transfer.toCompanyName && (
          <span className="text-micro text-muted-foreground">· {transfer.toCompanyName}</span>
        )}
      </div>

      {/* Status badge + inter-company STO badge */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <StatusPill status={transfer.status} />
        {transfer.isInterCompany && (
          <span className="inline-flex items-center gap-1 rounded-full border border-brand/40 bg-brand/10 px-2 py-0.5 text-micro font-medium text-brand">
            <Building2 className="h-3 w-3" /> Inter-company STO
          </span>
        )}
      </div>

      {/* Line count + materials (truncated to 1 line) */}
      <div className="mt-3 space-y-1">
        <div className="text-caption text-muted-foreground">
          {transfer.lineCount} line{transfer.lineCount !== 1 ? "s" : ""}
          {transfer.isInterCompany && transfer.transferPriceTotal != null && transfer.status === "COMPLETED" && (
            <span className="ml-2 tnum">· Transfer price {formatCurrency(transfer.transferPriceTotal)}</span>
          )}
        </div>
        <div className="truncate text-caption text-muted-foreground">{transfer.materials.join(", ") || "—"}</div>
      </div>

      {/* Date */}
      <div className="mt-2 text-micro tnum text-muted-foreground">{formatDate(transfer.transferDate)}</div>

      {/* Print link */}
      <div className="mt-2 border-t border-border pt-2">
        <a
          href={`/print/stock-transfer/${transfer.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-micro text-muted-foreground hover:text-foreground"
          title="Print transfer note"
        >
          <Printer className="h-3 w-3" /> Print Note
        </a>
      </div>

      {/* Actions for DRAFT transfers */}
      {transfer.status === "DRAFT" && (
        <div className="mt-3 flex gap-1 border-t border-border pt-3">
          <Button variant="ghost" size="sm" onClick={() => doAction("complete")} disabled={acting} className="text-success hover:text-success">
            <Check className="h-4 w-4" /> Complete
          </Button>
          <Button variant="ghost" size="icon" onClick={() => doAction("cancel")} disabled={acting} aria-label="Cancel" className="ml-auto text-muted-foreground hover:text-danger">
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

/** Detail panel for the split-view — shows full transfer info. */
function TransferDetailPanel({ transfer }: { transfer: TransferRow }) {
  const router = useRouter();
  const [acting, setActing] = useState(false);

  async function doAction(action: "complete" | "cancel") {
    setActing(true);
    try {
      const res = await fetch(`/api/transfers/${transfer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Action failed");
      toast.success(`Transfer ${action}d`);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setActing(false);
    }
  }

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-section text-foreground">Transfer Details</h3>
          <p className="text-caption text-muted-foreground tnum">{formatDate(transfer.transferDate)}</p>
        </div>
        <StatusPill status={transfer.status} />
      </div>

      {/* Route */}
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="text-label text-muted-foreground mb-2">Route</div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-col">
            <span className="font-semibold text-foreground">{transfer.fromLocationName}</span>
            <span className="text-micro text-muted-foreground">{transfer.fromLocationType.replace(/_/g, " ")}</span>
            {transfer.isInterCompany && transfer.fromCompanyName && (
              <span className="text-micro text-muted-foreground">{transfer.fromCompanyName}</span>
            )}
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <div className="flex flex-col">
            <span className="font-semibold text-foreground">{transfer.toLocationName}</span>
            <span className="text-micro text-muted-foreground">{transfer.toLocationType.replace(/_/g, " ")}</span>
            {transfer.isInterCompany && transfer.toCompanyName && (
              <span className="text-micro text-muted-foreground">{transfer.toCompanyName}</span>
            )}
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-label text-muted-foreground">Lines</div>
          <div className="text-figure tnum">{transfer.lineCount}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-label text-muted-foreground">Total Qty</div>
          <div className="text-figure tnum">{transfer.totalQty}</div>
        </div>
      </div>

      {/* Inter-company STO pricing */}
      {transfer.isInterCompany && transfer.transferPriceTotal != null && transfer.status === "COMPLETED" && (
        <div className="rounded-lg border border-brand/40 bg-brand/5 p-3">
          <div className="text-label text-brand mb-1">Inter-company STO</div>
          <div className="flex items-center justify-between">
            <span className="text-body text-muted-foreground">Transfer Price</span>
            <span className="text-figure tnum">{formatCurrency(transfer.transferPriceTotal)}</span>
          </div>
        </div>
      )}

      {/* Materials */}
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="text-label text-muted-foreground mb-2">Materials</div>
        <div className="text-body text-foreground">
          {transfer.materials.join(", ") || "—"}
        </div>
      </div>

      {/* Notes */}
      {transfer.notes && (
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-label text-muted-foreground mb-2">Notes</div>
          <div className="text-body text-foreground">{transfer.notes}</div>
        </div>
      )}

      {/* Print */}
      <div className="border-t border-border pt-3">
        <a
          href={`/print/stock-transfer/${transfer.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-body text-muted-foreground hover:text-foreground"
        >
          <Printer className="h-3.5 w-3.5" /> Print Transfer Note
        </a>
      </div>

      {/* Actions for DRAFT transfers */}
      {transfer.status === "DRAFT" && (
        <div className="flex gap-2 border-t border-border pt-3">
          <Button variant="default" size="sm" onClick={() => doAction("complete")} disabled={acting}>
            <Check className="h-4 w-4" /> Complete Transfer
          </Button>
          <Button variant="outline" size="sm" onClick={() => doAction("cancel")} disabled={acting} className="text-muted-foreground hover:text-danger">
            <X className="h-4 w-4" /> Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
