"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Package, Truck, LandPlot, Home,
  Wallet, Wrench, ClipboardList, Building2, Layers,
  ArrowRightLeft, FileText, Users, Boxes,
} from "lucide-react";
import type { ModelKey } from "@/lib/modules/registry";

// Form dialogs — reused from management pages
import { MaterialFormDialog } from "@/components/materials/material-form-dialog";
import { CategoryFormDialog } from "@/components/materials/category-form-dialog";
import { LocationFormDialog } from "@/components/materials/location-form-dialog";
import { SupplierFormDialog } from "@/components/procurement/supplier-form-dialog";
import { PurchaseOrderFormDialog } from "@/components/procurement/purchase-order-form-dialog";
import { TransferFormDialog } from "@/components/procurement/transfer-form-dialog";
import { IssueFormDialog } from "@/components/procurement/issue-form-dialog";
import { ReceiveGoodsDialog } from "@/components/procurement/receive-goods-dialog";
import { LandPurchaseFormDialog } from "@/components/land/land-purchase-form-dialog";
import { BuiltUnitFormDialog } from "@/components/built-units/built-unit-form-dialog";
import { CustomerFormDialog } from "@/components/sales/customer-form-dialog";
import { PaymentDialog } from "@/components/sales/payment-dialog";
import { ProjectCostFormDialog } from "@/components/finance/project-cost-form-dialog";
import { ExpenseFormDialog } from "@/components/finance/expense-form-dialog";
import { EquipmentFormDialog } from "@/components/equipment/equipment-form-dialog";
import { AssignDialog } from "@/components/equipment/assign-dialog";
import { MaintenanceDialog } from "@/components/equipment/maintenance-dialog";
import { RequisitionFormDialog } from "@/components/requisitions/requisition-form-dialog";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";

import type {
  MaterialCategory, MaterialRow, StockLocationRow, SupplierRow, ProjectOption,
  StockLocationOption, MaterialOption, DepartmentOption,
} from "@/lib/types";

// ── Reference data types ──

export interface ReferenceData {
  projects: ProjectOption[];
  materials: MaterialRow[];
  materialOptions: MaterialOption[];
  locations: StockLocationRow[];
  locationOptions: StockLocationOption[];
  suppliers: SupplierRow[];
  categories: MaterialCategory[];
  phases: { id: string; name: string; projectId: string }[];
  subcontractors: { id: string; name: string; trade: string | null }[];
  departments: DepartmentOption[];
}

// ── Hook: fetch all reference data in parallel ──

export function useReferenceData(enabled: boolean): {
  data: ReferenceData | null;
  loading: boolean;
  refresh: () => void;
} {
  const [data, setData] = useState<ReferenceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    Promise.all([
      fetch("/api/projects").then((r) => r.json()),
      fetch("/api/materials").then((r) => r.json()),
      fetch("/api/stock-locations").then((r) => r.json()),
      fetch("/api/suppliers").then((r) => r.json()),
      fetch("/api/material-categories").then((r) => r.json()),
      fetch("/api/subcontractors").then((r) => r.json()),
      fetch("/api/departments").then((r) => r.json()),
    ])
      .then(async ([projects, materials, locations, suppliers, categories, subcontractors, departments]) => {
        const projectList: ProjectOption[] = (Array.isArray(projects) ? projects : []).map((p: Record<string, unknown>) => ({
          id: String(p.id), name: String(p.name ?? ""), type: String(p.type ?? ""), status: String(p.status ?? ""),
        }));
        // Fetch phases for each project (nested route)
        const phasesResults = await Promise.all(
          projectList.slice(0, 20).map((p) =>
            fetch(`/api/projects/${p.id}/phases`)
              .then((r) => r.json())
              .then((phases) => (Array.isArray(phases) ? phases : []).map((ph: Record<string, unknown>) => ({
                id: String(ph.id), name: String(ph.name ?? ""), projectId: String(p.id),
              })))
              .catch(() => [])
          ),
        );
        const allPhases = phasesResults.flat();

        const materialOptions: MaterialOption[] = (Array.isArray(materials) ? materials : []).map((m: MaterialRow) => ({
          id: m.id, code: m.code, name: m.name, unit: m.unit,
          standardCost: m.standardCost, gstRate: m.gstRate,
        }));
        const locationOptions: StockLocationOption[] = (Array.isArray(locations) ? locations : []).map((l: StockLocationRow) => ({
          id: l.id, type: l.type, name: l.name,
          projectId: l.projectId, projectName: l.projectName,
        }));
        setData({
          projects: projectList,
          materials: Array.isArray(materials) ? materials : [],
          materialOptions,
          locations: Array.isArray(locations) ? locations : [],
          locationOptions,
          suppliers: Array.isArray(suppliers) ? suppliers : [],
          categories: Array.isArray(categories) ? categories : [],
          phases: allPhases,
          subcontractors: Array.isArray(subcontractors) ? subcontractors : [],
          departments: (Array.isArray(departments) ? departments : []).map((d: Record<string, unknown>) => ({
            id: String(d.id), code: String(d.code ?? ""), name: String(d.name ?? ""),
          })),
        });
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [enabled, refreshKey]);

  return { data, loading, refresh };
}

// ── Action definitions per module ──

export interface ActionDef {
  label: string;
  icon: typeof Plus;
  dialog: "material" | "category" | "location" | "supplier" | "po" | "transfer" | "issue" | "land" | "unit" | "customer" | "cost" | "expense" | "equipment" | "requisition" | "project" | "payment" | "receipt" | "assignment" | "maintenance" | "count";
  /** When this action is scoped to a linked record, the field name to
   *  pre-fill in the dialog (e.g. "projectId" → the dialog opens with
   *  that project already selected). */
  defaultsKey?: string;
}

/** Default values to pre-fill in form dialogs when an action is scoped
 *  to a linked record. The key matches the form field name. */
export type ActionDefaults = Record<string, string>;

const MODULE_ACTIONS: Partial<Record<ModelKey, ActionDef[]>> = {
  Material: [
    { label: "New Material", icon: Package, dialog: "material" },
    { label: "New Category", icon: Layers, dialog: "category" },
  ],
  MaterialCategory: [
    { label: "New Category", icon: Layers, dialog: "category" },
  ],
  StockLocation: [
    { label: "New Location", icon: Boxes, dialog: "location" },
  ],
  Supplier: [
    { label: "New Supplier", icon: Truck, dialog: "supplier" },
  ],
  PurchaseOrder: [
    { label: "New Purchase Order", icon: Wallet, dialog: "po" },
    { label: "New Supplier", icon: Truck, dialog: "supplier" },
  ],
  StockTransfer: [
    { label: "New Transfer", icon: ArrowRightLeft, dialog: "transfer" },
  ],
  MaterialIssue: [
    { label: "Issue Materials", icon: Package, dialog: "issue" },
  ],
  LandPurchase: [
    { label: "New Land Purchase", icon: LandPlot, dialog: "land" },
  ],
  BuiltUnit: [
    { label: "New Built Unit", icon: Home, dialog: "unit" },
  ],
  Customer: [
    { label: "New Customer", icon: Users, dialog: "customer" },
  ],
  AssetSale: [
    { label: "New Customer", icon: Users, dialog: "customer" },
  ],
  ProjectCost: [
    { label: "Add Project Cost", icon: Wallet, dialog: "cost" },
  ],
  Expense: [
    { label: "Add Expense", icon: FileText, dialog: "expense" },
  ],
  Equipment: [
    { label: "New Equipment", icon: Wrench, dialog: "equipment" },
  ],
  MaterialRequisition: [
    { label: "New Requisition", icon: ClipboardList, dialog: "requisition" },
  ],
  Project: [
    { label: "New Project", icon: Building2, dialog: "project" },
  ],
  ProjectPhase: [
    { label: "New Project", icon: Building2, dialog: "project" },
  ],
};

// ── NodeActions component ──

export function NodeActions({
  model,
  referenceData,
  onRecordCreated,
  actions: actionsOverride,
  variant = "list",
  defaults,
}: {
  model: ModelKey;
  referenceData: ReferenceData | null;
  onRecordCreated: () => void;
  /** Override the default action list (from popup config). */
  actions?: ActionDef[];
  /** "list" = full-width buttons (tab content), "bar" = compact inline buttons (action bar). */
  variant?: "list" | "bar";
  /** Pre-fill values for scoped actions (e.g. { projectId: "abc" }
   *  when the action is on a linked Project node). */
  defaults?: ActionDefaults;
}) {
  const router = useRouter();
  const [openDialog, setOpenDialog] = useState<string | null>(null);
  const actions = actionsOverride ?? MODULE_ACTIONS[model] ?? [];

  const closeDialog = useCallback(() => {
    setOpenDialog(null);
    // Refresh reference data + records after a dialog closes
    onRecordCreated();
    router.refresh();
  }, [onRecordCreated, router]);

  if (actions.length === 0) {
    if (variant === "bar") return null;
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
        <Plus className="h-5 w-5 text-muted-foreground/40" />
        <p className="text-meta text-muted-foreground">
          No create actions available for this module.
        </p>
        <p className="text-caption text-muted-foreground/60">
          Use the management pages to manage this data.
        </p>
      </div>
    );
  }

  if (!referenceData) {
    if (variant === "bar") return null;
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-meta text-muted-foreground">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-primary" />
        Loading reference data…
      </div>
    );
  }

  const ref = referenceData;

  if (variant === "bar") {
    return (
      <>
        <div className="flex flex-wrap items-center gap-1.5">
          {actions.slice(0, 3).map((action) => (
            <button
              key={action.dialog}
              onClick={() => setOpenDialog(action.dialog)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-caption font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-accent"
            >
              {action.icon && <action.icon className="h-3.5 w-3.5" />} {action.label}
            </button>
          ))}
        </div>
        {renderDialogs(openDialog, closeDialog, ref, defaults)}
      </>
    );
  }

  return (
    <div className="space-y-3 p-3">
      <div className="space-y-1.5">
        {actions.map((action) => (
          <button
            key={action.dialog}
            onClick={() => setOpenDialog(action.dialog)}
            className="flex w-full items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5 text-left text-body transition-colors hover:border-primary/40 hover:bg-accent"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <action.icon className="h-4 w-4" />
            </span>
            <span className="flex-1 font-medium">{action.label}</span>
            <Plus className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        ))}
      </div>

      {/* Form Dialogs */}
      {renderDialogs(openDialog, closeDialog, ref, defaults)}
    </div>
  );
}

/** Shared dialog renderer — used by both the "list" and "bar" variants.
 *  `defaults` pre-fills form fields for scoped actions (e.g. when the
 *  action is triggered from a linked Project node, defaults.projectId
 *  is set so the dialog opens with that project already selected). */
function renderDialogs(
  openDialog: string | null,
  closeDialog: () => void,
  ref: ReferenceData,
  defaults?: ActionDefaults,
) {
  // Build a defaults object for each dialog type from the scoped defaults.
  // The key matches the form field name in the target dialog.
  const issueDefaults = defaults?.projectId ? { projectId: defaults.projectId } : undefined;
  const costDefaults = defaults?.projectId ? { projectId: defaults.projectId } : undefined;
  const unitDefaults = defaults?.projectId ? { projectId: defaults.projectId } : undefined;
  const expenseDefaults = defaults?.projectId ? { projectId: defaults.projectId } : undefined;
  const transferDefaults = defaults?.fromLocationId ? { fromLocationId: defaults.fromLocationId } : undefined;

  return (
    <>
      <MaterialFormDialog
        open={openDialog === "material"}
        onOpenChange={(o) => !o && closeDialog()}
        categories={ref.categories}
        material={null}
      />
      <CategoryFormDialog
        open={openDialog === "category"}
        onOpenChange={(o) => !o && closeDialog()}
        category={null}
      />
      <LocationFormDialog
        open={openDialog === "location"}
        onOpenChange={(o) => !o && closeDialog()}
        projects={ref.projects}
        location={null}
      />
      <SupplierFormDialog
        open={openDialog === "supplier"}
        onOpenChange={(o) => !o && closeDialog()}
        supplier={null}
      />
      <PurchaseOrderFormDialog
        open={openDialog === "po"}
        onOpenChange={(o) => !o && closeDialog()}
        suppliers={ref.suppliers}
        materials={ref.materials}
        locations={ref.locations}
        projects={ref.projects}
      />
      <TransferFormDialog
        open={openDialog === "transfer"}
        onOpenChange={(o) => !o && closeDialog()}
        locations={ref.locations}
        defaults={transferDefaults}
      />
      <IssueFormDialog
        open={openDialog === "issue"}
        onOpenChange={(o) => !o && closeDialog()}
        projects={ref.projects}
        locations={ref.locationOptions}
        materials={ref.materialOptions}
        departments={ref.departments}
        defaults={issueDefaults}
      />
      <LandPurchaseFormDialog
        open={openDialog === "land"}
        onOpenChange={(o) => !o && closeDialog()}
        projects={ref.projects}
      />
      <BuiltUnitFormDialog
        open={openDialog === "unit"}
        onOpenChange={(o) => !o && closeDialog()}
        projects={ref.projects}
        phases={ref.phases}
        defaults={unitDefaults}
      />
      <CustomerFormDialog
        open={openDialog === "customer"}
        onOpenChange={(o) => !o && closeDialog()}
        customer={null}
      />
      <ProjectCostFormDialog
        open={openDialog === "cost"}
        onOpenChange={(o) => !o && closeDialog()}
        projects={ref.projects}
        subcontractors={ref.subcontractors}
        defaults={costDefaults}
      />
      <ExpenseFormDialog
        open={openDialog === "expense"}
        onOpenChange={(o) => !o && closeDialog()}
        projects={ref.projects}
        defaults={expenseDefaults}
      />
      <EquipmentFormDialog
        open={openDialog === "equipment"}
        onOpenChange={(o) => !o && closeDialog()}
      />
      <RequisitionFormDialog
        open={openDialog === "requisition"}
        onOpenChange={(o) => !o && closeDialog()}
        projects={ref.projects}
        phases={ref.phases}
        materials={ref.materialOptions}
      />
      <ProjectFormDialog
        open={openDialog === "project"}
        onOpenChange={(o) => !o && closeDialog()}
      />
      {/* ── Scoped dialogs that require a parent record context ── */}
      {defaults?.assetSaleId && (
        <PaymentDialog
          open={openDialog === "payment"}
          onOpenChange={(o) => !o && closeDialog()}
          sale={null}
        />
      )}
      {defaults?.poId && (
        <ReceiveGoodsDialog
          open={openDialog === "receipt"}
          onOpenChange={(o) => !o && closeDialog()}
          po={null}
        />
      )}
      {defaults?.equipmentId && (
        <>
          <AssignDialog
            open={openDialog === "assignment"}
            onOpenChange={(o) => !o && closeDialog()}
            equipmentId={defaults.equipmentId}
            locations={ref.locations}
            projects={ref.projects}
          />
          <MaintenanceDialog
            open={openDialog === "maintenance"}
            onOpenChange={(o) => !o && closeDialog()}
            equipmentId={defaults.equipmentId}
          />
        </>
      )}
    </>
  );
}
