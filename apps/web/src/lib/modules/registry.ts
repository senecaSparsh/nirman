import {
  Building2,
  Layers,
  Boxes,
  Package,
  MapPin,
  Truck,
  ClipboardList,
  ArrowLeftRight,
  ScanLine,
  Wrench,
  LandPlot,
  Home,
  ShoppingCart,
  Users,
  Receipt,
  Wallet,
  Hammer,
  UserCog,
  FileStack,
  History,
  BadgeIndianRupee,
  Info,
  PlayCircle,
  CheckCircle2,
  HelpCircle,
  HardHat,
  type LucideIcon,
} from "lucide-react";

// ───────────────────────────────────────────────────────────
//  Module registry — the single source of truth for the visual
//  playground. Every Prisma model that can appear as a draggable
//  node has an entry. Each entry drives:
//   - the palette (label / icon / group)
//   - valid-edge suggestions (relations)
//   - per-level table rendering (columns / displayField)
//   - the drill resolver (hops + soft-delete + company scope)
// ───────────────────────────────────────────────────────────

export type ModelKey =
  | "Company"
  | "Project"
  | "ProjectPhase"
  | "User"
  | "StockLocation"
  | "MaterialCategory"
  | "Material"
  | "Supplier"
  | "Subcontractor"
  | "PurchaseOrder"
  | "GoodsReceipt"
  | "MaterialRequisition"
  | "StockMovement"
  | "StockLocationItem"
  | "MaterialIssue"
  | "StockTransfer"
  | "StockCount"
  | "Equipment"
  | "EquipmentAssignment"
  | "EquipmentMaintenance"
  | "LandPurchase"
  | "LandParcel"
  | "BuiltUnit"
  | "Customer"
  | "AssetSale"
  | "AssetSalePayment"
  | "Expense"
  | "ProjectCost"
  | "SupplierReturn"
  | "AuditLog"
  | "Employee";

export type ModuleGroup = "Core" | "Inventory" | "Assets" | "Sales" | "Finance";

export type ColumnType = "text" | "currency" | "number" | "date" | "badge";

export interface ColumnDef {
  field: string; // may be dotted, e.g. "material.name"
  label: string;
  type?: ColumnType;
}

/** A single relational hop from one model to the next. */
export interface Hop {
  field: string; // Prisma relation field name on the current model
  toModel: string; // Prisma model name this hop lands on
  many: boolean; // to-many (array) vs to-one (object)
}

/** An outgoing drill relation from a module to a child module. */
export interface RelationDef {
  toModel: ModelKey;
  label: string; // edge label shown on canvas + drill button
  hops: Hop[]; // sequence of relation fields from parent -> child
}

/** Archetype — the semantic role of a module, drives popup shape. */
export type ModuleArchetype = "master" | "transactional" | "system";

/**
 * A scoped create-action: opens a form dialog pre-filled with the linked
 * parent record (e.g. "Issue materials" on a linked Project node pre-fills
 * the project). `defaultsKey` maps to a prop on the form dialog.
 */
export interface ScopedAction {
  label: string;
  /** Dialog key — matches the union in NodeActions. */
  dialog: "material" | "category" | "location" | "supplier" | "po" | "transfer" | "issue" | "land" | "unit" | "customer" | "cost" | "expense" | "equipment" | "requisition" | "project" | "payment" | "receipt" | "assignment" | "maintenance" | "count";
  /** Which field on the linked record to pre-fill (e.g. "projectId"). */
  defaultsKey?: string;
  icon?: LucideIcon;
}

/** Tab visibility flags — which tabs to show in the popup. */
export interface PopupTabs {
  overview: boolean;
  related: boolean;
  records: boolean;
  connections: boolean;
  files: boolean;
  activity: boolean;
}

export interface PopupConfig {
  archetype: ModuleArchetype;
  /** Deep link to the management page for a linked record. `(id) => "/projects/" + id`. */
  deepLink?: (recordId: string) => string;
  /** Create-actions available when the node is linked to a record (pre-filled). */
  scopedActions?: ScopedAction[];
  /** Create-actions available when the node is unlinked (generic). */
  unscopedActions?: ScopedAction[];
  /** Which tabs to show. Defaults derived from archetype if omitted. */
  tabs?: PopupTabs;
  /** Hide the link/unlink toggle (system/read-only models). */
  noLink?: boolean;
  /** Hide the files/attachments tab + upload (system models). */
  noFiles?: boolean;
}

export interface ModuleDef {
  key: ModelKey;
  label: string;
  group: ModuleGroup;
  icon: LucideIcon;
  softDelete: boolean;
  /** "company" = has companyId; "company-root" = is the Company itself; "global" = no company FK. */
  scope: "company" | "company-root" | "global";
  displayField: string; // may be dotted
  secondaryField?: string; // may be dotted
  columns: ColumnDef[];
  relations: RelationDef[];
  /** Popup configuration — drives the node detail panel shape. */
  popup?: PopupConfig;
}

/** Default tab sets per archetype. */
export const ARCHETYPE_TABS: Record<ModuleArchetype, PopupTabs> = {
  master: { overview: true, related: true, records: true, connections: true, files: true, activity: true },
  transactional: { overview: true, related: true, records: true, connections: true, files: true, activity: true },
  system: { overview: true, related: false, records: true, connections: true, files: false, activity: false },
};

/** Resolve the effective popup tabs for a module (config override > archetype default). */
export function popupTabsFor(model: ModelKey): PopupTabs {
  const mod = MODULES[model];
  if (mod?.popup?.tabs) return mod.popup.tabs;
  return ARCHETYPE_TABS[mod?.popup?.archetype ?? "master"];
}

/** Models that carry a `deletedAt` column (must be filtered in queries). */
export const SOFT_DELETE_MODELS = new Set<string>([
  "Company",
  "Project",
  "StockLocation",
  "MaterialCategory",
  "Material",
  "Supplier",
  "Subcontractor",
  "Equipment",
  "LandPurchase",
  "LandParcel",
  "BuiltUnit",
  "Customer",
  "Employee",
]);

/** Models that have a `companyId` foreign key (scoped to the active company). */
export const COMPANY_SCOPED_MODELS = new Set<string>([
  "Project",
  "StockLocation",
  "PurchaseOrder",
  "LandPurchase",
  "Equipment",
  "Expense",
  "SupplierReturn",
  "AssetSale",
  "Employee",
]);

export const MODULES: Record<ModelKey, ModuleDef> = {
  Company: {
    key: "Company",
    label: "Company",
    group: "Core",
    icon: Building2,
    softDelete: true,
    scope: "company-root",
    displayField: "name",
    secondaryField: "currency",
    popup: {
      archetype: "master",
      noLink: true,
      unscopedActions: [
        { label: "New Project", dialog: "project", icon: Layers },
      ],
      tabs: { overview: true, related: false, records: true, connections: true, files: true, activity: false },
    },
    columns: [
      { field: "name", label: "Name" },
      { field: "gstin", label: "GSTIN" },
      { field: "address", label: "Address" },
      { field: "createdAt", label: "Created", type: "date" },
    ],
    relations: [
      { toModel: "Project", label: "projects", hops: [{ field: "projects", toModel: "Project", many: true }] },
      { toModel: "StockLocation", label: "warehouses", hops: [{ field: "stockLocations", toModel: "StockLocation", many: true }] },
      { toModel: "PurchaseOrder", label: "purchase orders", hops: [{ field: "purchaseOrders", toModel: "PurchaseOrder", many: true }] },
      { toModel: "LandPurchase", label: "land purchases", hops: [{ field: "landPurchases", toModel: "LandPurchase", many: true }] },
      { toModel: "Equipment", label: "equipment", hops: [{ field: "equipment", toModel: "Equipment", many: true }] },
      { toModel: "Expense", label: "expenses", hops: [{ field: "expenses", toModel: "Expense", many: true }] },
      { toModel: "SupplierReturn", label: "supplier returns", hops: [{ field: "supplierReturns", toModel: "SupplierReturn", many: true }] },
      { toModel: "AssetSale", label: "asset sales", hops: [{ field: "assetSales", toModel: "AssetSale", many: true }] },
      { toModel: "Employee", label: "employees", hops: [{ field: "employees", toModel: "Employee", many: true }] },
    ],
  },

  Project: {
    key: "Project",
    label: "Project",
    group: "Core",
    icon: Layers,
    softDelete: true,
    scope: "company",
    displayField: "name",
    secondaryField: "status",
    popup: {
      archetype: "master",
      deepLink: (id) => `/projects/${id}`,
      scopedActions: [
        { label: "New Phase", dialog: "project", icon: Boxes },
        { label: "Issue Materials", dialog: "issue", defaultsKey: "projectId", icon: Package },
        { label: "Add Cost", dialog: "cost", defaultsKey: "projectId", icon: Wallet },
        { label: "New Built Unit", dialog: "unit", defaultsKey: "projectId", icon: Home },
      ],
      unscopedActions: [{ label: "New Project", dialog: "project", icon: Building2 }],
    },
    columns: [
      { field: "name", label: "Name" },
      { field: "type", label: "Type", type: "badge" },
      { field: "status", label: "Status", type: "badge" },
      { field: "totalBudget", label: "Budget", type: "currency" },
    ],
    relations: [
      { toModel: "ProjectPhase", label: "phases", hops: [{ field: "phases", toModel: "ProjectPhase", many: true }] },
      { toModel: "StockLocation", label: "site locations", hops: [{ field: "stockLocations", toModel: "StockLocation", many: true }] },
      { toModel: "PurchaseOrder", label: "purchase orders", hops: [{ field: "purchaseOrders", toModel: "PurchaseOrder", many: true }] },
      { toModel: "MaterialIssue", label: "material issues", hops: [{ field: "materialIssues", toModel: "MaterialIssue", many: true }] },
      { toModel: "MaterialRequisition", label: "requisitions", hops: [{ field: "materialRequisitions", toModel: "MaterialRequisition", many: true }] },
      { toModel: "LandPurchase", label: "land purchases", hops: [{ field: "landPurchases", toModel: "LandPurchase", many: true }] },
      { toModel: "LandParcel", label: "land parcels", hops: [{ field: "landParcels", toModel: "LandParcel", many: true }] },
      { toModel: "BuiltUnit", label: "built units", hops: [{ field: "builtUnits", toModel: "BuiltUnit", many: true }] },
      { toModel: "ProjectCost", label: "project costs", hops: [{ field: "projectCosts", toModel: "ProjectCost", many: true }] },
      { toModel: "Expense", label: "expenses", hops: [{ field: "expenses", toModel: "Expense", many: true }] },
      { toModel: "AssetSale", label: "asset sales", hops: [{ field: "assetSales", toModel: "AssetSale", many: true }] },
      {
        toModel: "Material",
        label: "materials (via issues)",
        hops: [
          { field: "materialIssues", toModel: "MaterialIssue", many: true },
          { field: "lines", toModel: "MaterialIssueLine", many: true },
          { field: "material", toModel: "Material", many: false },
        ],
      },
      {
        toModel: "Supplier",
        label: "suppliers (via POs)",
        hops: [
          { field: "purchaseOrders", toModel: "PurchaseOrder", many: true },
          { field: "supplier", toModel: "Supplier", many: false },
        ],
      },
    ],
  },

  ProjectPhase: {
    key: "ProjectPhase",
    label: "Project Phase",
    group: "Core",
    icon: Boxes,
    softDelete: false,
    scope: "global",
    displayField: "name",
    secondaryField: "status",
    popup: {
      archetype: "master",
      scopedActions: [{ label: "New Built Unit", dialog: "unit", defaultsKey: "phaseId", icon: Home }],
      unscopedActions: [{ label: "New Project", dialog: "project", icon: Building2 }],
    },
    columns: [
      { field: "name", label: "Name" },
      { field: "status", label: "Status", type: "badge" },
      { field: "budget", label: "Budget", type: "currency" },
    ],
    relations: [
      { toModel: "StockLocation", label: "locations", hops: [{ field: "stockLocations", toModel: "StockLocation", many: true }] },
      { toModel: "BuiltUnit", label: "built units", hops: [{ field: "builtUnits", toModel: "BuiltUnit", many: true }] },
      { toModel: "MaterialIssue", label: "material issues", hops: [{ field: "materialIssues", toModel: "MaterialIssue", many: true }] },
      { toModel: "MaterialRequisition", label: "requisitions", hops: [{ field: "materialRequisitions", toModel: "MaterialRequisition", many: true }] },
    ],
  },

  User: {
    key: "User",
    label: "User",
    group: "Core",
    icon: UserCog,
    softDelete: false,
    scope: "global",
    displayField: "name",
    secondaryField: "role",
    popup: {
      archetype: "system",
      deepLink: () => `/settings`,
      noLink: true,
      tabs: { overview: true, related: false, records: true, connections: true, files: false, activity: false },
    },
    columns: [
      { field: "name", label: "Name" },
      { field: "email", label: "Email" },
      { field: "role", label: "Role", type: "badge" },
    ],
    relations: [
      { toModel: "StockMovement", label: "stock movements", hops: [{ field: "stockMovements", toModel: "StockMovement", many: true }] },
      { toModel: "GoodsReceipt", label: "goods receipts", hops: [{ field: "goodsReceipts", toModel: "GoodsReceipt", many: true }] },
      { toModel: "MaterialIssue", label: "material issues", hops: [{ field: "materialIssues", toModel: "MaterialIssue", many: true }] },
      { toModel: "AuditLog", label: "audit logs", hops: [{ field: "auditLogs", toModel: "AuditLog", many: true }] },
    ],
  },

  Employee: {
    key: "Employee",
    label: "Employee",
    group: "Core",
    icon: HardHat,
    softDelete: true,
    scope: "company",
    displayField: "name",
    secondaryField: "trade",
    popup: {
      archetype: "master",
      deepLink: () => `/settings`,
    },
    columns: [
      { field: "name", label: "Name" },
      { field: "trade", label: "Trade", type: "badge" },
      { field: "phone", label: "Phone" },
      { field: "dailyRate", label: "Daily Rate", type: "currency" },
      { field: "active", label: "Active", type: "badge" },
    ],
    relations: [],
  },

  StockLocation: {
    key: "StockLocation",
    label: "Stock Location",
    group: "Inventory",
    icon: MapPin,
    softDelete: true,
    scope: "company",
    displayField: "name",
    secondaryField: "type",
    popup: {
      archetype: "master",
      deepLink: () => `/materials`,
      scopedActions: [
        { label: "New Transfer", dialog: "transfer", defaultsKey: "fromLocationId", icon: ArrowLeftRight },
        { label: "Stock Count", dialog: "count", defaultsKey: "locationId", icon: ScanLine },
      ],
      unscopedActions: [{ label: "New Location", dialog: "location", icon: MapPin }],
    },
    columns: [
      { field: "name", label: "Name" },
      { field: "type", label: "Type", type: "badge" },
      { field: "address", label: "Address" },
    ],
    relations: [
      { toModel: "StockLocationItem", label: "stock on hand", hops: [{ field: "stockItems", toModel: "StockLocationItem", many: true }] },
      { toModel: "PurchaseOrder", label: "purchase orders", hops: [{ field: "purchaseOrders", toModel: "PurchaseOrder", many: true }] },
      { toModel: "GoodsReceipt", label: "goods receipts", hops: [{ field: "goodsReceipts", toModel: "GoodsReceipt", many: true }] },
      { toModel: "MaterialIssue", label: "material issues", hops: [{ field: "materialIssues", toModel: "MaterialIssue", many: true }] },
      { toModel: "StockCount", label: "stock counts", hops: [{ field: "stockCounts", toModel: "StockCount", many: true }] },
      { toModel: "EquipmentAssignment", label: "equipment here", hops: [{ field: "equipmentAssignments", toModel: "EquipmentAssignment", many: true }] },
      { toModel: "SupplierReturn", label: "supplier returns", hops: [{ field: "supplierReturns", toModel: "SupplierReturn", many: true }] },
      { toModel: "StockMovement", label: "movements in", hops: [{ field: "stockMovementsTo", toModel: "StockMovement", many: true }] },
      { toModel: "StockTransfer", label: "transfers out", hops: [{ field: "stockTransfersFrom", toModel: "StockTransfer", many: true }] },
      {
        toModel: "Material",
        label: "materials (via stock)",
        hops: [
          { field: "stockItems", toModel: "StockLocationItem", many: true },
          { field: "material", toModel: "Material", many: false },
        ],
      },
    ],
  },

  MaterialCategory: {
    key: "MaterialCategory",
    label: "Material Category",
    group: "Inventory",
    icon: FileStack,
    softDelete: true,
    scope: "global",
    displayField: "name",
    secondaryField: "unit",
    popup: {
      archetype: "master",
      deepLink: () => `/materials`,
      scopedActions: [{ label: "New Material", dialog: "material", defaultsKey: "categoryId", icon: Package }],
      unscopedActions: [{ label: "New Category", dialog: "category", icon: FileStack }],
    },
    columns: [
      { field: "name", label: "Name" },
      { field: "class", label: "Class", type: "badge" },
      { field: "unit", label: "Unit" },
    ],
    relations: [
      { toModel: "Material", label: "materials", hops: [{ field: "materials", toModel: "Material", many: true }] },
    ],
  },

  Material: {
    key: "Material",
    label: "Material",
    group: "Inventory",
    icon: Package,
    softDelete: true,
    scope: "global",
    displayField: "name",
    secondaryField: "code",
    popup: {
      archetype: "master",
      deepLink: () => `/materials`,
      scopedActions: [
        { label: "New PO", dialog: "po", icon: ClipboardList },
        { label: "Adjust Stock", dialog: "count", icon: ScanLine },
      ],
      unscopedActions: [
        { label: "New Material", dialog: "material", icon: Package },
        { label: "New Category", dialog: "category", icon: FileStack },
      ],
    },
    columns: [
      { field: "code", label: "Code" },
      { field: "name", label: "Name" },
      { field: "unit", label: "Unit" },
      { field: "standardCost", label: "Std Cost", type: "currency" },
    ],
    relations: [
      { toModel: "StockLocationItem", label: "stock levels", hops: [{ field: "stockItems", toModel: "StockLocationItem", many: true }] },
      { toModel: "StockMovement", label: "stock movements", hops: [{ field: "stockMovements", toModel: "StockMovement", many: true }] },
      {
        toModel: "StockLocation",
        label: "locations (via stock)",
        hops: [
          { field: "stockItems", toModel: "StockLocationItem", many: true },
          { field: "location", toModel: "StockLocation", many: false },
        ],
      },
      {
        toModel: "PurchaseOrder",
        label: "purchase orders (via lines)",
        hops: [
          { field: "purchaseOrderLines", toModel: "PurchaseOrderLine", many: true },
          { field: "purchaseOrder", toModel: "PurchaseOrder", many: false },
        ],
      },
      {
        toModel: "GoodsReceipt",
        label: "goods receipts (via lines)",
        hops: [
          { field: "goodsReceiptLines", toModel: "GoodsReceiptLine", many: true },
          { field: "goodsReceipt", toModel: "GoodsReceipt", many: false },
        ],
      },
      {
        toModel: "MaterialIssue",
        label: "material issues (via lines)",
        hops: [
          { field: "materialIssueLines", toModel: "MaterialIssueLine", many: true },
          { field: "materialIssue", toModel: "MaterialIssue", many: false },
        ],
      },
      {
        toModel: "MaterialRequisition",
        label: "requisitions (via lines)",
        hops: [
          { field: "requisitionLines", toModel: "MaterialRequisitionLine", many: true },
          { field: "requisition", toModel: "MaterialRequisition", many: false },
        ],
      },
      { toModel: "MaterialCategory", label: "category", hops: [{ field: "category", toModel: "MaterialCategory", many: false }] },
    ],
  },

  Supplier: {
    key: "Supplier",
    label: "Supplier",
    group: "Inventory",
    icon: Truck,
    softDelete: true,
    scope: "global",
    displayField: "name",
    secondaryField: "gstin",
    popup: {
      archetype: "master",
      deepLink: () => `/procurement`,
      scopedActions: [
        { label: "New PO", dialog: "po", defaultsKey: "supplierId", icon: ClipboardList },
        { label: "New Return", dialog: "supplier", icon: ArrowLeftRight },
      ],
      unscopedActions: [{ label: "New Supplier", dialog: "supplier", icon: Truck }],
    },
    columns: [
      { field: "name", label: "Name" },
      { field: "phone", label: "Phone" },
      { field: "balanceOwed", label: "Balance Owed", type: "currency" },
    ],
    relations: [
      { toModel: "PurchaseOrder", label: "purchase orders", hops: [{ field: "purchaseOrders", toModel: "PurchaseOrder", many: true }] },
      { toModel: "SupplierReturn", label: "supplier returns", hops: [{ field: "supplierReturns", toModel: "SupplierReturn", many: true }] },
      {
        toModel: "Material",
        label: "materials supplied (via POs)",
        hops: [
          { field: "purchaseOrders", toModel: "PurchaseOrder", many: true },
          { field: "lines", toModel: "PurchaseOrderLine", many: true },
          { field: "material", toModel: "Material", many: false },
        ],
      },
    ],
  },

  Subcontractor: {
    key: "Subcontractor",
    label: "Subcontractor",
    group: "Inventory",
    icon: Hammer,
    softDelete: true,
    scope: "global",
    displayField: "name",
    secondaryField: "trade",
    popup: {
      archetype: "master",
      deepLink: () => `/procurement`,
      scopedActions: [
        { label: "Issue Materials", dialog: "issue", icon: Package },
        { label: "Add Cost", dialog: "cost", icon: Wallet },
      ],
    },
    columns: [
      { field: "name", label: "Name" },
      { field: "trade", label: "Trade", type: "badge" },
      { field: "phone", label: "Phone" },
    ],
    relations: [
      { toModel: "MaterialIssue", label: "material issues", hops: [{ field: "materialIssues", toModel: "MaterialIssue", many: true }] },
      { toModel: "ProjectCost", label: "project costs", hops: [{ field: "projectCosts", toModel: "ProjectCost", many: true }] },
    ],
  },

  PurchaseOrder: {
    key: "PurchaseOrder",
    label: "Purchase Order",
    group: "Inventory",
    icon: ClipboardList,
    softDelete: false,
    scope: "company",
    displayField: "poNumber",
    secondaryField: "status",
    popup: {
      archetype: "transactional",
      deepLink: () => `/procurement`,
      scopedActions: [
        { label: "Receive", dialog: "receipt", defaultsKey: "purchaseOrderId", icon: ScanLine },
      ],
      unscopedActions: [
        { label: "New PO", dialog: "po", icon: ClipboardList },
        { label: "New Supplier", dialog: "supplier", icon: Truck },
      ],
    },
    columns: [
      { field: "poNumber", label: "PO #" },
      { field: "status", label: "Status", type: "badge" },
      { field: "total", label: "Total", type: "currency" },
      { field: "orderDate", label: "Ordered", type: "date" },
    ],
    relations: [
      { toModel: "GoodsReceipt", label: "goods receipts", hops: [{ field: "goodsReceipts", toModel: "GoodsReceipt", many: true }] },
      { toModel: "Supplier", label: "supplier", hops: [{ field: "supplier", toModel: "Supplier", many: false }] },
      {
        toModel: "Material",
        label: "materials (via lines)",
        hops: [
          { field: "lines", toModel: "PurchaseOrderLine", many: true },
          { field: "material", toModel: "Material", many: false },
        ],
      },
    ],
  },

  GoodsReceipt: {
    key: "GoodsReceipt",
    label: "Goods Receipt",
    group: "Inventory",
    icon: ScanLine,
    softDelete: false,
    scope: "global",
    displayField: "receiptDate",
    secondaryField: "inspectionStatus",
    popup: {
      archetype: "transactional",
      deepLink: () => `/procurement`,
      unscopedActions: [{ label: "New Receipt", dialog: "receipt", icon: ScanLine }],
    },
    columns: [
      { field: "receiptDate", label: "Received", type: "date" },
      { field: "inspectionStatus", label: "Inspection", type: "badge" },
      { field: "notes", label: "Notes" },
    ],
    relations: [
      { toModel: "StockLocation", label: "location", hops: [{ field: "location", toModel: "StockLocation", many: false }] },
      {
        toModel: "Material",
        label: "materials (via lines)",
        hops: [
          { field: "lines", toModel: "GoodsReceiptLine", many: true },
          { field: "material", toModel: "Material", many: false },
        ],
      },
    ],
  },

  MaterialRequisition: {
    key: "MaterialRequisition",
    label: "Material Requisition",
    group: "Inventory",
    icon: ClipboardList,
    softDelete: false,
    scope: "global",
    displayField: "reqNumber",
    secondaryField: "status",
    popup: {
      archetype: "transactional",
      deepLink: () => `/requisitions`,
      scopedActions: [{ label: "Convert to Issue", dialog: "issue", icon: Package }],
      unscopedActions: [{ label: "New Requisition", dialog: "requisition", icon: ClipboardList }],
    },
    columns: [
      { field: "reqNumber", label: "Req #" },
      { field: "status", label: "Status", type: "badge" },
      { field: "requestDate", label: "Requested", type: "date" },
    ],
    relations: [
      {
        toModel: "Material",
        label: "materials (via lines)",
        hops: [
          { field: "lines", toModel: "MaterialRequisitionLine", many: true },
          { field: "material", toModel: "Material", many: false },
        ],
      },
    ],
  },

  StockMovement: {
    key: "StockMovement",
    label: "Stock Movement",
    group: "Inventory",
    icon: ArrowLeftRight,
    softDelete: false,
    scope: "global",
    displayField: "movementType",
    secondaryField: "timestamp",
    popup: {
      archetype: "system",
      deepLink: () => `/stock?tab=movements`,
      noLink: true,
      tabs: { overview: true, related: false, records: true, connections: true, files: false, activity: false },
    },
    columns: [
      { field: "movementType", label: "Type", type: "badge" },
      { field: "qty", label: "Qty", type: "number" },
      { field: "unitCost", label: "Unit Cost", type: "currency" },
      { field: "timestamp", label: "Time", type: "date" },
    ],
    relations: [],
  },

  StockLocationItem: {
    key: "StockLocationItem",
    label: "Stock On Hand",
    group: "Inventory",
    icon: Package,
    softDelete: false,
    scope: "global",
    displayField: "material.name",
    secondaryField: "qty",
    popup: {
      archetype: "system",
      deepLink: () => `/materials`,
      noLink: true,
      scopedActions: [
        { label: "Adjust (Count)", dialog: "count", icon: ScanLine },
        { label: "Transfer", dialog: "transfer", icon: ArrowLeftRight },
      ],
      tabs: { overview: true, related: false, records: true, connections: true, files: false, activity: false },
    },
    columns: [
      { field: "material.name", label: "Material" },
      { field: "qty", label: "Qty", type: "number" },
      { field: "movingAvgCost", label: "MAC", type: "currency" },
      { field: "location.name", label: "Location" },
    ],
    relations: [
      { toModel: "Material", label: "material", hops: [{ field: "material", toModel: "Material", many: false }] },
      { toModel: "StockLocation", label: "location", hops: [{ field: "location", toModel: "StockLocation", many: false }] },
    ],
  },

  MaterialIssue: {
    key: "MaterialIssue",
    label: "Material Issue",
    group: "Inventory",
    icon: ArrowLeftRight,
    softDelete: false,
    scope: "global",
    displayField: "issueDate",
    secondaryField: "totalCost",
    popup: {
      archetype: "transactional",
      deepLink: () => `/procurement`,
      unscopedActions: [{ label: "Issue Materials", dialog: "issue", icon: Package }],
    },
    columns: [
      { field: "issueDate", label: "Issued", type: "date" },
      { field: "totalCost", label: "Total Cost", type: "currency" },
      { field: "notes", label: "Notes" },
    ],
    relations: [
      {
        toModel: "Material",
        label: "materials (via lines)",
        hops: [
          { field: "lines", toModel: "MaterialIssueLine", many: true },
          { field: "material", toModel: "Material", many: false },
        ],
      },
      { toModel: "Subcontractor", label: "subcontractor", hops: [{ field: "subcontractor", toModel: "Subcontractor", many: false }] },
      { toModel: "Project", label: "project", hops: [{ field: "project", toModel: "Project", many: false }] },
    ],
  },

  StockTransfer: {
    key: "StockTransfer",
    label: "Stock Transfer",
    group: "Inventory",
    icon: ArrowLeftRight,
    softDelete: false,
    scope: "global",
    displayField: "transferDate",
    secondaryField: "status",
    popup: {
      archetype: "transactional",
      deepLink: () => `/procurement`,
      unscopedActions: [{ label: "New Transfer", dialog: "transfer", icon: ArrowLeftRight }],
    },
    columns: [
      { field: "transferDate", label: "Transferred", type: "date" },
      { field: "status", label: "Status", type: "badge" },
      { field: "notes", label: "Notes" },
    ],
    relations: [
      {
        toModel: "Material",
        label: "materials (via lines)",
        hops: [
          { field: "lines", toModel: "StockTransferLine", many: true },
          { field: "material", toModel: "Material", many: false },
        ],
      },
    ],
  },

  StockCount: {
    key: "StockCount",
    label: "Stock Count",
    group: "Inventory",
    icon: ScanLine,
    softDelete: false,
    scope: "global",
    displayField: "countDate",
    secondaryField: "status",
    popup: {
      archetype: "transactional",
      deepLink: () => `/procurement`,
      unscopedActions: [{ label: "New Count", dialog: "count", icon: ScanLine }],
    },
    columns: [
      { field: "countDate", label: "Counted", type: "date" },
      { field: "status", label: "Status", type: "badge" },
      { field: "notes", label: "Notes" },
    ],
    relations: [
      {
        toModel: "Material",
        label: "materials (via lines)",
        hops: [
          { field: "lines", toModel: "StockCountLine", many: true },
          { field: "material", toModel: "Material", many: false },
        ],
      },
    ],
  },

  Equipment: {
    key: "Equipment",
    label: "Equipment",
    group: "Inventory",
    icon: Wrench,
    softDelete: true,
    scope: "company",
    displayField: "name",
    secondaryField: "assetTag",
    popup: {
      archetype: "master",
      deepLink: () => `/equipment`,
      scopedActions: [
        { label: "New Assignment", dialog: "assignment", defaultsKey: "equipmentId", icon: MapPin },
        { label: "Schedule Maintenance", dialog: "maintenance", defaultsKey: "equipmentId", icon: Wrench },
      ],
      unscopedActions: [{ label: "New Equipment", dialog: "equipment", icon: Wrench }],
    },
    columns: [
      { field: "assetTag", label: "Asset Tag" },
      { field: "name", label: "Name" },
      { field: "status", label: "Status", type: "badge" },
      { field: "acquisitionCost", label: "Acquired For", type: "currency" },
    ],
    relations: [
      { toModel: "EquipmentAssignment", label: "assignments", hops: [{ field: "assignments", toModel: "EquipmentAssignment", many: true }] },
      { toModel: "EquipmentMaintenance", label: "maintenance", hops: [{ field: "maintenance", toModel: "EquipmentMaintenance", many: true }] },
    ],
  },

  EquipmentAssignment: {
    key: "EquipmentAssignment",
    label: "Equipment Assignment",
    group: "Inventory",
    icon: MapPin,
    softDelete: false,
    scope: "global",
    displayField: "status",
    secondaryField: "assignedAt",
    popup: {
      archetype: "transactional",
      deepLink: () => `/equipment`,
    },
    columns: [
      { field: "assignedAt", label: "Assigned", type: "date" },
      { field: "status", label: "Status", type: "badge" },
      { field: "notes", label: "Notes" },
    ],
    relations: [
      { toModel: "StockLocation", label: "location", hops: [{ field: "location", toModel: "StockLocation", many: false }] },
      { toModel: "Project", label: "project", hops: [{ field: "project", toModel: "Project", many: false }] },
    ],
  },

  EquipmentMaintenance: {
    key: "EquipmentMaintenance",
    label: "Equipment Maintenance",
    group: "Inventory",
    icon: Wrench,
    softDelete: false,
    scope: "global",
    displayField: "type",
    secondaryField: "startDate",
    popup: {
      archetype: "transactional",
      deepLink: () => `/equipment`,
      unscopedActions: [{ label: "Schedule Maintenance", dialog: "maintenance", icon: Wrench }],
    },
    columns: [
      { field: "type", label: "Type", type: "badge" },
      { field: "startDate", label: "Started", type: "date" },
      { field: "cost", label: "Cost", type: "currency" },
      { field: "vendor", label: "Vendor" },
    ],
    relations: [],
  },

  LandPurchase: {
    key: "LandPurchase",
    label: "Land Purchase",
    group: "Assets",
    icon: LandPlot,
    softDelete: true,
    scope: "company",
    displayField: "sellerName",
    secondaryField: "totalArea",
    popup: {
      archetype: "master",
      deepLink: () => `/land`,
      scopedActions: [{ label: "New Built Unit", dialog: "unit", icon: Home }],
      unscopedActions: [{ label: "New Land Purchase", dialog: "land", icon: LandPlot }],
    },
    columns: [
      { field: "sellerName", label: "Seller" },
      { field: "totalArea", label: "Area", type: "number" },
      { field: "totalCost", label: "Cost", type: "currency" },
      { field: "purchaseDate", label: "Purchased", type: "date" },
    ],
    relations: [
      { toModel: "LandParcel", label: "parcels", hops: [{ field: "parcels", toModel: "LandParcel", many: true }] },
    ],
  },

  LandParcel: {
    key: "LandParcel",
    label: "Land Parcel",
    group: "Assets",
    icon: LandPlot,
    softDelete: true,
    scope: "global",
    displayField: "number",
    secondaryField: "status",
    popup: {
      archetype: "master",
      deepLink: () => `/land`,
      scopedActions: [{ label: "New Built Unit", dialog: "unit", icon: Home }],
    },
    columns: [
      { field: "number", label: "Parcel #" },
      { field: "status", label: "Status", type: "badge" },
      { field: "area", label: "Area", type: "number" },
      { field: "acquisitionCost", label: "Cost", type: "currency" },
    ],
    relations: [
      { toModel: "LandParcel", label: "sub-parcels", hops: [{ field: "children", toModel: "LandParcel", many: true }] },
      { toModel: "Project", label: "project", hops: [{ field: "project", toModel: "Project", many: false }] },
    ],
  },

  BuiltUnit: {
    key: "BuiltUnit",
    label: "Built Unit",
    group: "Assets",
    icon: Home,
    softDelete: true,
    scope: "global",
    displayField: "unitNumber",
    secondaryField: "status",
    popup: {
      archetype: "master",
      deepLink: () => `/units`,
      scopedActions: [{ label: "New Asset Sale", dialog: "customer", icon: ShoppingCart }],
      unscopedActions: [{ label: "New Built Unit", dialog: "unit", icon: Home }],
    },
    columns: [
      { field: "unitNumber", label: "Unit #" },
      { field: "unitType", label: "Type", type: "badge" },
      { field: "status", label: "Status", type: "badge" },
      { field: "area", label: "Area", type: "number" },
      { field: "productionCost", label: "Prod Cost", type: "currency" },
    ],
    relations: [],
  },

  Customer: {
    key: "Customer",
    label: "Customer",
    group: "Sales",
    icon: Users,
    softDelete: true,
    scope: "global",
    displayField: "name",
    secondaryField: "phone",
    popup: {
      archetype: "master",
      deepLink: () => `/customers`,
      scopedActions: [{ label: "New Asset Sale", dialog: "customer", icon: ShoppingCart }],
      unscopedActions: [{ label: "New Customer", dialog: "customer", icon: Users }],
    },
    columns: [
      { field: "name", label: "Name" },
      { field: "phone", label: "Phone" },
      { field: "email", label: "Email" },
    ],
    relations: [
      { toModel: "AssetSale", label: "asset sales", hops: [{ field: "assetSales", toModel: "AssetSale", many: true }] },
    ],
  },

  AssetSale: {
    key: "AssetSale",
    label: "Asset Sale",
    group: "Sales",
    icon: ShoppingCart,
    softDelete: false,
    scope: "company",
    displayField: "saleNumber",
    secondaryField: "status",
    popup: {
      archetype: "transactional",
      deepLink: () => `/sales`,
      scopedActions: [{ label: "Record Payment", dialog: "payment", defaultsKey: "assetSaleId", icon: BadgeIndianRupee }],
      unscopedActions: [{ label: "New Customer", dialog: "customer", icon: Users }],
    },
    columns: [
      { field: "saleNumber", label: "Sale #" },
      { field: "assetType", label: "Asset", type: "badge" },
      { field: "salePrice", label: "Price", type: "currency" },
      { field: "paymentStatus", label: "Payment", type: "badge" },
      { field: "saleDate", label: "Sold", type: "date" },
    ],
    relations: [
      { toModel: "AssetSalePayment", label: "payments", hops: [{ field: "payments", toModel: "AssetSalePayment", many: true }] },
      { toModel: "Customer", label: "customer", hops: [{ field: "customer", toModel: "Customer", many: false }] },
      { toModel: "Project", label: "project", hops: [{ field: "project", toModel: "Project", many: false }] },
    ],
  },

  AssetSalePayment: {
    key: "AssetSalePayment",
    label: "Sale Payment",
    group: "Sales",
    icon: BadgeIndianRupee,
    softDelete: false,
    scope: "global",
    displayField: "paymentDate",
    secondaryField: "amount",
    popup: {
      archetype: "transactional",
      deepLink: () => `/sales`,
      unscopedActions: [{ label: "Record Payment", dialog: "payment", icon: BadgeIndianRupee }],
    },
    columns: [
      { field: "paymentDate", label: "Paid", type: "date" },
      { field: "amount", label: "Amount", type: "currency" },
      { field: "mode", label: "Mode" },
    ],
    relations: [],
  },

  Expense: {
    key: "Expense",
    label: "Expense",
    group: "Finance",
    icon: Receipt,
    softDelete: false,
    scope: "company",
    displayField: "category",
    secondaryField: "amount",
    popup: {
      archetype: "transactional",
      deepLink: () => `/finance`,
      unscopedActions: [{ label: "Add Expense", dialog: "expense", icon: Receipt }],
    },
    columns: [
      { field: "category", label: "Category", type: "badge" },
      { field: "amount", label: "Amount", type: "currency" },
      { field: "date", label: "Date", type: "date" },
      { field: "notes", label: "Notes" },
    ],
    relations: [],
  },

  ProjectCost: {
    key: "ProjectCost",
    label: "Project Cost",
    group: "Finance",
    icon: Wallet,
    softDelete: false,
    scope: "global",
    displayField: "costType",
    secondaryField: "amount",
    popup: {
      archetype: "transactional",
      deepLink: () => `/finance`,
      unscopedActions: [{ label: "Add Cost", dialog: "cost", icon: Wallet }],
    },
    columns: [
      { field: "costType", label: "Type", type: "badge" },
      { field: "amount", label: "Amount", type: "currency" },
      { field: "date", label: "Date", type: "date" },
      { field: "vendor", label: "Vendor" },
    ],
    relations: [],
  },

  SupplierReturn: {
    key: "SupplierReturn",
    label: "Supplier Return",
    group: "Inventory",
    icon: ArrowLeftRight,
    softDelete: false,
    scope: "company",
    displayField: "returnNumber",
    secondaryField: "status",
    popup: {
      archetype: "transactional",
      deepLink: () => `/procurement`,
      unscopedActions: [{ label: "New Return", dialog: "supplier", icon: ArrowLeftRight }],
    },
    columns: [
      { field: "returnNumber", label: "Return #" },
      { field: "status", label: "Status", type: "badge" },
      { field: "returnDate", label: "Returned", type: "date" },
      { field: "creditNoteNo", label: "Credit Note" },
    ],
    relations: [
      {
        toModel: "Material",
        label: "materials (via lines)",
        hops: [
          { field: "lines", toModel: "SupplierReturnLine", many: true },
          { field: "material", toModel: "Material", many: false },
        ],
      },
    ],
  },

  AuditLog: {
    key: "AuditLog",
    label: "Audit Log",
    group: "Finance",
    icon: History,
    softDelete: false,
    scope: "global",
    displayField: "action",
    secondaryField: "timestamp",
    popup: {
      archetype: "system",
      noLink: true,
      tabs: { overview: true, related: false, records: true, connections: true, files: false, activity: false },
    },
    columns: [
      { field: "action", label: "Action" },
      { field: "entityType", label: "Entity", type: "badge" },
      { field: "timestamp", label: "Time", type: "date" },
    ],
    relations: [],
  },
};

export const MODULE_GROUPS: ModuleGroup[] = ["Core", "Inventory", "Assets", "Sales", "Finance"];

/** Group colors (used for nodes, palette dots, minimap). */
export const GROUP_COLORS: Record<ModuleGroup, string> = {
  Core: "#6366f1",        // indigo
  Inventory: "#0ea5e9",   // sky
  Assets: "#f59e0b",      // amber
  Sales: "#10b981",       // emerald
  Finance: "#ec4899",     // pink
};

export const MODULE_LIST: ModuleDef[] = Object.values(MODULES);

/** All valid relations from a parent model to a child model (for the canvas connect picker). */
export function relationsBetween(fromModel: ModelKey, toModel: ModelKey): RelationDef[] {
  return MODULES[fromModel].relations.filter((r) => r.toModel === toModel);
}

// ── Graph types (persisted in CustomWorkspace.graphJson) ──

/**
 * Semantic kind of a node in the playground. Every module node can be
 * tagged with one of these to indicate its role in the work breakdown:
 *  - inform:    reference / context only — no work to do
 *  - active:    active work in progress (assignable to an employee)
 *  - finished:  work that is complete
 *  - assumption: a hypothesis / unconfirmed plan (assignable to an owner)
 */
export type NodeKind = "inform" | "active" | "finished" | "assumption";

export interface NodeKindDef {
  key: NodeKind;
  label: string;
  icon: LucideIcon;
  color: string; // hex accent
  canAssign: boolean; // can an employee be assigned to this kind?
}

export const NODE_KINDS: Record<NodeKind, NodeKindDef> = {
  inform: { key: "inform", label: "Inform", icon: Info, color: "#64748b", canAssign: false },
  active: { key: "active", label: "Active Work", icon: PlayCircle, color: "#2563eb", canAssign: true },
  finished: { key: "finished", label: "Finished", icon: CheckCircle2, color: "#16a34a", canAssign: false },
  assumption: { key: "assumption", label: "Assumption", icon: HelpCircle, color: "#d97706", canAssign: true },
};

export const NODE_KIND_LIST: NodeKindDef[] = Object.values(NODE_KINDS);

// ── Attachments (files, photos, links stored on playground nodes) ──

export type AttachmentType = "file" | "link";

export interface Attachment {
  id: string; // client-generated cuid-like id
  type: AttachmentType;
  /** For files: /uploads/xxx path. For links: the external URL. */
  url: string;
  /** Original file name (files only). */
  fileName?: string;
  /** MIME type (files only). */
  mimeType?: string;
  /** File size in bytes (files only). */
  size?: number;
  /** User-given title / description. */
  title: string;
  /** Metadata tags for search + categorization. */
  tags: string[];
  createdAt: string; // ISO date
}

// ── Priority levels for nodes ──

export type Priority = "low" | "medium" | "high" | "urgent";

export interface PriorityDef {
  key: Priority;
  label: string;
  color: string;
}

export const PRIORITIES: Record<Priority, PriorityDef> = {
  low: { key: "low", label: "Low", color: "#64748b" },
  medium: { key: "medium", label: "Medium", color: "#0ea5e9" },
  high: { key: "high", label: "High", color: "#f59e0b" },
  urgent: { key: "urgent", label: "Urgent", color: "#ef4444" },
};

export const PRIORITY_LIST: PriorityDef[] = Object.values(PRIORITIES);

// ── Custom fields (key-value pairs on nodes) ──

export interface CustomField {
  id: string;
  label: string;
  value: string;
}

// ── Notes on nodes ──

export interface NodeNote {
  id: string;
  text: string;
  createdAt: string;
}

export interface GraphNode {
  id: string;
  model: ModelKey;
  x: number;
  y: number;
  kind?: NodeKind; // semantic role of this node in the work graph
  assigneeId?: string | null; // Employee id assigned to this node (only for assignable kinds)
  attachments?: Attachment[]; // files, photos, links attached to this node
  dueDate?: string | null; // ISO date string for scheduling
  priority?: Priority; // low, medium, high, urgent
  notes?: NodeNote[]; // freeform notes
  customFields?: CustomField[]; // user-defined key-value pairs
  recordId?: string | null; // linked real DB record ID
  recordLabel?: string | null; // display label of the linked record
}

export interface GraphEdge {
  from: string; // node id
  to: string; // node id
  relationLabel: string;
  hops: Hop[];
  toModel: ModelKey;
  /** Optional custom label overriding the relation label (user-editable on canvas). */
  label?: string | null;
}

export interface WorkspaceGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  rootId: string;
}

// ── Live data graph (read-only, auto-generated from real DB records) ──

/**
 * A node in the live data graph — one per real record, deduped by
 * `${model}:${recordId}` so a record reachable from multiple parents
 * (e.g. a StockLocation under both Company and a Project) renders once
 * with several incoming edges (a "shared" node).
 */
export interface LiveNode {
  id: string; // `${model}:${recordId}`
  model: ModelKey;
  recordId: string;
  label: string; // displayField value
  secondary: string | null; // secondaryField value
  depth: number; // BFS depth from the company root
}

export interface LiveEdge {
  from: string; // LiveNode id
  to: string; // LiveNode id
  relationLabel: string;
  label: string; // edge label shown on canvas
  hops: Hop[];
  toModel: ModelKey;
}

export interface LiveGraph {
  nodes: LiveNode[];
  edges: LiveEdge[];
  rootId: string;
  /** Node ids reachable from more than one parent (shared across the graph). */
  sharedIds: string[];
  /** True if traversal hit a depth/count cap and stopped early. */
  truncated: boolean;
}
