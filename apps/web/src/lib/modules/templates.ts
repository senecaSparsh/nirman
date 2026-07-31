import type { ModelKey, WorkspaceGraph } from "@/lib/modules/registry";

export interface WorkspaceTemplate {
  key: string;
  label: string;
  description: string;
  icon: string; // lucide icon name
  graph: WorkspaceGraph;
}

// Hop helper — keeps templates terse while matching the registry exactly.
function hop(field: string, toModel: string, many: boolean) {
  return { field, toModel, many };
}

export const TEMPLATES: WorkspaceTemplate[] = [
  {
    key: "residential",
    label: "Residential Project",
    description: "Company → Project → Phase → Built Units + Stock + Materials + Procurement",
    icon: "Home",
    graph: {
      rootId: "n0",
      nodes: [
        { id: "n0", model: "Company", x: 400, y: 80 },
        { id: "n1", model: "Project", x: 400, y: 260 },
        { id: "n2", model: "ProjectPhase", x: 200, y: 440 },
        { id: "n3", model: "BuiltUnit", x: 200, y: 620 },
        { id: "n4", model: "StockLocation", x: 600, y: 440 },
        { id: "n5", model: "Material", x: 600, y: 620 },
        { id: "n6", model: "PurchaseOrder", x: 800, y: 440 },
        { id: "n7", model: "Supplier", x: 800, y: 620 },
      ],
      edges: [
        { from: "n0", to: "n1", relationLabel: "projects", toModel: "Project", hops: [hop("projects", "Project", true)] },
        { from: "n1", to: "n2", relationLabel: "phases", toModel: "ProjectPhase", hops: [hop("phases", "ProjectPhase", true)] },
        { from: "n2", to: "n3", relationLabel: "built units", toModel: "BuiltUnit", hops: [hop("builtUnits", "BuiltUnit", true)] },
        { from: "n1", to: "n4", relationLabel: "site locations", toModel: "StockLocation", hops: [hop("stockLocations", "StockLocation", true)] },
        { from: "n4", to: "n5", relationLabel: "materials (via stock)", toModel: "Material", hops: [hop("stockItems", "StockLocationItem", true), hop("material", "Material", false)] },
        { from: "n1", to: "n6", relationLabel: "purchase orders", toModel: "PurchaseOrder", hops: [hop("purchaseOrders", "PurchaseOrder", true)] },
        { from: "n6", to: "n7", relationLabel: "supplier", toModel: "Supplier", hops: [hop("supplier", "Supplier", false)] },
      ],
    },
  },
  {
    key: "commercial",
    label: "Commercial Build",
    description: "Company → Project → Land + Built Units + Equipment + Sales + Costs",
    icon: "Building2",
    graph: {
      rootId: "n0",
      nodes: [
        { id: "n0", model: "Company", x: 400, y: 80 },
        { id: "n1", model: "Project", x: 400, y: 260 },
        { id: "n2", model: "LandPurchase", x: 150, y: 440 },
        { id: "n3", model: "LandParcel", x: 150, y: 620 },
        { id: "n4", model: "BuiltUnit", x: 350, y: 440 },
        { id: "n5", model: "AssetSale", x: 550, y: 440 },
        { id: "n6", model: "Customer", x: 550, y: 620 },
        { id: "n7", model: "Equipment", x: 750, y: 440 },
        { id: "n8", model: "EquipmentAssignment", x: 750, y: 620 },
        { id: "n9", model: "ProjectCost", x: 400, y: 620 },
      ],
      edges: [
        { from: "n0", to: "n1", relationLabel: "projects", toModel: "Project", hops: [hop("projects", "Project", true)] },
        { from: "n1", to: "n2", relationLabel: "land purchases", toModel: "LandPurchase", hops: [hop("landPurchases", "LandPurchase", true)] },
        { from: "n2", to: "n3", relationLabel: "parcels", toModel: "LandParcel", hops: [hop("parcels", "LandParcel", true)] },
        { from: "n1", to: "n4", relationLabel: "built units", toModel: "BuiltUnit", hops: [hop("builtUnits", "BuiltUnit", true)] },
        { from: "n1", to: "n5", relationLabel: "asset sales", toModel: "AssetSale", hops: [hop("assetSales", "AssetSale", true)] },
        { from: "n5", to: "n6", relationLabel: "customer", toModel: "Customer", hops: [hop("customer", "Customer", false)] },
        { from: "n1", to: "n7", relationLabel: "equipment", toModel: "Equipment", hops: [hop("equipment", "Equipment", true)] },
        { from: "n7", to: "n8", relationLabel: "assignments", toModel: "EquipmentAssignment", hops: [hop("assignments", "EquipmentAssignment", true)] },
        { from: "n1", to: "n9", relationLabel: "project costs", toModel: "ProjectCost", hops: [hop("projectCosts", "ProjectCost", true)] },
      ],
    },
  },
  {
    key: "warehouse",
    label: "Warehouse Operations",
    description: "Company → Stock Locations → Materials + Procurement + Transfers + Movements",
    icon: "Boxes",
    graph: {
      rootId: "n0",
      nodes: [
        { id: "n0", model: "Company", x: 400, y: 80 },
        { id: "n1", model: "StockLocation", x: 200, y: 260 },
        { id: "n2", model: "StockLocation", x: 600, y: 260 },
        { id: "n3", model: "Material", x: 200, y: 440 },
        { id: "n4", model: "StockLocationItem", x: 200, y: 620 },
        { id: "n5", model: "StockMovement", x: 400, y: 440 },
        { id: "n6", model: "PurchaseOrder", x: 600, y: 440 },
        { id: "n7", model: "GoodsReceipt", x: 600, y: 620 },
        { id: "n8", model: "StockTransfer", x: 400, y: 620 },
        { id: "n9", model: "MaterialCategory", x: 800, y: 260 },
      ],
      edges: [
        { from: "n0", to: "n1", relationLabel: "warehouses", toModel: "StockLocation", hops: [hop("stockLocations", "StockLocation", true)] },
        { from: "n0", to: "n2", relationLabel: "warehouses", toModel: "StockLocation", hops: [hop("stockLocations", "StockLocation", true)] },
        { from: "n1", to: "n3", relationLabel: "materials (via stock)", toModel: "Material", hops: [hop("stockItems", "StockLocationItem", true), hop("material", "Material", false)] },
        { from: "n3", to: "n4", relationLabel: "stock levels", toModel: "StockLocationItem", hops: [hop("stockItems", "StockLocationItem", true)] },
        { from: "n3", to: "n5", relationLabel: "stock movements", toModel: "StockMovement", hops: [hop("stockMovements", "StockMovement", true)] },
        { from: "n2", to: "n6", relationLabel: "purchase orders", toModel: "PurchaseOrder", hops: [hop("purchaseOrders", "PurchaseOrder", true)] },
        { from: "n6", to: "n7", relationLabel: "goods receipts", toModel: "GoodsReceipt", hops: [hop("goodsReceipts", "GoodsReceipt", true)] },
        { from: "n1", to: "n8", relationLabel: "transfers out", toModel: "StockTransfer", hops: [hop("stockTransfersFrom", "StockTransfer", true)] },
        { from: "n3", to: "n9", relationLabel: "category", toModel: "MaterialCategory", hops: [hop("category", "MaterialCategory", false)] },
      ],
    },
  },
  {
    key: "procurement",
    label: "Procurement Flow",
    description: "Project → Requisition → PO → Goods Receipt → Stock → Issue to Project",
    icon: "ShoppingCart",
    graph: {
      rootId: "n0",
      nodes: [
        { id: "n0", model: "Company", x: 400, y: 80 },
        { id: "n1", model: "Project", x: 400, y: 260 },
        { id: "n2", model: "MaterialRequisition", x: 200, y: 440 },
        { id: "n3", model: "PurchaseOrder", x: 400, y: 440 },
        { id: "n4", model: "Supplier", x: 600, y: 440 },
        { id: "n5", model: "GoodsReceipt", x: 400, y: 620 },
        { id: "n6", model: "StockLocation", x: 200, y: 620 },
        { id: "n7", model: "MaterialIssue", x: 200, y: 800 },
        { id: "n8", model: "Material", x: 600, y: 620 },
      ],
      edges: [
        { from: "n0", to: "n1", relationLabel: "projects", toModel: "Project", hops: [hop("projects", "Project", true)] },
        { from: "n1", to: "n2", relationLabel: "requisitions", toModel: "MaterialRequisition", hops: [hop("materialRequisitions", "MaterialRequisition", true)] },
        { from: "n1", to: "n3", relationLabel: "purchase orders", toModel: "PurchaseOrder", hops: [hop("purchaseOrders", "PurchaseOrder", true)] },
        { from: "n3", to: "n4", relationLabel: "supplier", toModel: "Supplier", hops: [hop("supplier", "Supplier", false)] },
        { from: "n3", to: "n5", relationLabel: "goods receipts", toModel: "GoodsReceipt", hops: [hop("goodsReceipts", "GoodsReceipt", true)] },
        { from: "n5", to: "n6", relationLabel: "location", toModel: "StockLocation", hops: [hop("location", "StockLocation", false)] },
        { from: "n6", to: "n7", relationLabel: "material issues", toModel: "MaterialIssue", hops: [hop("materialIssues", "MaterialIssue", true)] },
        { from: "n3", to: "n8", relationLabel: "materials (via lines)", toModel: "Material", hops: [hop("lines", "PurchaseOrderLine", true), hop("material", "Material", false)] },
      ],
    },
  },
];
