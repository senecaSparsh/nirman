"use client";

import { useMemo, useState } from "react";
import { Plus, Search, Pencil, Trash2, Package, AlertTriangle, MapPin, Tags, Boxes } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { MaterialFormDialog } from "./material-form-dialog";
import { CategoryFormDialog } from "./category-form-dialog";
import { LocationFormDialog } from "./location-form-dialog";
import { formatCurrency, formatNumber } from "@/lib/utils";
import type { MaterialCategory, MaterialRow, ProjectOption, StockLocationRow, StockRow, LowStockRow } from "@/lib/types";

export function MaterialsView({
  materials,
  categories,
  locations,
  stock,
  lowStock,
  projects,
  permissions,
}: {
  materials: MaterialRow[];
  categories: MaterialCategory[];
  locations: StockLocationRow[];
  stock: StockRow[];
  lowStock: LowStockRow[];
  projects: ProjectOption[];
  permissions?: { canCreate?: boolean; canEdit?: boolean; canDelete?: boolean };
}) {
  const [tab, setTab] = useState("catalog");
  const canCreate = permissions?.canCreate ?? true;
  const canEdit = permissions?.canEdit ?? true;
  const canDelete = permissions?.canDelete ?? true;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Material Inventory"
        description="Material catalog, stock by location, low-stock alerts, categories and stock locations."
      />

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
        <span>
          {filtered.length} material{filtered.length !== 1 ? "s" : ""}
        </span>
        <span>·</span>
        <span>Total stock value: {formatCurrency(totalValue)}</span>
      </div>

      <Card>
        <CardContent className="p-0">
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
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Code</TH>
                  <TH>Name</TH>
                  <TH>Category</TH>
                  <TH>Unit</TH>
                  <TH className="text-right">Std. Cost</TH>
                  <TH className="text-right">In Stock</TH>
                  <TH className="text-right">Stock Value</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((m) => (
                  <TR key={m.id}>
                    <TD className="font-mono text-caption">{m.code}</TD>
                    <TD className="font-medium">{m.name}</TD>
                    <TD className="text-muted-foreground">{m.categoryName}</TD>
                    <TD className="text-muted-foreground">{m.unit}</TD>
                    <TD className="tnum text-right">{formatCurrency(m.standardCost)}</TD>
                    <TD className="tnum text-right">{formatNumber(m.totalQty, 3)}</TD>
                    <TD className="tnum text-right">{formatCurrency(m.totalValue)}</TD>
                    <TD>
                      {m.lowStock ? (
                        <Badge variant="danger">Low</Badge>
                      ) : m.totalQty > 0 ? (
                        <Badge variant="success">In stock</Badge>
                      ) : (
                        <Badge variant="muted">No stock</Badge>
                      )}
                    </TD>
                    <TD className="text-right">
                      <div className="flex justify-end gap-1">
                        {canEdit && (
                          <Button variant="ghost" size="icon" onClick={() => openEdit(m)} title="Edit">
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleting(m)}
                            title="Delete"
                            className="text-muted-foreground hover:text-danger"
                          >
                            <Trash2 className="h-4 w-4" />
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

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <EmptyState
              icon={<Boxes className="h-5 w-5" />}
              title="No stock recorded"
              description="Stock appears here once goods are received against purchase orders."
            />
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Material</TH>
                  <TH>Code</TH>
                  <TH>Category</TH>
                  <TH>Location</TH>
                  <TH className="text-right">Qty</TH>
                  <TH className="text-right">MAC / unit</TH>
                  <TH className="text-right">Value</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((r) => (
                  <TR key={r.id}>
                    <TD className="font-medium">{r.materialName}</TD>
                    <TD className="font-mono text-caption text-muted-foreground">{r.materialCode}</TD>
                    <TD className="text-muted-foreground">{r.categoryName}</TD>
                    <TD>
                      <span className="flex items-center gap-1.5">
                        {r.locationName}
                        <Badge variant={r.locationType === "COMPANY_WAREHOUSE" ? "default" : "muted"} className="px-1.5 py-0 text-micro">
                          {r.locationType === "COMPANY_WAREHOUSE" ? "WH" : "Site"}
                        </Badge>
                      </span>
                    </TD>
                    <TD className="tnum text-right">
                      {formatNumber(r.qty, 3)} {r.unit}
                    </TD>
                    <TD className="tnum text-right">{formatCurrency(r.mac)}</TD>
                    <TD className="tnum text-right font-medium">{formatCurrency(r.value)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Low Stock tab
// ───────────────────────────────────────────────────────────

function LowStockTab({ lowStock }: { lowStock: LowStockRow[] }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-0">
          {lowStock.length === 0 ? (
            <EmptyState
              icon={<AlertTriangle className="h-5 w-5" />}
              title="No low-stock alerts"
              description="Materials dropping below their minimum stock threshold will appear here."
            />
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Code</TH>
                  <TH>Material</TH>
                  <TH>Category</TH>
                  <TH className="text-right">In Stock</TH>
                  <TH className="text-right">Min Stock</TH>
                  <TH className="text-right">Shortfall</TH>
                  <TH className="text-right">Est. Reorder Value</TH>
                </TR>
              </THead>
              <TBody>
                {lowStock.map((r) => (
                  <TR key={r.id}>
                    <TD className="font-mono text-caption">{r.code}</TD>
                    <TD className="font-medium">{r.name}</TD>
                    <TD className="text-muted-foreground">{r.categoryName}</TD>
                    <TD className="tnum text-right">
                      {formatNumber(r.totalQty, 3)} {r.unit}
                    </TD>
                    <TD className="tnum text-right">
                      {formatNumber(r.minStock, 3)} {r.unit}
                    </TD>
                    <TD className="text-right">
                      <Badge variant="danger">{formatNumber(r.shortfall, 3)} {r.unit}</Badge>
                    </TD>
                    <TD className="tnum text-right text-muted-foreground">
                      {formatCurrency(r.shortfall * r.standardCost)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
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

      <Card>
        <CardContent className="p-0">
          {categories.length === 0 ? (
            <EmptyState
              icon={<Tags className="h-5 w-5" />}
              title="No categories yet"
              description="Create categories to group your materials."
            />
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Name</TH>
                  <TH>Default Unit</TH>
                  <TH className="text-right">Materials</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {categories.map((c) => (
                  <TR key={c.id}>
                    <TD className="font-medium">{c.name}</TD>
                    <TD className="text-muted-foreground">{c.unit}</TD>
                    <TD className="tnum text-right">{c._count?.materials ?? 0}</TD>
                    <TD className="text-right">
                      <div className="flex justify-end gap-1">
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditing(c);
                              setFormOpen(true);
                            }}
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleting(c)}
                            title="Delete"
                            className="text-muted-foreground hover:text-danger"
                          >
                            <Trash2 className="h-4 w-4" />
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

      <Card>
        <CardContent className="p-0">
          {locations.length === 0 ? (
            <EmptyState
              icon={<MapPin className="h-5 w-5" />}
              title="No stock locations yet"
              description="Add a company warehouse or a project site to start receiving stock."
            />
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Name</TH>
                  <TH>Type</TH>
                  <TH>Project</TH>
                  <TH>Address</TH>
                  <TH className="text-right">Items</TH>
                  <TH className="text-right">Stock Value</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {locations.map((l) => (
                  <TR key={l.id}>
                    <TD className="font-medium">{l.name}</TD>
                    <TD>
                      <Badge variant={l.type === "COMPANY_WAREHOUSE" ? "default" : "muted"}>
                        {l.type === "COMPANY_WAREHOUSE" ? "Warehouse" : "Project Site"}
                      </Badge>
                    </TD>
                    <TD className="text-muted-foreground">{l.projectName ?? "—"}</TD>
                    <TD className="max-w-[240px] truncate text-muted-foreground">{l.address ?? "—"}</TD>
                    <TD className="tnum text-right">{l.itemCount}</TD>
                    <TD className="tnum text-right font-medium">{formatCurrency(l.stockValue)}</TD>
                    <TD className="text-right">
                      <div className="flex justify-end gap-1">
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditing(l);
                              setFormOpen(true);
                            }}
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleting(l)}
                            title="Delete"
                            className="text-muted-foreground hover:text-danger"
                          >
                            <Trash2 className="h-4 w-4" />
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
