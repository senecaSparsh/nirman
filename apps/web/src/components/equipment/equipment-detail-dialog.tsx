"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Wrench, Check, Ban, Pencil, Trash2, RotateCcw } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/utils";
import { StatusPill } from "@/components/page";
import { AssignDialog } from "./assign-dialog";
import { MaintenanceDialog } from "./maintenance-dialog";
import { EquipmentEditDialog } from "./equipment-edit-dialog";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { AuditTrail } from "@/components/audit-trail";
import type {
  EquipmentDetail, EquipmentRow,
  StockLocationRow, ProjectOption,
} from "@/lib/types";

const MAINT_VARIANT: Record<string, "default" | "success" | "warning" | "muted" | "danger"> = {
  SCHEDULED: "default",
  REPAIR: "warning",
  INSPECTION: "muted",
};

export function EquipmentDetailDialog({
  open,
  onOpenChange,
  equipment,
  locations,
  projects,
  permissions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equipment: EquipmentRow | null;
  locations: StockLocationRow[];
  projects: ProjectOption[];
  permissions?: { canCreate?: boolean; canEdit?: boolean };
}) {
  const router = useRouter();
  const canEdit = permissions?.canEdit ?? true;
  const [detail, setDetail] = useState<EquipmentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [maintOpen, setMaintOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [retireOpen, setRetireOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);

  useEffect(() => {
    if (open && equipment) {
      setLoading(true);
      setDetail(null);
      fetch(`/api/equipment/${equipment.id}`)
        .then((r) => r.json())
        .then((d) => { if (!d.error) setDetail(d); })
        .catch(() => toast.error("Failed to load equipment details"))
        .finally(() => setLoading(false));
    }
  }, [open, equipment]);

  async function refetchDetail() {
    if (!equipment) return;
    try {
      const r = await fetch(`/api/equipment/${equipment.id}`);
      if (!r.ok) throw new Error("Failed to re-fetch equipment details");
      const d = await r.json();
      if (!d.error) setDetail(d);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    }
  }

  async function doReturn() {
    if (!detail) return;
    const activeAssignment = detail.assignments.find((a) => a.status === "ACTIVE");
    if (!activeAssignment) {
      toast.error("No active assignment found");
      return;
    }
    setActing(true);
    try {
      const res = await fetch(`/api/equipment-assignments/${activeAssignment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "return" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Return failed");
      toast.success("Equipment returned", {
        description: "It's back in the warehouse. Assign it to another project or schedule maintenance.",
        action: {
          label: "Assign Again",
          onClick: () => setAssignOpen(true),
        },
      });
      await refetchDetail();
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setActing(false);
    }
  }

  async function doCompleteMaintenance() {
    if (!equipment) return;
    setActing(true);
    try {
      const res = await fetch(`/api/equipment/${equipment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete-maintenance" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Complete maintenance failed");
      toast.success("Maintenance completed", {
        description: "Equipment is available again. Assign it to a project or site.",
        action: {
          label: "Assign",
          onClick: () => setAssignOpen(true),
        },
      });
      await refetchDetail();
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setActing(false);
    }
  }

  async function doRetire() {
    if (!equipment) return;
    setActing(true);
    try {
      const res = await fetch(`/api/equipment/${equipment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retire" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Retire failed");
      toast.success("Equipment retired");
      setRetireOpen(false);
      await refetchDetail();
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setActing(false);
    }
  }

  async function doUnretire() {
    if (!equipment) return;
    setActing(true);
    try {
      const res = await fetch(`/api/equipment/${equipment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unretire" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Un-retire failed");
      toast.success("Equipment restored to available");
      await refetchDetail();
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setActing(false);
    }
  }

  if (!equipment) return null;

  const status = detail?.status ?? equipment.status;

  // Smart maintenance alert: if last maintenance was >90 days ago (or never), suggest scheduling
  const completedMaint = detail?.maintenance.filter((m) => m.endDate) ?? [];
  const lastMaintDate = completedMaint.length > 0
    ? new Date(completedMaint[completedMaint.length - 1]!.endDate!)
    : null;
  const daysSinceMaint = lastMaintDate
    ? Math.floor((Date.now() - lastMaintDate.getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const maintDue = (status === "AVAILABLE" || status === "ASSIGNED") && (daysSinceMaint === null || daysSinceMaint > 90);

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title={equipment.assetTag}
        description={equipment.name}
        className="max-w-3xl"
      >
        {loading ? (
          <p className="py-10 text-center text-body text-muted-foreground">Loading…</p>
        ) : detail ? (
          <div className="space-y-3">
            {/* Status + meta */}
            <div className="flex flex-wrap items-center gap-3">
              <StatusPill status={status} />
              {detail.category && <Badge variant="outline">{detail.category}</Badge>}
            </div>

            {/* Maintenance due alert */}
            {maintDue && (
              <div className="flex items-center gap-3 rounded-lg border border-warning/30 bg-warning-soft/30 p-3">
                <Wrench className="h-4 w-4 shrink-0 text-warning" />
                <div className="min-w-0 flex-1">
                  <p className="text-body font-medium text-foreground">Maintenance due</p>
                  <p className="text-caption text-muted-foreground">
                    {daysSinceMaint === null
                      ? "No maintenance recorded yet. Schedule an inspection."
                      : `Last serviced ${daysSinceMaint} days ago. Consider scheduling maintenance.`}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setMaintOpen(true)}>
                  <Wrench className="h-4 w-4" /> Schedule
                </Button>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              {status === "AVAILABLE" && (
                <>
                  <Button size="sm" onClick={() => setAssignOpen(true)}>
                    <ArrowRight className="h-4 w-4" /> Assign
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setMaintOpen(true)}>
                    <Wrench className="h-4 w-4" /> Maintenance
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setRetireOpen(true)} disabled={acting} className="text-muted-foreground hover:text-danger">
                    <Ban className="h-4 w-4" /> Retire
                  </Button>
                </>
              )}
              {status === "ASSIGNED" && (
                <>
                  <Button size="sm" onClick={doReturn} disabled={acting}>
                    <ArrowRight className="h-4 w-4" /> Return
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setMaintOpen(true)}>
                    <Wrench className="h-4 w-4" /> Maintenance
                  </Button>
                </>
              )}
              {status === "IN_MAINTENANCE" && (
                <Button size="sm" onClick={doCompleteMaintenance} disabled={acting}>
                  <Check className="h-4 w-4" /> Complete Maintenance
                </Button>
              )}
              {status === "RETIRED" && (
                <Button size="sm" variant="outline" onClick={doUnretire} disabled={acting}>
                  <RotateCcw className="h-4 w-4" /> Restore to Available
                </Button>
              )}
              {canEdit && (
                <>
                  <Button size="sm" variant="ghost" onClick={() => setEditOpen(true)}>
                    <Pencil className="h-4 w-4" /> Edit
                  </Button>
                  <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-danger" onClick={() => setDelOpen(true)}>
                    <Trash2 className="h-4 w-4" /> Delete
                  </Button>
                </>
              )}
            </div>

            {/* Details grid */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg border border-border/60 p-4 text-body sm:grid-cols-3">
              <div>
                <span className="text-meta text-muted-foreground">Asset Tag</span>
                <p className="font-medium">{detail.assetTag}</p>
              </div>
              <div>
                <span className="text-meta text-muted-foreground">Name</span>
                <p className="font-medium">{detail.name}</p>
              </div>
              <div>
                <span className="text-meta text-muted-foreground">Model</span>
                <p className="font-medium">{detail.model ?? "—"}</p>
              </div>
              <div>
                <span className="text-meta text-muted-foreground">Serial Number</span>
                <p className="font-medium">{detail.serialNumber ?? "—"}</p>
              </div>
              <div>
                <span className="text-meta text-muted-foreground">Category</span>
                <p className="font-medium">{detail.category ?? "—"}</p>
              </div>
              <div>
                <span className="text-meta text-muted-foreground">Purchase Date</span>
                <p className="font-medium">{formatDate(detail.purchaseDate)}</p>
              </div>
              <div>
                <span className="text-meta text-muted-foreground">Acquisition Cost</span>
                <p className="tnum font-medium">{formatCurrency(detail.acquisitionCost)}</p>
              </div>
              <div>
                <span className="text-meta text-muted-foreground">Current Value</span>
                <p className="tnum font-medium">{formatCurrency(detail.currentValue)}</p>
              </div>
            </div>

            {/* Assignment history */}
            <div className="space-y-2">
              <p className="text-body font-medium">Assignment History</p>
              {detail.assignments.length === 0 ? (
                <p className="rounded-lg border border-border/60 p-4 text-center text-body text-muted-foreground">
                  No assignments yet.
                </p>
              ) : (
                <div className="rounded-lg border border-border/60">
                  <Table>
                    <THead>
                      <TR className="hover:bg-transparent">
                        <TH>Location</TH>
                        <TH>Project</TH>
                        <TH>Assigned At</TH>
                        <TH>Returned At</TH>
                        <TH>Status</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {detail.assignments.map((a) => (
                        <TR key={a.id}>
                          <TD className="font-medium">{a.locationName}</TD>
                          <TD>{a.projectName ?? "—"}</TD>
                          <TD>{formatDate(a.assignedAt)}</TD>
                          <TD>{formatDate(a.returnedAt)}</TD>
                          <TD>
                            <StatusPill status={a.status} />
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </div>
              )}
            </div>

            {/* Maintenance history */}
            <div className="space-y-2">
              <p className="text-body font-medium">Maintenance History</p>
              {detail.maintenance.length === 0 ? (
                <p className="rounded-lg border border-border/60 p-4 text-center text-body text-muted-foreground">
                  No maintenance records yet.
                </p>
              ) : (
                <div className="rounded-lg border border-border/60">
                  <Table>
                    <THead>
                      <TR className="hover:bg-transparent">
                        <TH>Type</TH>
                        <TH className="text-right">Cost</TH>
                        <TH>Vendor</TH>
                        <TH>Start Date</TH>
                        <TH>End Date</TH>
                        <TH>Notes</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {detail.maintenance.map((m) => (
                        <TR key={m.id}>
                          <TD>
                            <Badge variant={MAINT_VARIANT[m.type] ?? "muted"}>
                              {m.type.charAt(0) + m.type.slice(1).toLowerCase()}
                            </Badge>
                          </TD>
                          <TD className="tnum text-right">{formatCurrency(m.cost)}</TD>
                          <TD>{m.vendor ?? "—"}</TD>
                          <TD>{formatDate(m.startDate)}</TD>
                          <TD>{formatDate(m.endDate)}</TD>
                          <TD className="max-w-[200px] truncate text-muted-foreground">{m.notes ?? "—"}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </div>
              )}
            </div>

            {detail.notes && (
              <div className="rounded-lg bg-muted/50 p-3 text-body">
                <span className="font-medium">Notes: </span>{detail.notes}
              </div>
            )}

            <AuditTrail entityType="Equipment" entityId={detail.id} />
          </div>
        ) : (
          <p className="py-10 text-center text-body text-muted-foreground">Failed to load details.</p>
        )}
      </Dialog>

      {equipment && (
        <>
          <AssignDialog
            open={assignOpen}
            onOpenChange={setAssignOpen}
            equipmentId={equipment.id}
            locations={locations}
            projects={projects}
          />
          <MaintenanceDialog
            open={maintOpen}
            onOpenChange={setMaintOpen}
            equipmentId={equipment.id}
          />
          <EquipmentEditDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            equipmentId={equipment.id}
            initial={{
              name: detail?.name ?? equipment.name,
              model: detail?.model ?? equipment.model,
              serialNumber: detail?.serialNumber ?? equipment.serialNumber,
              category: detail?.category ?? equipment.category,
              notes: detail?.notes ?? equipment.notes,
            }}
          />
          <DeleteConfirmDialog
            open={delOpen}
            onOpenChange={setDelOpen}
            endpoint={`/api/equipment/${equipment.id}`}
            title="Delete equipment"
            description={`Delete “${equipment.name}” (${equipment.assetTag})? Assigned or in-maintenance equipment cannot be deleted.`}
            successMessage="Equipment deleted"
          />
          <Dialog
            open={retireOpen}
            onOpenChange={setRetireOpen}
            title="Retire equipment"
            description={`Retire “${equipment.name}”? A retired asset is removed from the available pool but kept on record. You can restore it later.`}
          >
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setRetireOpen(false)} disabled={acting}>
                Cancel
              </Button>
              <Button type="button" variant="destructive" onClick={doRetire} disabled={acting}>
                {acting ? "Retiring…" : "Retire"}
              </Button>
            </div>
          </Dialog>
        </>
      )}
    </>
  );
}
