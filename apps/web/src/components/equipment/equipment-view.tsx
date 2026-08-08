"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Wrench, Download, Pencil, Trash2, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
import { statusColor, MetricGrid, Metric } from "@/components/page";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { EquipmentFormDialog } from "./equipment-form-dialog";
import { EquipmentEditDialog } from "./equipment-edit-dialog";
import { EquipmentDetailDialog } from "./equipment-detail-dialog";
import { formatCurrency } from "@/lib/utils";
import { downloadCSV } from "@/lib/export";
import type {
  EquipmentRow, EquipmentStatus, StockLocationRow, ProjectOption,
} from "@/lib/types";

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
  const canEdit = permissions?.canEdit ?? true;
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EquipmentRow | null>(null);
  const [delTarget, setDelTarget] = useState<EquipmentRow | null>(null);
  const [selected, setSelected] = useState<EquipmentRow | null>(null);

  const filtered = useMemo(
    () => equipment.filter((e) => {
      if (statusFilter && e.status !== statusFilter) return false;
      if (categoryFilter && e.category !== categoryFilter) return false;
      if (query.trim()) {
        const q = query.toLowerCase();
        if (!e.name.toLowerCase().includes(q) &&
            !(e.assetTag ?? "").toLowerCase().includes(q) &&
            !(e.model ?? "").toLowerCase().includes(q) &&
            !(e.serialNumber ?? "").toLowerCase().includes(q)) {
          return false;
        }
      }
      return true;
    }),
    [equipment, statusFilter, categoryFilter, query],
  );

  const availableCount = equipment.filter((e) => e.status === "AVAILABLE").length;
  const assignedCount = equipment.filter((e) => e.status === "ASSIGNED").length;
  const maintenanceCount = equipment.filter((e) => e.status === "IN_MAINTENANCE").length;
  const totalCurrentValue = equipment.reduce((s, e) => s + e.currentValue, 0);

  // Group by status for the board
  const columns: { status: EquipmentStatus; label: string; items: EquipmentRow[] }[] = [
    { status: "AVAILABLE", label: "Available", items: filtered.filter((e) => e.status === "AVAILABLE") },
    { status: "ASSIGNED", label: "Assigned", items: filtered.filter((e) => e.status === "ASSIGNED") },
    { status: "IN_MAINTENANCE", label: "In Maintenance", items: filtered.filter((e) => e.status === "IN_MAINTENANCE") },
    { status: "RETIRED", label: "Retired", items: filtered.filter((e) => e.status === "RETIRED") },
  ];

  return (
    <div className="space-y-5">
      <MetricGrid cols={4}>
        <Metric label="Total Equipment" value={equipment.length} icon={<Wrench />} />
        <Metric label="Available" value={availableCount} tone="success" />
        <Metric label="Assigned" value={assignedCount} tone="brand" />
        <Metric label="In Maintenance" value={maintenanceCount} tone="warning" sub={formatCurrency(totalCurrentValue)} />
      </MetricGrid>

      {/* Filters + New button */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row">
          <div className="relative sm:max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, tag, model…" className="pl-8" />
          </div>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="sm:max-w-[180px]">
            <option value="">All statuses</option>
            <option value="AVAILABLE">Available</option>
            <option value="ASSIGNED">Assigned</option>
            <option value="IN_MAINTENANCE">In Maintenance</option>
            <option value="RETIRED">Retired</option>
          </Select>
          <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="sm:max-w-[180px]">
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => router.refresh()} title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
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
          {canCreate && equipment.length > 0 && (
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4" /> New Equipment
            </Button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Wrench className="h-5 w-5" />}
          title={equipment.length === 0 ? "No equipment yet" : "No items match the filters"}
          description={
            equipment.length === 0
              ? "Add your first piece of equipment to start tracking assignments and maintenance."
              : "Try a different category filter."
          }
          action={
            equipment.length === 0 && canCreate ? (
              <Button onClick={() => setFormOpen(true)} size="sm"><Plus className="h-4 w-4" /> New Equipment</Button>
            ) : undefined
          }
        />
      ) : (
        /* ── Status board — equipment grouped by status as columns ──
           Like a kanban for physical assets. You see at a glance
           what's available to deploy, what's in use, what's being
           repaired. Each card shows the asset tag, name, value,
           and assignment info. */
        <div className="flex gap-3 overflow-x-auto pb-2">
          {columns.map((col) => (
            <div key={col.status} className="flex w-72 shrink-0 flex-col">
              {/* Column header */}
              <div className="mb-2 flex items-center gap-2 px-1">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusColor(col.status) }} />
                <span className="text-label text-muted-foreground">{col.label}</span>
                <span className="ml-auto text-caption font-semibold tnum text-muted-foreground">{col.items.length}</span>
              </div>

              {/* Column body */}
              <div className="flex-1 space-y-2">
                {col.items.length === 0 && (
                  <div className="rounded-md border border-dashed border-border/60 py-6 text-center text-micro text-muted-foreground/50">
                    empty
                  </div>
                )}
                {col.items.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => setSelected(e)}
                    className="group block w-full rounded-lg border border-border bg-card p-3 text-left transition-all hover:border-foreground/20 hover:shadow-sm"
                  >
                    {/* Asset tag + edit/delete on hover */}
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-mono text-micro text-muted-foreground">{e.assetTag}</span>
                      <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        {canEdit && (
                          <span
                            role="button"
                            onClick={(ev) => { ev.stopPropagation(); setEditTarget(e); }}
                            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <Pencil className="h-3 w-3" />
                          </span>
                        )}
                        {canEdit && (
                          <span
                            role="button"
                            onClick={(ev) => { ev.stopPropagation(); setDelTarget(e); }}
                            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-danger"
                          >
                            <Trash2 className="h-3 w-3" />
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Name */}
                    <div className="mt-0.5 truncate text-body font-medium text-foreground">{e.name}</div>

                    {/* Category */}
                    {e.category && (
                      <div className="text-caption text-muted-foreground">{e.category}</div>
                    )}

                    {/* Value */}
                    <div className="mt-2 text-body font-semibold tnum text-foreground">{formatCurrency(e.currentValue)}</div>

                    {/* Assignment */}
                    {e.activeAssignment && (
                      <div className="mt-1.5 truncate text-caption text-muted-foreground">
                        → {e.activeAssignment.locationName}
                        {e.activeAssignment.projectName && ` · ${e.activeAssignment.projectName}`}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <EquipmentFormDialog open={formOpen} onOpenChange={setFormOpen} />
      {editTarget && (
        <EquipmentEditDialog
          open={Boolean(editTarget)}
          onOpenChange={(o) => { if (!o) setEditTarget(null); }}
          equipmentId={editTarget.id}
          initial={{
            name: editTarget.name,
            model: editTarget.model,
            serialNumber: editTarget.serialNumber,
            category: editTarget.category,
            notes: editTarget.notes,
          }}
        />
      )}
      {delTarget && (
        <DeleteConfirmDialog
          open={Boolean(delTarget)}
          onOpenChange={(o) => { if (!o) setDelTarget(null); }}
          endpoint={`/api/equipment/${delTarget.id}`}
          title="Delete equipment"
          description={`Delete “${delTarget.name}” (${delTarget.assetTag})? Assigned or in-maintenance equipment cannot be deleted.`}
          successMessage="Equipment deleted"
        />
      )}
      <EquipmentDetailDialog
        open={selected !== null}
        onOpenChange={(o) => { if (!o) setSelected(null); }}
        equipment={selected}
        locations={locations}
        projects={projects}
        permissions={permissions}
      />
    </div>
  );
}
