"use client";

import { useMemo, useState } from "react";
import { Plus, Search, Pencil, Trash2, Package, AlertTriangle, MapPin, Tags, Boxes, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/empty-state";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { MaterialFormDialog } from "./material-form-dialog";
import { CategoryFormDialog } from "./category-form-dialog";
import { LocationFormDialog } from "./location-form-dialog";
import { DepartmentFormDialog } from "./department-form-dialog";
import { formatCurrency, formatNumber } from "@/lib/utils";
import type { MaterialCategory, MaterialRow, ProjectOption, StockLocationRow, StockRow, LowStockRow, DepartmentRow } from "@/lib/types";

export function MaterialsView({
  materials,
  categories,
  locations,
  stock,
  lowStock,
  projects,
  departments,
  permissions,
}: {
  materials: MaterialRow[];
  categories: MaterialCategory[];
  locations: StockLocationRow[];
  stock: StockRow[];
  lowStock: LowStockRow[];
  projects: ProjectOption[];
  departments: DepartmentRow[];
  permissions?: { canCreate?: boolean; canEdit?: boolean; canDelete?: boolean };
}) {
  const [tab, setTab] = useState("catalog");
  const canCreate = permissions?.canCreate ?? true;
  const canEdit = permissions?.canEdit ?? true;
  const canDelete = permissions?.canDelete ?? true;

  return (
    <div className="space-y-5">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="catalog">
            <span className="flex items-center gap-1.5">
              <Package className="h-3.5 w-3.5" /> Catalog
            </span>
          </TabsTrigger>
          <TabsTrigger value="stock">
            <span className="flex items-center gap-1.5">
              <Boxes className="h-3.5 w-3.5" /> Stock by Location
            </span>
          </TabsTrigger>
          <TabsTrigger value="low-stock">
            <span className="flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" /> Low Stock
              {lowStock.length > 0 && (
                <Badge variant="danger" className="ml-1 px-1.5 py-0 text-micro">
                  {lowStock.length}
                </Badge>
              )}
            </span>
          </TabsTrigger>
          <TabsTrigger value="categories">
            <span className="flex items-center gap-1.5">
              <Tags className="h-3.5 w-3.5" /> Categories
            </span>
          </TabsTrigger>
          <TabsTrigger value="locations">
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" /> Locations
            </span>
          </TabsTrigger>
          <TabsTrigger value="departments">
            <span className="flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" /> Cost Centers
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="catalog">
          <CatalogTab materials={materials} categories={categories} canCreate={canCreate} canEdit={canEdit} canDelete={canDelete} />
        </TabsContent>
        <TabsContent value="stock">
          <StockTab stock={stock} locations={locations} />
        </TabsContent>
        <TabsContent value="low-stock">
          <LowStockTab lowStock={lowStock} />
        </TabsContent>
        <TabsContent value="categories">
          <CategoriesTab categories={categories} canCreate={canCreate} canEdit={canEdit} canDelete={canDelete} />
        </TabsContent>
        <TabsContent value="locations">
          <LocationsTab locations={locations} projects={projects} canCreate={canCreate} canEdit={canEdit} canDelete={canDelete} />
        </TabsContent>
        <TabsContent value="departments">
          <DepartmentsTab departments={departments} canCreate={canCreate} canEdit={canEdit} canDelete={canDelete} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Catalog tab
// ───────────────────────────────────────────────────────────

function CatalogTab({
  materials,
  categories,
  canCreate,
  canEdit,
  canDelete,
}: {
  materials: MaterialRow[];
  categories: MaterialCategory[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MaterialRow | null>(null);
  const [deleting, setDeleting] = useState<MaterialRow | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return materials.filter((m) => {
      if (categoryFilter && m.categoryId !== categoryFilter) return false;
      if (!q) return true;
      return m.name.toLowerCase().includes(q) || m.code.toLowerCase().includes(q);
    });
  }, [materials, query, categoryFilter]);

  const totalValue = filtered.reduce((s, m) => s + m.totalValue, 0);

  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(m: MaterialRow) {
    setEditing(m);
    setFormOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row">
          <div className="relative sm:max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or code…"
              className="pl-8"
            />
          </div>
          <Select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="sm:max-w-[200px]"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        {canCreate && (
          <Button onClick={openNew}>
            <Plus className="h-4 w-4" /> New Material
          </Button>
        )}
      </div>

      <div className="flex items-center gap-3 text-body text-muted-foreground">
        <span>{filtered.length} materials</span>
        <span>·</span>
        <span className="tnum">{formatCurrency(totalValue)}</span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Package className="h-5 w-5" />}
          title="No materials found"
          description={materials.length === 0 ? "Create your first material to get started." : "Try a different search or filter."}
          action={
            materials.length === 0 && canCreate ? (
              <Button onClick={openNew} size="sm">
                <Plus className="h-4 w-4" /> New Material
              </Button>
            ) : undefined
          }
        />
      ) : (
        /* ── Card grid — each material is a visual card with stock bar ──
           Not a table row. You see the stock level as a visual bar,
           low-stock as a red indicator, and value at a glance. */
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((m) => {
            // Stock level: 0-100% relative to minStock (if set) or max stock
            const stockPct = m.minStock
              ? Math.min(100, (m.totalQty / (m.minStock * 2)) * 100)
              : m.totalQty > 0 ? 100 : 0;
            return (
              <div
                key={m.id}
                className="group relative rounded-lg border border-border bg-card p-3.5 transition-all hover:border-foreground/20 hover:shadow-sm"
              >
                {/* Header: code + status dot */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono text-micro text-muted-foreground">{m.code}</div>
                    <div className="truncate text-body font-semibold text-foreground">{m.name}</div>
                  </div>
                  <span
                    className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                      m.lowStock ? "bg-danger" : m.totalQty > 0 ? "bg-success" : "bg-muted-foreground/30"
                    }`}
                  />
                </div>

                {/* Category */}
                <div className="mt-1 text-caption text-muted-foreground">{m.categoryName}</div>

                {/* Stock level bar */}
                <div className="mt-3">
                  <div className="mb-1 flex items-baseline justify-between">
                    <span className="text-caption text-muted-foreground">In stock</span>
                    <span className={`text-body font-semibold tnum ${m.lowStock ? "text-danger" : "text-foreground"}`}>
                      {formatNumber(m.totalQty, 2)} <span className="text-caption font-normal text-muted-foreground">{m.unit}</span>
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full transition-all ${
                        m.lowStock ? "bg-danger" : stockPct > 50 ? "bg-success" : stockPct > 0 ? "bg-warning" : "bg-muted-foreground/20"
                      }`}
                      style={{ width: `${stockPct}%` }}
                    />
                  </div>
                  {m.minStock && (
                    <div className="mt-0.5 text-micro text-muted-foreground">
                      min: {formatNumber(m.minStock, 0)} {m.unit}
                    </div>
                  )}
                </div>

                {/* Footer: value + actions */}
                <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2">
                  <span className="text-body font-semibold tnum text-foreground">{formatCurrency(m.totalValue)}</span>
                  <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    {canEdit && (
                      <button
                        onClick={() => openEdit(m)}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => setDeleting(m)}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-danger"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <MaterialFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        categories={categories}
        material={editing}
      />
      <DeleteConfirmDialog
        open={deleting != null}
        onOpenChange={(o) => !o && setDeleting(null)}
        endpoint={deleting ? `/api/materials/${deleting.id}` : ""}
        title="Delete material?"
        description={
          deleting
            ? `“${deleting.name}” will be archived. This is a soft delete — it can be restored later. Materials with stock on hand cannot be deleted.`
            : ""
        }
        successMessage="Material archived"
      />
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Stock by Location tab
// ───────────────────────────────────────────────────────────

function StockTab({ stock, locations }: { stock: StockRow[]; locations: StockLocationRow[] }) {
  const [locationFilter, setLocationFilter] = useState("");
  const filtered = useMemo(
    () => (locationFilter ? stock.filter((s) => s.locationId === locationFilter) : stock),
    [stock, locationFilter],
  );
  const totalValue = filtered.reduce((s, r) => s + r.value, 0);

  // Group by location
  const grouped = useMemo(() => {
    const map = new Map<string, { locationName: string; locationType: string; items: StockRow[] }>();
    for (const r of filtered) {
      let g = map.get(r.locationId);
      if (!g) {
        g = { locationName: r.locationName, locationType: r.locationType, items: [] };
        map.set(r.locationId, g);
      }
      g.items.push(r);
    }
    return Array.from(map.values());
  }, [filtered]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Select
          value={locationFilter}
          onChange={(e) => setLocationFilter(e.target.value)}
          className="sm:max-w-xs"
        >
          <option value="">All locations</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name} ({l.type === "COMPANY_WAREHOUSE" ? "Warehouse" : "Site"})
            </option>
          ))}
        </Select>
        <span className="text-body text-muted-foreground">
          {filtered.length} line item{filtered.length !== 1 ? "s" : ""} · {formatCurrency(totalValue)}
        </span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Boxes className="h-5 w-5" />}
          title="No stock recorded"
          description="Stock appears here once goods are received against purchase orders."
        />
      ) : (
        /* Grouped divided list — stock grouped by location, each location
           is a section with items listed below. Not a flat table. */
        <div className="space-y-4">
          {grouped.map((g) => {
            const locValue = g.items.reduce((s, r) => s + r.value, 0);
            return (
              <div key={g.locationName}>
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-label text-muted-foreground">{g.locationName}</span>
                  <Badge variant={g.locationType === "COMPANY_WAREHOUSE" ? "default" : "muted"} className="px-1.5 py-0 text-micro">
                    {g.locationType === "COMPANY_WAREHOUSE" ? "Warehouse" : "Site"}
                  </Badge>
                  <span className="ml-auto text-caption tnum text-muted-foreground">
                    {g.items.length} items · {formatCurrency(locValue)}
                  </span>
                </div>
                <div className="divide-y divide-border rounded-lg border border-border">
                  {g.items.map((r) => (
                    <div key={r.id} className="flex items-center gap-4 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-body font-medium text-foreground">{r.materialName}</div>
                        <div className="flex items-center gap-2 text-caption text-muted-foreground">
                          <span className="font-mono">{r.materialCode}</span>
                          <span>·</span>
                          <span>{r.categoryName}</span>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-body font-semibold tnum text-foreground">
                          {formatNumber(r.qty, 3)} <span className="text-caption font-normal text-muted-foreground">{r.unit}</span>
                        </div>
                        <div className="text-caption text-muted-foreground tnum">
                          MAC: {formatCurrency(r.mac)}
                        </div>
                      </div>
                      <div className="w-24 shrink-0 text-right">
                        <div className="text-body font-semibold tnum text-foreground">{formatCurrency(r.value)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Low Stock tab
// ───────────────────────────────────────────────────────────

function LowStockTab({ lowStock }: { lowStock: LowStockRow[] }) {
  return (
    <div className="space-y-4">
      {lowStock.length === 0 ? (
        <EmptyState
          icon={<AlertTriangle className="h-5 w-5" />}
          title="No low-stock alerts"
          description="Materials dropping below their minimum stock threshold will appear here."
        />
      ) : (
        /* Alert cards — each low-stock material is a card with a red left
           border and a visual bar showing current vs minimum stock. */
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lowStock.map((r) => {
            const stockPct = r.minStock > 0 ? Math.min(100, (r.totalQty / r.minStock) * 100) : 0;
            return (
              <div key={r.id} className="rounded-lg border border-border border-l-2 border-l-danger bg-card p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono text-micro text-muted-foreground">{r.code}</div>
                    <div className="truncate text-body font-semibold text-foreground">{r.name}</div>
                  </div>
                  <Badge variant="danger" className="shrink-0">
                    −{formatNumber(r.shortfall, 0)} {r.unit}
                  </Badge>
                </div>

                <div className="mt-1 text-caption text-muted-foreground">{r.categoryName}</div>

                {/* Stock vs min bar */}
                <div className="mt-3">
                  <div className="mb-1 flex items-baseline justify-between">
                    <span className="text-caption text-muted-foreground">Stock vs Min</span>
                    <span className="text-caption tnum text-muted-foreground">
                      {formatNumber(r.totalQty, 0)} / {formatNumber(r.minStock, 0)} {r.unit}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-danger" style={{ width: `${stockPct}%` }} />
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2">
                  <span className="text-caption text-muted-foreground">Est. reorder</span>
                  <span className="text-body font-semibold tnum text-foreground">
                    {formatCurrency(r.shortfall * r.standardCost)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Categories tab
// ───────────────────────────────────────────────────────────

function CategoriesTab({ categories, canCreate, canEdit, canDelete }: { categories: MaterialCategory[]; canCreate: boolean; canEdit: boolean; canDelete: boolean }) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MaterialCategory | null>(null);
  const [deleting, setDeleting] = useState<MaterialCategory | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-body text-muted-foreground">
          {categories.length} categor{categories.length !== 1 ? "ies" : "y"}
        </p>
        {canCreate && (
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> New Category
          </Button>
        )}
      </div>

      {categories.length === 0 ? (
        <EmptyState
          icon={<Tags className="h-5 w-5" />}
          title="No categories yet"
          description="Create categories to group your materials."
        />
      ) : (
        /* Chip grid — each category is a compact card showing name, unit,
           and material count. Edit/delete on hover. */
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {categories.map((c) => (
            <div key={c.id} className="group rounded-lg border border-border bg-card p-3.5 transition-all hover:border-foreground/20">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-body font-semibold text-foreground">{c.name}</div>
                  <div className="mt-0.5 text-caption text-muted-foreground">Unit: {c.unit}</div>
                </div>
                <Badge variant="muted" className="shrink-0">
                  {c._count?.materials ?? 0} materials
                </Badge>
              </div>
              <div className="mt-2 flex gap-0.5 border-t border-border/60 pt-2 opacity-0 transition-opacity group-hover:opacity-100">
                {canEdit && (
                  <button
                    onClick={() => { setEditing(c); setFormOpen(true); }}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Edit"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
                {canDelete && (
                  <button
                    onClick={() => setDeleting(c)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-danger"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <CategoryFormDialog open={formOpen} onOpenChange={setFormOpen} category={editing} />
      <DeleteConfirmDialog
        open={deleting != null}
        onOpenChange={(o) => !o && setDeleting(null)}
        endpoint={deleting ? `/api/material-categories/${deleting.id}` : ""}
        title="Delete category?"
        description={
          deleting
            ? `“${deleting.name}” will be archived. Categories with active materials cannot be deleted.`
            : ""
        }
        successMessage="Category archived"
      />
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Locations tab
// ───────────────────────────────────────────────────────────

function LocationsTab({
  locations,
  projects,
  canCreate,
  canEdit,
  canDelete,
}: {
  locations: StockLocationRow[];
  projects: ProjectOption[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<StockLocationRow | null>(null);
  const [deleting, setDeleting] = useState<StockLocationRow | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-body text-muted-foreground">
          {locations.length} location{locations.length !== 1 ? "s" : ""}
        </p>
        {canCreate && (
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> New Location
          </Button>
        )}
      </div>

      {locations.length === 0 ? (
        <EmptyState
          icon={<MapPin className="h-5 w-5" />}
          title="No stock locations yet"
          description="Add a company warehouse or a project site to start receiving stock."
        />
      ) : (
        /* Location cards — each location is a card showing type, project,
           address, item count, and stock value. Edit/delete on hover. */
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {locations.map((l) => (
            <div key={l.id} className="group rounded-lg border border-border bg-card p-3.5 transition-all hover:border-foreground/20">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-body font-semibold text-foreground">{l.name}</div>
                  {l.projectName && (
                    <div className="mt-0.5 text-caption text-muted-foreground">{l.projectName}</div>
                  )}
                </div>
                <Badge variant={l.type === "COMPANY_WAREHOUSE" ? "default" : "muted"} className="shrink-0">
                  {l.type === "COMPANY_WAREHOUSE" ? "Warehouse" : "Site"}
                </Badge>
              </div>

              {l.address && (
                <div className="mt-2 flex items-center gap-1 text-caption text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  <span className="truncate">{l.address}</span>
                </div>
              )}

              <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-body font-semibold tnum text-foreground">{l.itemCount}</span>
                  <span className="text-caption text-muted-foreground">items</span>
                </div>
                <span className="text-body font-semibold tnum text-foreground">{formatCurrency(l.stockValue)}</span>
              </div>

              <div className="mt-2 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                {canEdit && (
                  <button
                    onClick={() => { setEditing(l); setFormOpen(true); }}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Edit"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
                {canDelete && (
                  <button
                    onClick={() => setDeleting(l)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-danger"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <LocationFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        projects={projects}
        location={editing}
      />
      <DeleteConfirmDialog
        open={deleting != null}
        onOpenChange={(o) => !o && setDeleting(null)}
        endpoint={deleting ? `/api/stock-locations/${deleting.id}` : ""}
        title="Delete location?"
        description={
          deleting
            ? `“${deleting.name}” will be archived. Locations with stock on hand cannot be deleted.`
            : ""
        }
        successMessage="Location archived"
      />
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Departments / cost centers tab
// ───────────────────────────────────────────────────────────

function DepartmentsTab({
  departments,
  canCreate,
  canEdit,
  canDelete,
}: {
  departments: DepartmentRow[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DepartmentRow | null>(null);
  const [deleting, setDeleting] = useState<DepartmentRow | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-body text-muted-foreground">
          {departments.length} cost center{departments.length !== 1 ? "s" : ""}
        </p>
        {canCreate && (
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> New Cost Center
          </Button>
        )}
      </div>

      {departments.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-5 w-5" />}
          title="No cost centers yet"
          description="Add departments like Boiler, Dryer, MP-2, Workshop to track raw-material consumption by operational line."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {departments.map((d) => (
            <div key={d.id} className="group rounded-lg border border-border bg-card p-3.5 transition-all hover:border-foreground/20">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-mono text-micro text-muted-foreground">{d.code}</div>
                  <div className="truncate text-body font-semibold text-foreground">{d.name}</div>
                </div>
                <Badge variant={d.active ? "success" : "muted"} className="shrink-0">
                  {d.active ? "Active" : "Inactive"}
                </Badge>
              </div>

              {d.description && (
                <div className="mt-2 line-clamp-2 text-caption text-muted-foreground">{d.description}</div>
              )}

              <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-body font-semibold tnum text-foreground">{d.issueCount}</span>
                  <span className="text-caption text-muted-foreground">issues</span>
                </div>
                {d.stockLocationName && (
                  <span className="text-caption text-muted-foreground">{d.stockLocationName}</span>
                )}
              </div>

              <div className="mt-2 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                {canEdit && (
                  <button
                    onClick={() => { setEditing(d); setFormOpen(true); }}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Edit"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
                {canDelete && (
                  <button
                    onClick={() => setDeleting(d)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-danger"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <DepartmentFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        department={editing}
      />
      <DeleteConfirmDialog
        open={deleting != null}
        onOpenChange={(o) => !o && setDeleting(null)}
        endpoint={deleting ? `/api/departments/${deleting.id}` : ""}
        title="Delete cost center?"
        description={
          deleting
            ? `“${deleting.name}” will be archived. Cost centers with stock in their stock room cannot be deleted.`
            : ""
        }
        successMessage="Cost center archived"
      />
    </div>
  );
}
