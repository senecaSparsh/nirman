"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Home, Pencil, ArrowRight, Hammer, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { BuiltUnitFormDialog } from "./built-unit-form-dialog";
import { UnitValuationDialog } from "./unit-valuation-dialog";
import { formatCurrency, formatNumber } from "@/lib/utils";
import type {
  BuiltUnitRow, BuiltUnitType, BuiltUnitStatus, ProjectOption,
} from "@/lib/types";

const STATUS_VARIANT: Record<BuiltUnitStatus, "default" | "success" | "warning" | "muted" | "danger"> = {
  PLANNED: "muted",
  UNDER_CONSTRUCTION: "warning",
  AVAILABLE: "success",
  HOLD: "default",
  SOLD: "danger",
};

const UNIT_TYPE_LABELS: Record<BuiltUnitType, string> = {
  BHK_1: "1 BHK",
  BHK_2: "2 BHK",
  BHK_3: "3 BHK",
  BHK_4: "4 BHK",
  SHOP: "Shop",
  OFFICE: "Office",
  WAREHOUSE_UNIT: "Warehouse Unit",
  OTHER: "Other",
};

const ALL_STATUSES: BuiltUnitStatus[] = ["PLANNED", "UNDER_CONSTRUCTION", "AVAILABLE", "HOLD", "SOLD"];
const ALL_TYPES: BuiltUnitType[] = ["BHK_1", "BHK_2", "BHK_3", "BHK_4", "SHOP", "OFFICE", "WAREHOUSE_UNIT", "OTHER"];

export function BuiltUnitsView({
  units,
  projects,
  permissions,
}: {
  units: BuiltUnitRow[];
  projects: ProjectOption[];
  permissions?: { canCreate?: boolean; canEdit?: boolean };
}) {
  const canCreate = permissions?.canCreate ?? true;
  const canEdit = permissions?.canEdit ?? true;
  const router = useRouter();
  const [projectFilter, setProjectFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [valuating, setValuating] = useState<BuiltUnitRow | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const filtered = useMemo(
    () => units.filter((u) => {
      if (projectFilter && u.projectId !== projectFilter) return false;
      if (statusFilter && u.status !== statusFilter) return false;
      if (typeFilter && u.unitType !== typeFilter) return false;
      return true;
    }),
    [units, projectFilter, statusFilter, typeFilter],
  );

  // Summary stats
  const totalCount = filtered.length;
  const availableCount = filtered.filter((u) => u.status === "AVAILABLE").length;
  const totalSellableArea = filtered.reduce((s, u) => s + u.area, 0);
  const totalAskingValue = filtered
    .filter((u) => u.askingPrice != null)
    .reduce((s, u) => s + (u.askingPrice as number), 0);

  async function changeStatus(unit: BuiltUnitRow, newStatus: BuiltUnitStatus) {
    setActingId(unit.id);
    try {
      const res = await fetch(`/api/built-units/${unit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "status", status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Status change failed");
      toast.success(`Unit ${unit.unitNumber} → ${newStatus.replace("_", " ")}`);
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Something went wrong");
    } finally {
      setActingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Built Units"
        description="Built units across projects — track construction status, valuation, and asking prices."
      />

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-caption text-muted-foreground">Total Units</p>
            <p className="tnum text-xl font-bold">{totalCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-caption text-muted-foreground">Available</p>
            <p className="tnum text-xl font-bold text-success">{availableCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-caption text-muted-foreground">Sellable Area</p>
            <p className="tnum text-xl font-bold">{formatNumber(totalSellableArea, 0)} <span className="text-caption font-normal text-muted-foreground">sqft</span></p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-caption text-muted-foreground">Asking Value</p>
            <p className="tnum text-xl font-bold">{formatCurrency(totalAskingValue)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters + New button */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row">
          <Select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className="sm:max-w-[200px]">
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="sm:max-w-[180px]">
            <option value="">All statuses</option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>{s.replace("_", " ")}</option>
            ))}
          </Select>
          <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="sm:max-w-[180px]">
            <option value="">All types</option>
            {ALL_TYPES.map((t) => (
              <option key={t} value={t}>{UNIT_TYPE_LABELS[t]}</option>
            ))}
          </Select>
        </div>
        {canCreate && (
          <Button onClick={() => setFormOpen(true)} disabled={projects.length === 0}>
            <Plus className="h-4 w-4" /> New Unit
          </Button>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <EmptyState
              icon={<Home className="h-5 w-5" />}
              title={units.length === 0 ? "No built units yet" : "No units match the filters"}
              description={
                units.length === 0
                  ? projects.length === 0
                    ? "Create a project first, then add built units."
                    : "Add your first built unit to start tracking inventory."
                  : "Try a different project, status, or type filter."
              }
              action={
                units.length === 0 && projects.length > 0 && canCreate ? (
                  <Button onClick={() => setFormOpen(true)} size="sm"><Plus className="h-4 w-4" /> New Unit</Button>
                ) : undefined
              }
            />
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Unit Number</TH>
                  <TH>Type</TH>
                  <TH>Project</TH>
                  <TH>Floor/Wing</TH>
                  <TH className="text-right">Area</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Production Cost</TH>
                  <TH className="text-right">Asking Price</TH>
                  <TH className="text-right">Valuation</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((u) => (
                  <TR key={u.id}>
                    <TD className="font-medium">{u.unitNumber}</TD>
                    <TD className="text-muted-foreground">{UNIT_TYPE_LABELS[u.unitType]}</TD>
                    <TD className="text-muted-foreground">
                      {u.projectName}
                      {u.phaseName && <span className="block text-caption text-muted-foreground/70">{u.phaseName}</span>}
                    </TD>
                    <TD className="text-muted-foreground">
                      {u.floor != null || u.wing
                        ? `${u.floor != null ? `Fl ${u.floor}` : ""}${u.floor != null && u.wing ? " · " : ""}${u.wing ?? ""}`
                        : "—"}
                    </TD>
                    <TD className="tnum text-right">{formatNumber(u.area, 0)} <span className="text-caption text-muted-foreground">{u.areaUnit}</span></TD>
                    <TD><Badge variant={STATUS_VARIANT[u.status]}>{u.status.replace("_", " ")}</Badge></TD>
                    <TD className="tnum text-right">{formatCurrency(u.productionCost)}</TD>
                    <TD className="tnum text-right">{u.askingPrice ? formatCurrency(u.askingPrice) : "—"}</TD>
                    <TD className="tnum text-right">{formatCurrency(u.currentValuation)}</TD>
                    <TD>
                      <div className="flex flex-wrap justify-end gap-1">
                        {/* Status transition buttons */}
                        {u.status === "PLANNED" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => changeStatus(u, "UNDER_CONSTRUCTION")}
                            disabled={actingId === u.id}
                          >
                            <Hammer className="h-3.5 w-3.5" /> Start
                          </Button>
                        )}
                        {u.status === "UNDER_CONSTRUCTION" && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => changeStatus(u, "AVAILABLE")}
                              disabled={actingId === u.id}
                            >
                              <ArrowRight className="h-3.5 w-3.5" /> Available
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => changeStatus(u, "PLANNED")}
                              disabled={actingId === u.id}
                            >
                              Revert
                            </Button>
                          </>
                        )}
                        {u.status === "AVAILABLE" && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => changeStatus(u, "HOLD")}
                              disabled={actingId === u.id}
                            >
                              <Pause className="h-3.5 w-3.5" /> Hold
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => changeStatus(u, "UNDER_CONSTRUCTION")}
                              disabled={actingId === u.id}
                            >
                              <Hammer className="h-3.5 w-3.5" /> Revert
                            </Button>
                          </>
                        )}
                        {u.status === "HOLD" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => changeStatus(u, "AVAILABLE")}
                            disabled={actingId === u.id}
                          >
                            <Play className="h-3.5 w-3.5" /> Release
                          </Button>
                        )}
                        {/* Edit valuation — available for non-sold units */}
                        {u.status !== "SOLD" && canEdit && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setValuating(u)}
                            disabled={actingId === u.id}
                          >
                            <Pencil className="h-3.5 w-3.5" /> Valuate
                          </Button>
                        )}
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <BuiltUnitFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        projects={projects}
      />

      <UnitValuationDialog
        open={valuating !== null}
        onOpenChange={(o) => !o && setValuating(null)}
        unit={valuating}
      />
    </div>
  );
}
