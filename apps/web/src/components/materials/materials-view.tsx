"use client";

import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Search, Pencil, Trash2, Package, AlertTriangle, Tags, X, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/empty-state";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { EditableGrid, type EditableColumn } from "@/components/ui/editable-grid";
import { MaterialFormDialog } from "./material-form-dialog";
import { CategoryFormDialog } from "./category-form-dialog";
import { CsvImportDialog } from "./csv-import-dialog";
import { formatCurrency, formatNumber } from "@/lib/utils";
import type { MaterialCategory, MaterialRow, LowStockRow } from "@/lib/types";
import { useTabParam } from "@/lib/use-tab-param";

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
  const [tab, setTab] = useTabParam(["catalog","low-stock","categories"] as const, "catalog");
  const canCreate = permissions?.canCreate ?? false;
  const canEdit = permissions?.canEdit ?? false;
  const canDelete = permissions?.canDelete ?? false;

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
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<MaterialRow | null>(null);
  const [deleting, setDeleting] = useState<MaterialRow | null>(null);
  const [rows, setRows] = useState<MaterialRow[]>([]);
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);

  // "/" focuses the search bar (same shortcut as DataTable)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "SELECT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

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
      cols.push({ key: "categoryId", label: "Category", type: "select", options: categoryOptions, width: "150px", placeholder: "Select…", filterable: true, filterOptions: categoryOptions, filterValue: categoryFilter });
    } else {
      cols.push({ key: "categoryName", label: "Category", type: "readonly", width: "150px", filterable: true, filterOptions: categoryOptions, filterValue: categoryFilter });
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
  }, [canEdit, categoryOptions, categoryFilter]);

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
        <div className="relative min-w-40 flex-1 sm:max-w-64">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or code…"
            className="h-7 w-full rounded-md border border-input bg-card pl-7 pr-7 text-meta transition-[border-color,box-shadow] placeholder:text-faint focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/20"
          />
          {query ? (
            <button
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-faint hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          ) : (
            <kbd className="kbd absolute right-1.5 top-1/2 -translate-y-1/2">/</kbd>
          )}
        </div>
        {canCreate && (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4" /> Import CSV
            </Button>
            <Button onClick={openNew}>
              <Plus className="h-4 w-4" /> New Material
            </Button>
          </div>
        )}
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
              onFilterChange={(_key, value) => setCategoryFilter(value)}
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
      <CsvImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        categories={categories}
        onSuccess={() => router.refresh()}
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
  const columns: Column<LowStockRow>[] = [
    {
      key: "code",
      label: "Code",
      sortable: true,
      render: (r) => <span className="font-mono text-caption font-semibold text-foreground">{r.code}</span>,
    },
    {
      key: "name",
      label: "Material",
      sortable: true,
      render: (r) => (
        <div>
          <div className="font-medium text-foreground">{r.name}</div>
          <div className="text-caption text-muted-foreground">{r.categoryName}</div>
        </div>
      ),
    },
    {
      key: "totalQty",
      label: "In Stock",
      align: "right",
      sortable: true,
      render: (r) => <span className="tnum text-muted-foreground">{formatNumber(r.totalQty, 0)} {r.unit}</span>,
    },
    {
      key: "minStock",
      label: "Min",
      align: "right",
      sortable: true,
      render: (r) => <span className="tnum text-muted-foreground">{formatNumber(r.minStock, 0)} {r.unit}</span>,
    },
    {
      key: "shortfall",
      label: "Shortfall",
      align: "right",
      sortable: true,
      render: (r) => (
        <span className="tnum font-semibold text-danger">−{formatNumber(r.shortfall, 0)} {r.unit}</span>
      ),
    },
    {
      key: "reorderCost",
      label: "Est. Reorder",
      align: "right",
      sortable: true,
      sortValue: (r) => r.shortfall * r.standardCost,
      render: (r) => <span className="tnum font-medium">{formatCurrency(r.shortfall * r.standardCost)}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      {lowStock.length === 0 ? (
        <EmptyState
          icon={<AlertTriangle className="h-5 w-5" />}
          title="No low-stock alerts"
          description="Materials dropping below their minimum stock threshold will appear here."
        />
      ) : (
        /*
         * A low-stock list is a reorder worksheet, not a gallery of alert
         * cards. Cards hid the shortfall behind a progress bar; as rows,
         * "which material is shortest" is a sort, and "what will it cost
         * to refill" is a column total — the two questions a purchaser
         * opens this tab to answer.
         */
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
          <DataTable
            data={lowStock}
            columns={columns}
            storageKey="materials-low-stock"
            searchable
            searchPlaceholder="Search code, name, category…"
            hideable
            initialSort={{ key: "shortfall", direction: "desc" }}
            showTotals
            sumColumns={["shortfall", "reorderCost"]}
            totalFormat={(key, sum) =>
              key === "reorderCost" ? formatCurrency(sum) : formatNumber(sum, 0)
            }
            rowTone={() => "warning"}
          />
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
      {categories.length === 0 ? (
        <EmptyState
          icon={<Tags className="h-5 w-5" />}
          title="No categories yet"
          description="Create categories to group your materials."
          action={canCreate ? (
            <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
              <Plus className="size-4" /> New Category
            </Button>
          ) : undefined}
        />
      ) : (
        /*
         * A category list is a material-count comparison, not a chip grid.
         * As rows, "which category has the most materials" is a sort, and
         * the total count is a column sum.
         */
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
          <DataTable
            data={categories}
            columns={[
              {
                key: "name",
                label: "Category",
                sortable: true,
                render: (c) => <span className="font-medium text-foreground">{c.name}</span>,
              },
              {
                key: "unit",
                label: "Unit",
                sortable: true,
                render: (c) => <span className="text-muted-foreground">{c.unit}</span>,
              },
              {
                key: "materialCount",
                label: "Materials",
                align: "right",
                sortable: true,
                sortValue: (c) => c._count?.materials ?? 0,
                render: (c) => <span className="tnum text-muted-foreground">{c._count?.materials ?? 0}</span>,
              },
              ...(canEdit || canDelete
                ? [{
                    key: "actions" as const,
                    label: "" as const,
                    align: "right" as const,
                    render: (c: MaterialCategory) => (
                      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        {canEdit && (
                          <Button variant="ghost" size="icon-sm" title="Edit" onClick={() => { setEditing(c); setFormOpen(true); }}>
                            <Pencil className="size-3.5" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button variant="ghost" size="icon-sm" title="Delete" onClick={() => setDeleting(c)}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    ),
                  }]
                : []),
            ]}
            storageKey="materials-categories"
            searchable
            searchPlaceholder="Search category name…"
            initialSort={{ key: "name", direction: "asc" }}
            showTotals
            sumColumns={["materialCount"]}
            totalFormat={(_key, sum) => sum.toLocaleString("en-IN")}
            onAddRow={canCreate ? () => { setEditing(null); setFormOpen(true); } : undefined}
            addRowLabel="New Category"
          />
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
