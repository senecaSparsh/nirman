"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Search, Pencil, Trash2, Package, AlertTriangle, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/empty-state";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { EditableGrid, type EditableColumn } from "@/components/ui/editable-grid";
import { MaterialFormDialog } from "./material-form-dialog";
import { CategoryFormDialog } from "./category-form-dialog";
import { formatCurrency, formatNumber } from "@/lib/utils";
import type { MaterialCategory, MaterialRow, LowStockRow } from "@/lib/types";

export function MaterialsView({
  materials,
  categories,
  lowStock,
  permissions,
}: {
  materials: MaterialRow[];
  categories: MaterialCategory[];
  lowStock: LowStockRow[];
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
        </TabsList>

        <TabsContent value="catalog">
          <CatalogTab materials={materials} categories={categories} canCreate={canCreate} canEdit={canEdit} canDelete={canDelete} />
        </TabsContent>
        <TabsContent value="low-stock">
          <LowStockTab lowStock={lowStock} />
        </TabsContent>
        <TabsContent value="categories">
          <CategoriesTab categories={categories} canCreate={canCreate} canEdit={canEdit} canDelete={canDelete} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Catalog tab — spreadsheet-style inline editing via EditableGrid
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
  const [rows, setRows] = useState<MaterialRow[]>([]);
  const router = useRouter();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return materials.filter((m) => {
      if (categoryFilter && m.categoryId !== categoryFilter) return false;
      if (!q) return true;
      return m.name.toLowerCase().includes(q) || m.code.toLowerCase().includes(q);
    });
  }, [materials, query, categoryFilter]);

  // Sync local rows from server data whenever the filtered set changes
  useEffect(() => {
    setRows(filtered);
  }, [filtered]);

  const totalValue = filtered.reduce((s, m) => s + m.totalValue, 0);

  const categoryOptions = useMemo(
    () => categories.map((c) => ({ value: c.id, label: c.name })),
    [categories],
  );

  const columns = useMemo<EditableColumn<MaterialRow>[]>(() => {
    const cols: EditableColumn<MaterialRow>[] = [
      { key: "code", label: "Code", type: canEdit ? "text" : "readonly", width: "120px", placeholder: "CEM-OPC53" },
      { key: "name", label: "Name", type: canEdit ? "text" : "readonly", width: "1fr", placeholder: "Material name" },
    ];
    if (canEdit) {
      cols.push({ key: "categoryId", label: "Category", type: "select", options: categoryOptions, width: "150px", placeholder: "Select…" });
    } else {
      cols.push({ key: "categoryName", label: "Category", type: "readonly", width: "150px" });
    }
    cols.push(
      { key: "unit", label: "Unit", type: canEdit ? "text" : "readonly", width: "70px", placeholder: "NOS" },
      { key: "standardCost", label: "Std Cost", type: canEdit ? "number" : "readonly", step: "0.01", min: 0, width: "100px", align: "right", format: (v) => formatCurrency(v as number) },
      { key: "minStock", label: "Min Stock", type: canEdit ? "number" : "readonly", step: "0.001", min: 0, width: "90px", align: "right", placeholder: "—" },
      { key: "reorderPoint", label: "Reorder", type: canEdit ? "number" : "readonly", step: "0.001", min: 0, width: "90px", align: "right", placeholder: "—" },
      { key: "totalQty", label: "In Stock", type: "readonly", width: "90px", align: "right", format: (v) => formatNumber(v as number, 2) },
      { key: "totalValue", label: "Value", type: "readonly", width: "120px", align: "right", format: (v) => formatCurrency(v as number) },
      {
        key: "lowStock",
        label: "Status",
        type: "computed",
        width: "70px",
        compute: (row) => (row.lowStock ? "Low" : "OK"),
        cellClassName: (row) => (row.lowStock ? "text-danger font-semibold" : "text-muted-foreground"),
      },
    );
    return cols;
  }, [canEdit, categoryOptions]);

  // Save a material (PATCH existing or POST new) via the API
  const saveMaterial = useCallback(
    async (m: MaterialRow, isEdit: boolean) => {
      const payload = {
        code: m.code,
        name: m.name,
        categoryId: m.categoryId,
        unit: m.unit,
        hsnCode: m.hsnCode ?? null,
        gstRate: m.gstRate ?? 0,
        standardCost: m.standardCost ?? 0,
        minStock: m.minStock ?? null,
        reorderPoint: m.reorderPoint ?? null,
        economicOrderQty: m.economicOrderQty ?? null,
        volumetricDensity: m.volumetricDensity ?? null,
        bulkDiscountPct: m.bulkDiscountPct ?? null,
        isCorporateCommodity: m.isCorporateCommodity ?? false,
        description: m.description ?? null,
      };
      try {
        const res = await fetch(isEdit ? `/api/materials/${m.id}` : "/api/materials", {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to save material");
        toast.success(isEdit ? "Material updated" : "Material created");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Unknown error");
      }
    },
    [router],
  );

  // Handle grid edits — diff against previous rows to find what changed
  const handleChange = useCallback(
    (newRows: MaterialRow[]) => {
      const prevById = new Map(rows.map((r) => [r.id, r]));
      setRows(newRows);
      for (const newRow of newRows) {
        const prev = prevById.get(newRow.id);
        if (prev && JSON.stringify(prev) === JSON.stringify(newRow)) continue;
        const isNew = newRow.id.startsWith("new-");
        if (isNew) {
          // Only POST once required fields are filled
          if (newRow.code && newRow.name && newRow.categoryId && newRow.unit) {
            saveMaterial(newRow, false);
          }
        } else {
          saveMaterial(newRow, true);
        }
      }
    },
    [rows, saveMaterial],
  );

  function addRow() {
    setRows((r) => [
      ...r,
      {
        id: `new-${Date.now()}`,
        code: "",
        name: "",
        categoryId: null,
        categoryName: null,
        unit: "NOS",
        hsnCode: null,
        gstRate: 0,
        standardCost: 0,
        minStock: null,
        reorderPoint: null,
        economicOrderQty: null,
        volumetricDensity: null,
        bulkDiscountPct: null,
        isCorporateCommodity: false,
        description: null,
        totalQty: 0,
        totalValue: 0,
        lowStock: false,
      },
    ]);
  }

  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(m: MaterialRow) {
    setEditing(m);
    setFormOpen(true);
  }

  // Per-row action buttons (edit details / delete)
  const gridActions: {
    icon: React.ReactNode;
    title: string;
    onClick: (row: MaterialRow, index: number) => void;
    className?: string;
    show?: (row: MaterialRow) => boolean;
  }[] = [];
  if (canEdit) {
    gridActions.push({
      icon: <Pencil className="h-3.5 w-3.5" />,
      title: "Edit details",
      onClick: (r) => openEdit(r),
      show: (r) => !r.id.startsWith("new-"),
    });
  }
  if (canDelete) {
    gridActions.push({
      icon: <Trash2 className="h-3.5 w-3.5" />,
      title: "Delete",
      onClick: (r) => {
        if (r.id.startsWith("new-")) {
          setRows((prev) => prev.filter((x) => x.id !== r.id));
        } else {
          setDeleting(r);
        }
      },
      className: "hover:text-danger",
    });
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

      {filtered.length === 0 && rows.length === 0 ? (
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
        <>
          {/* ── Spreadsheet grid — inline-editable cells with keyboard nav,
                copy-paste from Excel, and per-row action buttons. ── */}
          <div className="rounded-lg border border-border overflow-hidden">
            <EditableGrid
              columns={columns}
              rows={rows}
              onChange={handleChange}
              getRowId={(m) => m.id}
              showTotals={false}
              actions={gridActions}
              className="max-h-[65vh]"
              emptyState={
                <EmptyState
                  icon={<Package className="h-5 w-5" />}
                  title="No materials found"
                  description="Try a different search or filter."
                />
              }
            />
          </div>

          {canEdit && (
            <Button variant="outline" size="sm" onClick={addRow} className="w-full border-dashed">
              <Plus className="h-4 w-4" /> Add row
            </Button>
          )}
        </>
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
