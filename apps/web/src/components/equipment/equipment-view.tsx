"use client";

import { useMemo, useState } from "react";
import { LayoutGrid, MapPin, Pencil, Plus, Rows3, Trash2, Wrench, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/tabs";
import { DataTable } from "@/components/ui/data-table";
import { IdentityCell, MoneyCell } from "@/components/ui/cells";
import { EmptyState } from "@/components/empty-state";
import {
  statusColor, StatusPill,
} from "@/components/page";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { EquipmentFormDialog } from "./equipment-form-dialog";
import { EquipmentEditDialog } from "./equipment-edit-dialog";
import { EquipmentDetailDialog } from "./equipment-detail-dialog";
import { formatCurrency } from "@/lib/utils";
import type {
  EquipmentRow, EquipmentStatus, StockLocationRow, ProjectOption,
} from "@/lib/types";

const CATEGORIES = ["Heavy Machinery", "Power Tool", "Vehicle", "Scaffolding", "Other"];

const STATUS_LABEL: Record<string, string> = {
  AVAILABLE: "Available",
  ASSIGNED: "Assigned",
  IN_MAINTENANCE: "In maintenance",
  RETIRED: "Retired",
};

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
  const canCreate = permissions?.canCreate ?? false;
  const canEdit = permissions?.canEdit ?? false;
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  /** Register first, board second — see the comment at the render site. */
  const [view, setView] = useState<"table" | "board">("table");
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EquipmentRow | null>(null);
  const [delTarget, setDelTarget] = useState<EquipmentRow | null>(null);
  const [selected, setSelected] = useState<EquipmentRow | null>(null);

  const filtered = useMemo(
    () => equipment.filter((e) => {
      if (statusFilter && e.status !== statusFilter) return false;
      if (categoryFilter && e.category !== categoryFilter) return false;
      return true;
    }),
    [equipment, statusFilter, categoryFilter],
  );

  // Group by status for the board
  const columns: { status: EquipmentStatus; label: string; items: EquipmentRow[] }[] = [
    { status: "AVAILABLE", label: "Available", items: filtered.filter((e) => e.status === "AVAILABLE") },
    { status: "ASSIGNED", label: "Assigned", items: filtered.filter((e) => e.status === "ASSIGNED") },
    { status: "IN_MAINTENANCE", label: "In Maintenance", items: filtered.filter((e) => e.status === "IN_MAINTENANCE") },
    { status: "RETIRED", label: "Retired", items: filtered.filter((e) => e.status === "RETIRED") },
  ];

  // Compact filter dropdowns for the toolbar
  const statusSelect = (
    <div className="relative shrink-0" style={{ width: 130 }}>
      <select
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value)}
        style={{ width: 130 }}
        className="h-8 shrink-0 appearance-none rounded-md border border-input bg-card pl-2.5 pr-7 text-[13px] text-foreground transition-[border-color,box-shadow] hover:border-border-strong focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/20"
      >
        <option value="">All statuses</option>
        <option value="AVAILABLE">Available</option>
        <option value="ASSIGNED">Assigned</option>
        <option value="IN_MAINTENANCE">In Maintenance</option>
        <option value="RETIRED">Retired</option>
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
    </div>
  );

  const categorySelect = (
    <div className="relative shrink-0" style={{ width: 140 }}>
      <select
        value={categoryFilter}
        onChange={(e) => setCategoryFilter(e.target.value)}
        style={{ width: 140 }}
        className="h-8 shrink-0 appearance-none rounded-md border border-input bg-card pl-2.5 pr-7 text-[13px] text-foreground transition-[border-color,box-shadow] hover:border-border-strong focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/20"
      >
        <option value="">All categories</option>
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
    </div>
  );

  const viewToggle = (
    <Segmented
      value={view}
      onChange={setView}
      options={[
        { value: "table", label: "Table", icon: <Rows3 /> },
        { value: "board", label: "Board", icon: <LayoutGrid /> },
      ]}
    />
  );

  return (
    <div className="space-y-5">
      {equipment.length === 0 ? (
        <EmptyState
          icon={<Wrench />}
          title="No equipment yet"
          description="Register a mixer, a hoist or a vehicle to start tracking where it is, who has it, and what it's still worth."
          action={
            canCreate ? (
              <Button onClick={() => setFormOpen(true)}>
                <Plus className="size-4" /> New equipment
              </Button>
            ) : undefined
          }
          contactHint="Ask a manager to register equipment."
        />
      ) : view === "table" ? (
        /*
         * The register is the default view. A board answers "what can I
         * deploy today"; it cannot answer "what is this fleet worth", "what
         * has depreciated hardest" or "which three machines have been idle
         * for a month" — and those are the questions that cost money.
         */
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
          <DataTable
            data={filtered}
            storageKey="equipment"
            searchable
            searchPlaceholder="Search name, tag, model, serial…"
            hideable
            freezeFirstColumn
            exportFileName="equipment"
            initialSort={{ key: "currentValue", direction: "desc" }}
            onRowClick={(e) => setSelected(e)}
            showTotals
            sumColumns={["acquisitionCost", "currentValue"]}
            totalFormat={(_k, sum) => formatCurrency(sum)}
            rowTone={(e) => (e.status === "IN_MAINTENANCE" ? "warning" : null)}
            groupBy={statusFilter ? null : { key: "status", label: (e) => STATUS_LABEL[e.status] ?? e.status }}
            onAddRow={canCreate ? () => setFormOpen(true) : undefined}
            addRowLabel="New Equipment"
            toolbarLeading={
              <div className="flex w-fit shrink-0 items-center gap-2">
                {viewToggle}
                {statusSelect}
                {categorySelect}
              </div>
            }
            rowActions={
              canEdit
                ? (e) => (
                    <>
                      <Button variant="ghost" size="icon-sm" title="Edit" onClick={() => setEditTarget(e)}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Delete"
                        className="hover:text-danger"
                        onClick={() => setDelTarget(e)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </>
                  )
                : undefined
            }
            columns={[
              {
                key: "name",
                label: "Equipment",
                sortable: true,
                width: "240px",
                render: (e) => (
                  <IdentityCell
                    name={e.name}
                    sub={[e.assetTag, e.model].filter(Boolean).join(" · ") || undefined}
                    dot={statusColor(e.status)}
                  />
                ),
              },
              { key: "category", label: "Category", sortable: true },
              {
                key: "status",
                label: "Status",
                sortable: true,
                render: (e) => <StatusPill status={e.status} />,
              },
              {
                key: "assignment",
                label: "Deployed to",
                sortable: true,
                hint: "Where the asset physically is right now, per its open assignment.",
                sortValue: (e) => e.activeAssignment?.locationName ?? "",
                render: (e) =>
                  e.activeAssignment ? (
                    <IdentityCell
                      name={e.activeAssignment.locationName}
                      sub={e.activeAssignment.projectName ?? undefined}
                      icon={<MapPin />}
                    />
                  ) : (
                    <span className="text-faint">In yard</span>
                  ),
              },
              { key: "serialNumber", label: "Serial", defaultHidden: true },
              {
                key: "acquisitionCost",
                label: "Bought for",
                align: "right",
                sortable: true,
                render: (e) => formatCurrency(e.acquisitionCost),
                exportValue: (e) => e.acquisitionCost,
              },
              {
                key: "currentValue",
                label: "Worth now",
                align: "right",
                sortable: true,
                bar: true,
                hint: "Written-down value after depreciation.",
                render: (e) => (
                  <MoneyCell
                    value={e.currentValue}
                    formatted={formatCurrency(e.currentValue)}
                    neutral
                    sub={
                      e.acquisitionCost > 0
                        ? `${((1 - e.currentValue / e.acquisitionCost) * 100).toFixed(0)}% down`
                        : undefined
                    }
                  />
                ),
                exportValue: (e) => e.currentValue,
              },
            ]}
            emptyState={
              <EmptyState
                size="compact"
                icon={<Wrench />}
                title="No equipment matches these filters"
                description="Clear the status or category filter to see the whole register."
              />
            }
          />
        </div>
      ) : (
        <>
          {/* Board view toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            {viewToggle}
            {statusSelect}
            {categorySelect}
            {canCreate && (
              <Button className="ml-auto" onClick={() => setFormOpen(true)}>
                <Plus className="size-4" /> New equipment
              </Button>
            )}
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              size="compact"
              icon={<Wrench />}
              title="No equipment matches these filters"
              description="Clear the status or category filter to see the whole register."
            />
          ) : (
            /* ── Status board — equipment grouped by status as columns ──
               Kept because it answers one question a table can't at a glance:
               "what is free to send to site this morning". */
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
        </>
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
