"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus, Trash2, LandPlot, Layers, Pause, Play, Pencil, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { LandPurchaseFormDialog } from "./land-purchase-form-dialog";
import { PartitionDialog } from "./partition-dialog";
import { ParcelValuationDialog } from "./parcel-valuation-dialog";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import type {
  LandPurchaseRow, LandParcelRow, LandParcelStatus, ProjectOption,
} from "@/lib/types";

const PARCEL_STATUS_VARIANT: Record<LandParcelStatus, "default" | "success" | "warning" | "muted" | "danger"> = {
  AVAILABLE: "success",
  HOLD: "warning",
  PARTITIONED: "muted",
  SOLD: "danger",
};

export function LandView({
  purchases,
  parcels,
  projects,
  permissions,
}: {
  purchases: LandPurchaseRow[];
  parcels: LandParcelRow[];
  projects: ProjectOption[];
  permissions?: { canCreate?: boolean; canEdit?: boolean; canPartition?: boolean };
}) {
  const canCreate = permissions?.canCreate ?? true;
  const canEdit = permissions?.canEdit ?? true;
  const canPartition = permissions?.canPartition ?? true;
  const [tab, setTab] = useState("purchases");
  const [purchaseFilter, setPurchaseFilter] = useState<string | null>(null);

  const totalArea = purchases.reduce((s, p) => s + p.totalArea, 0);
  const totalCost = purchases.reduce((s, p) => s + p.totalCost, 0);
  const availableParcels = parcels.filter((p) => p.status === "AVAILABLE").length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Land"
        description="Land purchases, parcels, and partitioning to create sellable sub-plots."
      />

      <div className="flex flex-wrap items-center gap-3 text-caption text-muted-foreground">
        <span>{purchases.length} purchase{purchases.length !== 1 ? "s" : ""}</span>
        <span>·</span>
        <span>{formatNumber(totalArea, 0)} total area</span>
        <span>·</span>
        <span>{formatCurrency(totalCost)} total cost</span>
        <span>·</span>
        <span>{availableParcels} parcel{availableParcels !== 1 ? "s" : ""} available</span>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="purchases">
            <span className="flex items-center gap-1.5"><LandPlot className="h-3.5 w-3.5" /> Land Purchases</span>
          </TabsTrigger>
          <TabsTrigger value="parcels">
            <span className="flex items-center gap-1.5"><Layers className="h-3.5 w-3.5" /> Parcels</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="purchases">
          <PurchasesTab
            purchases={purchases}
            parcels={parcels}
            projects={projects}
            canCreate={canCreate}
            canEdit={canEdit}
            purchaseFilter={purchaseFilter}
            onShowParcels={(purchaseId) => {
              setPurchaseFilter(purchaseId);
              setTab("parcels");
            }}
          />
        </TabsContent>
        <TabsContent value="parcels">
          <ParcelsTab
            parcels={parcels}
            purchases={purchases}
            canPartition={canPartition}
            purchaseFilter={purchaseFilter}
            onClearFilter={() => setPurchaseFilter(null)}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Land Purchases tab
// ───────────────────────────────────────────────────────────

function PurchasesTab({
  purchases,
  parcels,
  projects,
  canCreate,
  canEdit,
  onShowParcels,
}: {
  purchases: LandPurchaseRow[];
  parcels: LandParcelRow[];
  projects: ProjectOption[];
  canCreate: boolean;
  canEdit: boolean;
  purchaseFilter: string | null;
  onShowParcels: (purchaseId: string) => void;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<LandPurchaseRow | null>(null);
  const [deleting, setDeleting] = useState<LandPurchaseRow | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        {canCreate && (
          <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="h-4 w-4" /> New Purchase
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {purchases.length === 0 ? (
            <EmptyState
              icon={<LandPlot className="h-5 w-5" />}
              title="No land purchases yet"
              description="Record your first land purchase to start tracking land inventory. A purchase creates an initial parcel covering the full area."
              action={
                canCreate ? (
                  <Button onClick={() => { setEditing(null); setFormOpen(true); }} size="sm">
                    <Plus className="h-4 w-4" /> New Purchase
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Seller</TH>
                  <TH>Project</TH>
                  <TH className="text-right">Area</TH>
                  <TH className="text-right">Cost</TH>
                  <TH className="text-right">Cost / unit</TH>
                  <TH className="text-right">Parcels</TH>
                  <TH className="text-right">Available</TH>
                  <TH>Date</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {purchases.map((lp) => {
                  const costPerUnit = lp.totalArea > 0 ? lp.totalCost / lp.totalArea : 0;
                  return (
                    <TR
                      key={lp.id}
                      className="cursor-pointer"
                      onClick={() => onShowParcels(lp.id)}
                    >
                      <TD className="font-medium">{lp.sellerName}</TD>
                      <TD className="text-muted-foreground">{lp.projectName ?? "—"}</TD>
                      <TD className="tnum text-right">{formatNumber(lp.totalArea, 0)} {lp.areaUnit}</TD>
                      <TD className="tnum text-right font-medium">{formatCurrency(lp.totalCost)}</TD>
                      <TD className="tnum text-right text-muted-foreground">{formatCurrency(costPerUnit)}</TD>
                      <TD className="tnum text-right">{lp.parcelCount}</TD>
                      <TD className="tnum text-right">{formatNumber(lp.availableArea, 0)} {lp.areaUnit}</TD>
                      <TD className="text-muted-foreground">{formatDate(lp.purchaseDate)}</TD>
                      <TD className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => { e.stopPropagation(); onShowParcels(lp.id); }}
                            title="View parcels"
                          >
                            <ArrowRight className="h-4 w-4" />
                          </Button>
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => { e.stopPropagation(); setEditing(lp); setFormOpen(true); }}
                              title="Edit"
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => { e.stopPropagation(); setDeleting(lp); }}
                            title="Delete"
                            className="text-muted-foreground hover:text-danger"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <LandPurchaseFormDialog
        open={formOpen}
        onOpenChange={(o) => { setFormOpen(o); if (!o) setEditing(null); }}
        projects={projects}
        editing={editing}
      />

      <DeleteConfirmDialog
        open={deleting != null}
        onOpenChange={(o) => !o && setDeleting(null)}
        endpoint={deleting ? `/api/land-purchases/${deleting.id}` : ""}
        title="Delete land purchase?"
        description={deleting ? `"${deleting.sellerName}" will be archived. All parcels under this purchase will also be archived.` : ""}
        successMessage="Land purchase archived"
      />
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Parcels tab
// ───────────────────────────────────────────────────────────

function ParcelsTab({
  parcels,
  purchases,
  canPartition,
  purchaseFilter,
  onClearFilter,
}: {
  parcels: LandParcelRow[];
  purchases: LandPurchaseRow[];
  canPartition: boolean;
  purchaseFilter: string | null;
  onClearFilter: () => void;
}) {
  const [statusFilter, setStatusFilter] = useState("");
  const [partitionParcel, setPartitionParcel] = useState<LandParcelRow | null>(null);
  const [valuateParcel, setValuateParcel] = useState<LandParcelRow | null>(null);

  const filtered = useMemo(
    () => parcels.filter((p) => {
      if (purchaseFilter && p.landPurchaseId !== purchaseFilter) return false;
      if (statusFilter && p.status !== statusFilter) return false;
      return true;
    }),
    [parcels, purchaseFilter, statusFilter],
  );

  const filterPurchase = purchases.find((p) => p.id === purchaseFilter);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="sm:max-w-[180px]">
            <option value="">All statuses</option>
            <option value="AVAILABLE">Available</option>
            <option value="HOLD">Hold</option>
            <option value="PARTITIONED">Partitioned</option>
            <option value="SOLD">Sold</option>
          </Select>
          {filterPurchase && (
            <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-1.5 text-body">
              <span className="text-muted-foreground">Filtered by:</span>
              <span className="font-medium">{filterPurchase.sellerName}</span>
              <button
                type="button"
                className="text-muted-foreground transition-colors hover:text-foreground"
                onClick={onClearFilter}
                title="Clear filter"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 text-caption text-muted-foreground">
        <span>{filtered.length} parcel{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <EmptyState
              icon={<Layers className="h-5 w-5" />}
              title={parcels.length === 0 ? "No parcels yet" : "No parcels match the filters"}
              description={
                parcels.length === 0
                  ? "Record a land purchase to create the first parcel."
                  : "Try a different status filter or clear the purchase filter."
              }
            />
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Number</TH>
                  <TH>Parent</TH>
                  <TH className="text-right">Area</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Acquisition</TH>
                  <TH className="text-right">Asking</TH>
                  <TH className="text-right">Valuation</TH>
                  <TH>Project</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((p) => (
                  <ParcelRowItem
                    key={p.id}
                    parcel={p}
                    canPartition={canPartition}
                    onPartition={() => setPartitionParcel(p)}
                    onValuate={() => setValuateParcel(p)}
                  />
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <PartitionDialog
        open={partitionParcel != null}
        onOpenChange={(o) => !o && setPartitionParcel(null)}
        parcel={partitionParcel}
      />
      <ParcelValuationDialog
        open={valuateParcel != null}
        onOpenChange={(o) => !o && setValuateParcel(null)}
        parcel={valuateParcel}
      />
    </div>
  );
}

function ParcelRowItem({
  parcel,
  canPartition,
  onPartition,
  onValuate,
}: {
  parcel: LandParcelRow;
  canPartition: boolean;
  onPartition: () => void;
  onValuate: () => void;
}) {
  const router = useRouter();
  const [acting, setActing] = useState(false);

  async function toggleStatus() {
    setActing(true);
    try {
      const action = parcel.status === "AVAILABLE" ? "hold" : "release";
      const res = await fetch(`/api/land-parcels/${parcel.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Status change failed");
      toast.success(action === "hold" ? "Parcel put on hold" : "Parcel released");
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Something went wrong");
    } finally {
      setActing(false);
    }
  }

  return (
    <TR>
      <TD className="font-mono text-caption font-medium">{parcel.number}</TD>
      <TD className="text-muted-foreground">{parcel.parentParcelNumber ?? "—"}</TD>
      <TD className="tnum text-right">{formatNumber(parcel.area, 0)} {parcel.areaUnit}</TD>
      <TD><Badge variant={PARCEL_STATUS_VARIANT[parcel.status]}>{parcel.status}</Badge></TD>
      <TD className="tnum text-right">{formatCurrency(parcel.acquisitionCost)}</TD>
      <TD className="tnum text-right">{parcel.askingPrice ? formatCurrency(parcel.askingPrice) : "—"}</TD>
      <TD className="tnum text-right">{formatCurrency(parcel.currentValuation)}</TD>
      <TD className="text-muted-foreground">{parcel.projectName ?? "—"}</TD>
      <TD className="text-right">
        <div className="flex justify-end gap-1">
          {parcel.status === "AVAILABLE" && (
            <>
              {canPartition && (
                <Button variant="ghost" size="sm" onClick={onPartition} disabled={acting} title="Partition">
                  <Layers className="h-3.5 w-3.5" /> Partition
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={toggleStatus} disabled={acting} title="Put on hold">
                <Pause className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={onValuate} disabled={acting} title="Edit valuation">
                <Pencil className="h-4 w-4" />
              </Button>
            </>
          )}
          {parcel.status === "HOLD" && (
            <>
              <Button variant="ghost" size="icon" onClick={toggleStatus} disabled={acting} title="Release hold">
                <Play className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={onValuate} disabled={acting} title="Edit valuation">
                <Pencil className="h-4 w-4" />
              </Button>
            </>
          )}
          {(parcel.status === "PARTITIONED" || parcel.status === "SOLD") && (
            <Button variant="ghost" size="icon" onClick={onValuate} disabled={acting} title="Edit valuation">
              <Pencil className="h-4 w-4" />
            </Button>
          )}
        </div>
      </TD>
    </TR>
  );
}
