"use client";

import { useMemo, useState } from "react";
import { Plus, Wrench, Eye, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { EquipmentFormDialog } from "./equipment-form-dialog";
import { EquipmentDetailDialog } from "./equipment-detail-dialog";
import { formatCurrency } from "@/lib/utils";
import { downloadCSV } from "@/lib/export";
import type {
  EquipmentRow, EquipmentStatus, StockLocationRow, ProjectOption,
} from "@/lib/types";

const STATUS_VARIANT: Record<EquipmentStatus, "default" | "success" | "warning" | "muted"> = {
  AVAILABLE: "success",
  ASSIGNED: "default",
  IN_MAINTENANCE: "warning",
  RETIRED: "muted",
};

const CATEGORIES = ["Heavy Machinery", "Power Tool", "Vehicle", "Scaffolding", "Other"];

export function EquipmentView({
  equipment,
  locations,
  projects,
  permissions,
}: {
  equipment: EquipmentRow[];
  locations: StockLocationRow[];
  projects: ProjectOption[];
  permissions?: { canCreate?: boolean; canEdit?: boolean };
}) {
  const canCreate = permissions?.canCreate ?? true;
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [selected, setSelected] = useState<EquipmentRow | null>(null);

  const filtered = useMemo(
    () => equipment.filter((e) => {
      if (statusFilter && e.status !== statusFilter) return false;
      if (categoryFilter && e.category !== categoryFilter) return false;
      return true;
    }),
    [equipment, statusFilter, categoryFilter],
  );

  const availableCount = filtered.filter((e) => e.status === "AVAILABLE").length;
  const assignedCount = filtered.filter((e) => e.status === "ASSIGNED").length;
  const maintenanceCount = filtered.filter((e) => e.status === "IN_MAINTENANCE").length;
  const retiredCount = filtered.filter((e) => e.status === "RETIRED").length;
  const totalCurrentValue = filtered.reduce((s, e) => s + e.currentValue, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Equipment"
        description="Track discrete assets — machinery, tools, and vehicles. Manage assignments, maintenance, and retirement."
      />

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Card>
          <CardContent className="p-4">
            <p className="text-caption text-muted-foreground">Total Equipment</p>
            <p className="tnum text-2xl font-bold">{filtered.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-caption text-muted-foreground">Available</p>
            <p className="tnum text-2xl font-bold text-success">{availableCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-caption text-muted-foreground">Assigned</p>
            <p className="tnum text-2xl font-bold text-primary">{assignedCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-caption text-muted-foreground">In Maintenance</p>
            <p className="tnum text-2xl font-bold text-warning">{maintenanceCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-caption text-muted-foreground">Total Current Value</p>
            <p className="tnum text-2xl font-bold">{formatCurrency(totalCurrentValue)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters + New button */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="sm:max-w-[180px]">
            <option value="">All statuses</option>
            {(["AVAILABLE", "ASSIGNED", "IN_MAINTENANCE", "RETIRED"] as const).map((s) => (
              <option key={s} value={s}>{s.replace("_", " ")}</option>
            ))}
          </Select>
          <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="sm:max-w-[180px]">
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => downloadCSV(`equipment-${new Date().toISOString().slice(0,10)}.csv`, filtered as unknown as Record<string, unknown>[], [
            { key: "assetTag", label: "Asset Tag" },
            { key: "name", label: "Name" },
            { key: "model", label: "Model" },
            { key: "category", label: "Category" },
            { key: "status", label: "Status" },
            { key: "acquisitionCost", label: "Acquisition Cost", format: (v) => formatCurrency(Number(v)) },
            { key: "currentValue", label: "Current Value", format: (v) => formatCurrency(Number(v)) },
          ])} disabled={filtered.length === 0}>
            <Download className="h-4 w-4" /> Export
          </Button>
          {canCreate && (
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4" /> New Equipment
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 text-body text-muted-foreground">
        <span>{filtered.length} item{filtered.length !== 1 ? "s" : ""}</span>
        {retiredCount > 0 && (
          <>
            <span>·</span>
            <span>{retiredCount} retired</span>
          </>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <EmptyState
              icon={<Wrench className="h-5 w-5" />}
              title={equipment.length === 0 ? "No equipment yet" : "No items match the filters"}
              description={
                equipment.length === 0
                  ? "Add your first piece of equipment to start tracking assignments and maintenance."
                  : "Try a different status or category filter."
              }
              action={
                equipment.length === 0 && canCreate ? (
                  <Button onClick={() => setFormOpen(true)} size="sm"><Plus className="h-4 w-4" /> New Equipment</Button>
                ) : undefined
              }
            />
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Asset Tag</TH>
                  <TH>Name</TH>
                  <TH>Category</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Current Value</TH>
                  <TH>Assigned To</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((e) => (
                  <TR
                    key={e.id}
                    className="cursor-pointer"
                    onClick={() => setSelected(e)}
                  >
                    <TD className="font-mono text-caption">{e.assetTag}</TD>
                    <TD className="font-medium text-body">{e.name}</TD>
                    <TD className="text-body">{e.category ?? "—"}</TD>
                    <TD>
                      <Badge variant={STATUS_VARIANT[e.status]}>
                        {e.status.replace("_", " ")}
                      </Badge>
                    </TD>
                    <TD className="tnum text-right font-medium">{formatCurrency(e.currentValue)}</TD>
                    <TD>
                      {e.activeAssignment ? (
                        <span className="text-body">
                          {e.activeAssignment.locationName}
                          {e.activeAssignment.projectName ? ` · ${e.activeAssignment.projectName}` : ""}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TD>
                    <TD>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(ev) => { ev.stopPropagation(); setSelected(e); }}
                      >
                        <Eye className="h-4 w-4" /> Details
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <EquipmentFormDialog open={formOpen} onOpenChange={setFormOpen} />
      <EquipmentDetailDialog
        open={selected !== null}
        onOpenChange={(o) => { if (!o) setSelected(null); }}
        equipment={selected}
        locations={locations}
        projects={projects}
      />
    </div>
  );
}
