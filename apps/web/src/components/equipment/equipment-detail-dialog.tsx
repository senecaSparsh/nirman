"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Wrench, Check, Ban } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/utils";
import { AssignDialog } from "./assign-dialog";
import { MaintenanceDialog } from "./maintenance-dialog";
import type {
  EquipmentDetail, EquipmentRow, EquipmentStatus,
  StockLocationRow, ProjectOption,
} from "@/lib/types";

const STATUS_VARIANT: Record<EquipmentStatus, "default" | "success" | "warning" | "muted"> = {
  AVAILABLE: "success",
  ASSIGNED: "default",
  IN_MAINTENANCE: "warning",
  RETIRED: "muted",
};

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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equipment: EquipmentRow | null;
  locations: StockLocationRow[];
  projects: ProjectOption[];
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<EquipmentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [maintOpen, setMaintOpen] = useState(false);

  useEffect(() => {
    if (open && equipment) {
      setLoading(true);
      setDetail(null);
      fetch(`/api/equipment/${equipment.id}`)
        .then((r) => r.json())
        .then((d) => { if (!d.error) setDetail(d); })
        .finally(() => setLoading(false));
    }
  }, [open, equipment]);

  async function refetchDetail() {
    if (!equipment) return;
    const r = await fetch(`/api/equipment/${equipment.id}`);
    const d = await r.json();
    if (!d.error) setDetail(d);
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
      toast.success("Equipment returned");
      await refetchDetail();
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
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
      toast.success("Maintenance completed");
      await refetchDetail();
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
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
      await refetchDetail();
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setActing(false);
    }
  }

  if (!equipment) return null;

  const status = detail?.status ?? equipment.status;

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
              <Badge variant={STATUS_VARIANT[status] ?? "muted"}>{status.replace("_", " ")}</Badge>
              {detail.category && <Badge variant="outline">{detail.category}</Badge>}
            </div>

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
                  <Button size="sm" variant="outline" onClick={doRetire} disabled={acting} className="text-muted-foreground hover:text-danger">
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
                            <Badge variant={a.status === "ACTIVE" ? "success" : "muted"}>
                              {a.status}
                            </Badge>
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
        </>
      )}
    </>
  );
}
