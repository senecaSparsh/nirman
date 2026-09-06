"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Truck, ArrowRight, Building2, Check, X, Printer, ChevronDown, Send, Undo, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Dialog } from "@/components/ui/dialog";
import { StatusPill } from "@/components/page";
import { TransferFormDialog } from "@/components/procurement/transfer-form-dialog";
import { LocationFormDialog } from "@/components/materials/location-form-dialog";
import { VehicleCaptureSection, EMPTY_VEHICLE, type VehicleData } from "@/components/vehicle-capture-section";
import { formatCurrency, formatDate } from "@/lib/utils";
import { AttachmentList } from "@/components/attachments/attachment-list";
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
  const [locationCreateOpen, setLocationCreateOpen] = useState(false);
  const [localLocations, _setLocalLocations] = useState<StockLocationRow[]>(locations);

  const filtered = useMemo(() => {
    let result = transfers;
    if (statusFilter) result = result.filter((t) => t.status === statusFilter);
    return result;
  }, [transfers, statusFilter]);
  const canCreate = canTransfer && localLocations.length >= 2;

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
      {canTransfer && localLocations.length < 2 && (
        <div className="rounded-md border border-dashed p-3 text-body text-muted-foreground flex items-center justify-between gap-3">
          <span>You need at least two stock locations to create a transfer.</span>
          <Button onClick={() => setLocationCreateOpen(true)} size="sm" variant="outline">
            <Plus className="h-4 w-4" /> Add Location
          </Button>
        </div>
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

      <TransferFormDialog open={formOpen} onOpenChange={setFormOpen} locations={localLocations} projects={projects} />

      {/* Inline location creation — opened from the "Add Location" button
          when there are fewer than 2 locations. No redirection to Settings. */}
      <LocationFormDialog
        open={locationCreateOpen}
        onOpenChange={setLocationCreateOpen}
        projects={projects}
        location={null}
        onCreated={(_entity) => {
          setLocationCreateOpen(false);
          // Refresh to pick up the new location in the list
          router.refresh();
        }}
      />
    </div>
  );
}


/** Detail panel for the split-view — shows full transfer info. */
function TransferDetailPanel({ transfer }: { transfer: TransferRow }) {
  const router = useRouter();
  const [acting, setActing] = useState(false);
  const [showDispatch, setShowDispatch] = useState(false);
  const [showComplete, setShowComplete] = useState(false);
  const [vehicle, setVehicle] = useState<VehicleData>(EMPTY_VEHICLE);
  const [challanNumber, setChallanNumber] = useState("");
  const [packageCount, setPackageCount] = useState("");
  const [deliveryMode, setDeliveryMode] = useState("");
  const [shortageRemarks, setShortageRemarks] = useState("");
  const [damageRemarks, setDamageRemarks] = useState("");

  async function doAction(
    action: "complete" | "cancel" | "dispatch" | "returnToSource",
    extra?: Record<string, unknown>,
  ) {
    setActing(true);
    try {
      const res = await fetch(`/api/transfers/${transfer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Action failed");
      const done: Record<typeof action, string> = { complete: "completed", cancel: "cancelled", dispatch: "dispatched", returnToSource: "returned to source" };
      toast.success(`Transfer ${done[action]}`);
      setShowDispatch(false);
      setShowComplete(false);
      setVehicle(EMPTY_VEHICLE);
      setChallanNumber("");
      setPackageCount("");
      setDeliveryMode("");
      setShortageRemarks("");
      setDamageRemarks("");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setActing(false);
    }
  }

  function handleDispatch() {
    doAction("dispatch", {
      vehicleNumber: vehicle.vehicleNumber || undefined,
      vehicleType: vehicle.vehicleType || undefined,
      driverName: vehicle.driverName || undefined,
      driverPhone: vehicle.driverPhone || undefined,
      transporterName: vehicle.transporterName || undefined,
      challanNumber: challanNumber || undefined,
      packageCount: packageCount ? Number(packageCount) : undefined,
    });
  }

  function handleComplete() {
    doAction("complete", {
      deliveryMode: deliveryMode || undefined,
      shortageRemarks: shortageRemarks || undefined,
      damageRemarks: damageRemarks || undefined,
    });
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

      {/* Vehicle / dispatch info */}
      {(transfer.vehicleNumber || transfer.driverName || transfer.transporterName || transfer.deliveryMode || transfer.packageCount != null) && (
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-label text-muted-foreground mb-2">Dispatch Details</div>
          <div className="grid grid-cols-2 gap-3 text-body">
            {transfer.deliveryMode && (
              <div>
                <span className="text-muted-foreground">Mode: </span>
                <span className="font-medium">{transfer.deliveryMode.replace(/_/g, " ").toLowerCase()}</span>
              </div>
            )}
            {transfer.vehicleNumber && (
              <div>
                <span className="text-muted-foreground">Vehicle: </span>
                <span className="font-mono font-medium">{transfer.vehicleNumber}</span>
                {transfer.vehicleType && <span className="ml-1 text-muted-foreground">({transfer.vehicleType.replace(/_/g, " ").toLowerCase()})</span>}
              </div>
            )}
            {transfer.driverName && (
              <div>
                <span className="text-muted-foreground">Driver: </span>
                <span className="font-medium">{transfer.driverName}</span>
                {transfer.driverPhone && <span className="ml-1 text-muted-foreground">({transfer.driverPhone})</span>}
              </div>
            )}
            {transfer.transporterName && (
              <div>
                <span className="text-muted-foreground">Transporter: </span>
                <span className="font-medium">{transfer.transporterName}</span>
              </div>
            )}
            {transfer.challanNumber && (
              <div>
                <span className="text-muted-foreground">Challan: </span>
                <span className="font-mono font-medium">{transfer.challanNumber}</span>
              </div>
            )}
            {transfer.packageCount != null && (
              <div>
                <span className="text-muted-foreground">Packages: </span>
                <span className="font-medium tnum">{transfer.packageCount}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dispatch / Receive timeline */}
      {(transfer.dispatchedAt || transfer.receivedAt) && (
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-label text-muted-foreground mb-2">Dispatch / Receive Timeline</div>
          <div className="space-y-2 text-body">
            {transfer.dispatchedAt && (
              <div className="flex items-center gap-2">
                <span className="inline-flex size-2 rounded-full bg-blue-500" />
                <span className="text-muted-foreground">Dispatched</span>
                <span className="font-medium">{formatDate(transfer.dispatchedAt)}</span>
                {transfer.dispatchedByName && <span className="text-muted-foreground">· {transfer.dispatchedByName}</span>}
              </div>
            )}
            {transfer.receivedAt && (
              <div className="flex items-center gap-2">
                <span className="inline-flex size-2 rounded-full bg-emerald-500" />
                <span className="text-muted-foreground">Received</span>
                <span className="font-medium">{formatDate(transfer.receivedAt)}</span>
                {transfer.receivedByName && <span className="text-muted-foreground">· {transfer.receivedByName}</span>}
              </div>
            )}
          </div>
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

      <AttachmentList entityType="StockTransfer" entityId={transfer.id} />

      {/* Actions for DRAFT transfers */}
      {transfer.status === "DRAFT" && (
        <div className="flex gap-2 border-t border-border pt-3">
          <Button variant="default" size="sm" onClick={() => setShowDispatch(true)} disabled={acting}>
            <Send className="h-4 w-4" /> Dispatch
          </Button>
          <Button variant="default" size="sm" onClick={() => setShowComplete(true)} disabled={acting}>
            <Check className="h-4 w-4" /> Complete Transfer
          </Button>
          <Button variant="outline" size="sm" onClick={() => doAction("cancel")} disabled={acting} className="text-muted-foreground hover:text-danger">
            <X className="h-4 w-4" /> Cancel
          </Button>
        </div>
      )}

      {/* Actions for IN_TRANSIT transfers */}
      {transfer.status === "IN_TRANSIT" && (
        <div className="flex gap-2 border-t border-border pt-3">
          <Button variant="default" size="sm" onClick={() => setShowComplete(true)} disabled={acting}>
            <Check className="h-4 w-4" /> Complete Transfer
          </Button>
          <Button variant="outline" size="sm" onClick={() => doAction("returnToSource")} disabled={acting} className="text-muted-foreground hover:text-warning">
            <Undo className="h-4 w-4" /> Return to Source
          </Button>
        </div>
      )}

      {/* Dispatch dialog with vehicle capture */}
      <Dialog
        open={showDispatch}
        onOpenChange={setShowDispatch}
        title="Dispatch Transfer"
        description="Capture vehicle and dispatch details for traceability."
        className="max-w-lg"
      >
        <div className="space-y-3">
          <VehicleCaptureSection value={vehicle} onChange={setVehicle} />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Challan Number</Label>
              <Input value={challanNumber} onChange={(e) => setChallanNumber(e.target.value)} placeholder="Optional" />
            </div>
            <div className="space-y-1.5">
              <Label>Package Count</Label>
              <Input type="number" value={packageCount} onChange={(e) => setPackageCount(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-border pt-3">
            <Button variant="outline" size="sm" onClick={() => setShowDispatch(false)}>Cancel</Button>
            <Button size="sm" onClick={handleDispatch} disabled={acting}>
              {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Dispatch
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Complete dialog with receive proof */}
      <Dialog
        open={showComplete}
        onOpenChange={setShowComplete}
        title="Complete Transfer"
        description="Confirm receipt and capture any delivery issues."
        className="max-w-lg"
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Delivery Mode</Label>
              <Select value={deliveryMode} onChange={(e) => setDeliveryMode(e.target.value)}>
                <option value="">—</option>
                <option value="ROAD">Road</option>
                <option value="HAND">Hand carry</option>
                <option value="OTHER">Other</option>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Shortage Remarks</Label>
            <Input value={shortageRemarks} onChange={(e) => setShortageRemarks(e.target.value)} placeholder="Any quantity shortages?" />
          </div>
          <div className="space-y-1.5">
            <Label>Damage Remarks</Label>
            <Input value={damageRemarks} onChange={(e) => setDamageRemarks(e.target.value)} placeholder="Any damage during transit?" />
          </div>
          <div className="flex justify-end gap-2 border-t border-border pt-3">
            <Button variant="outline" size="sm" onClick={() => setShowComplete(false)}>Cancel</Button>
            <Button size="sm" onClick={handleComplete} disabled={acting}>
              {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Confirm Receipt
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
