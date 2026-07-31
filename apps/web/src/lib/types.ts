/** Shared client-side types for the Materials module. */

export type MaterialCategory = {
  id: string;
  name: string;
  unit: string;
  _count?: { materials: number };
};

export type MaterialRow = {
  id: string;
  code: string;
  name: string;
  categoryId: string;
  categoryName: string;
  unit: string;
  hsnCode: string | null;
  gstRate: number;
  standardCost: number;
  minStock: number | null;
  description: string | null;
  totalQty: number;
  totalValue: number;
  lowStock: boolean;
};

export type StockLocationRow = {
  id: string;
  type: "COMPANY_WAREHOUSE" | "PROJECT_SITE";
  name: string;
  address: string | null;
  projectId: string | null;
  projectName: string | null;
  stockValue: number;
  itemCount: number;
};

export type StockRow = {
  id: string;
  locationId: string;
  locationName: string;
  locationType: "COMPANY_WAREHOUSE" | "PROJECT_SITE";
  materialId: string;
  materialCode: string;
  materialName: string;
  categoryName: string;
  unit: string;
  qty: number;
  mac: number;
  value: number;
};

export type LowStockRow = {
  id: string;
  code: string;
  name: string;
  categoryName: string;
  unit: string;
  totalQty: number;
  minStock: number;
  shortfall: number;
  standardCost: number;
};

export type ProjectOption = {
  id: string;
  name: string;
  type: string;
  status: string;
};

// ───────────────────────────────────────────────────────────
//  Procurement types
// ───────────────────────────────────────────────────────────

export type SupplierRow = {
  id: string;
  name: string;
  gstin: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  balanceOwed: number;
  openPOs: number;
  poCount: number; // alias for openPOs (used by procurement view)
};

export type PurchaseOrderRow = {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  procurementScope: "COMPANY" | "PROJECT";
  projectId: string | null;
  projectName: string | null;
  destinationLocationId: string;
  destinationLocationName: string;
  destinationLocationType: "COMPANY_WAREHOUSE" | "PROJECT_SITE";
  status: "DRAFT" | "APPROVED" | "ORDERED" | "PARTIAL" | "RECEIVED" | "CANCELLED";
  orderDate: string;
  expectedDate: string | null;
  subtotal: number;
  gstTotal: number;
  total: number;
  notes: string | null;
  totalOrdered: number;
  totalReceived: number;
  receivedPct: number;
  createdAt: string;
};

export type PurchaseOrderDetail = {
  id: string;
  poNumber: string;
  supplierId: string;
  supplier: {
    id: string;
    name: string;
    gstin: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
  };
  procurementScope: "COMPANY" | "PROJECT";
  projectId: string | null;
  projectName: string | null;
  destinationLocationId: string;
  destinationLocation: { id: string; name: string; type: string };
  status: PurchaseOrderRow["status"];
  orderDate: string;
  expectedDate: string | null;
  subtotal: number;
  gstTotal: number;
  total: number;
  notes: string | null;
  createdAt: string;
  lines: {
    id: string;
    materialId: string;
    materialCode: string;
    materialName: string;
    unit: string;
    qtyOrdered: number;
    qtyReceived: number;
    unitCost: number;
    gstRate: number;
    lineTotal: number;
    remaining: number;
  }[];
  receipts: {
    id: string;
    receiptDate: string;
    inspectionStatus: string;
    notes: string | null;
    lineCount: number;
  }[];
};

export type TransferRow = {
  id: string;
  fromLocationId: string;
  fromLocationName: string;
  fromLocationType: string;
  toLocationId: string;
  toLocationName: string;
  toLocationType: string;
  status: "DRAFT" | "IN_TRANSIT" | "COMPLETED" | "CANCELLED";
  transferDate: string;
  notes: string | null;
  createdAt: string;
  lineCount: number;
  totalQty: number;
  materials: string[];
};

export type StockMovementRow = {
  id: string;
  materialId: string;
  materialCode: string;
  materialName: string;
  unit: string;
  movementType: string;
  movementLabel: string;
  fromLocationId: string | null;
  fromLocationName: string | null;
  toLocationId: string | null;
  toLocationName: string | null;
  qty: number;
  unitCost: number;
  balanceAfter: number;
  balanceValueAfter: number;
  reason: string | null;
  refType: string | null;
  refId: string | null;
  userName: string | null;
  timestamp: string;
};

export type AvailableStockRow = {
  materialId: string;
  materialCode: string;
  materialName: string;
  unit: string;
  qty: number;
  mac: number;
};

// ───────────────────────────────────────────────────────────
//  Projects module
// ───────────────────────────────────────────────────────────

export type ProjectType = "RESIDENTIAL" | "COMMERCIAL" | "WAREHOUSE" | "MALL" | "LAND" | "OTHER";
export type ProjectStatus = "PLANNED" | "ACTIVE" | "COMPLETED" | "ON_HOLD";

export type ProjectRow = {
  id: string;
  name: string;
  type: ProjectType;
  status: ProjectStatus;
  address: string | null;
  startDate: string | null;
  endDate: string | null;
  totalBudget: number | null;
  costPerSqft: number | null;
  totalProjectCost: number | null;
  totalSellableArea: number | null;
  description: string | null;
  unitCount: number;
  locationCount: number;
  phaseCount: number;
};

export type PhaseRow = {
  id: string;
  name: string;
  status: ProjectStatus;
  startDate: string | null;
  endDate: string | null;
  budget: number | null;
  sortOrder: number;
};

export type StockLocationLite = {
  id: string;
  type: "COMPANY_WAREHOUSE" | "PROJECT_SITE";
  name: string;
  address: string | null;
};

// ───────────────────────────────────────────────────────────
//  Procurement module — supplementary types
//  (Core procurement types like SupplierRow, PurchaseOrderRow,
//   PurchaseOrderDetail, TransferRow, StockMovementRow are
//   defined above in the Procurement types section.)
// ───────────────────────────────────────────────────────────

export type MaterialOption = {
  id: string;
  code: string;
  name: string;
  unit: string;
  standardCost: number;
  gstRate: number;
};

export type SupplierOption = {
  id: string;
  name: string;
};

export type StockLocationOption = {
  id: string;
  type: "COMPANY_WAREHOUSE" | "PROJECT_SITE";
  name: string;
  projectId: string | null;
  projectName: string | null;
};

export type MaterialIssueListRow = {
  id: string;
  projectId: string;
  projectName: string;
  fromLocationId: string;
  fromLocationName: string;
  issueDate: string;
  notes: string | null;
  totalCost: number;
  lineCount: number;
};

export type PurchaseOrderListRow = {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  procurementScope: "COMPANY" | "PROJECT";
  projectId: string | null;
  projectName: string | null;
  destinationLocationId: string;
  destinationLocationName: string;
  status: "DRAFT" | "APPROVED" | "ORDERED" | "PARTIAL" | "RECEIVED" | "CANCELLED";
  orderDate: string;
  expectedDate: string | null;
  subtotal: number;
  gstTotal: number;
  total: number;
  notes: string | null;
  lineCount: number;
  totalQtyOrdered: number;
  totalQtyReceived: number;
};

export type StockTransferListRow = {
  id: string;
  fromLocationId: string;
  fromLocationName: string;
  toLocationId: string;
  toLocationName: string;
  status: "DRAFT" | "IN_TRANSIT" | "COMPLETED" | "CANCELLED";
  transferDate: string;
  notes: string | null;
  lineCount: number;
};

// ───────────────────────────────────────────────────────────
//  Land module
// ───────────────────────────────────────────────────────────

export type LandParcelStatus = "AVAILABLE" | "HOLD" | "PARTITIONED" | "SOLD";
export type AreaUnit = "SQFT" | "SQM" | "ACRE" | "BIGHA" | "HECTARE";

export type LandPurchaseRow = {
  id: string;
  projectId: string | null;
  projectName: string | null;
  sellerName: string;
  sellerContact: string | null;
  purchaseDate: string;
  totalArea: number;
  areaUnit: AreaUnit;
  totalCost: number;
  registryNo: string | null;
  location: string | null;
  parcelCount: number;
  availableArea: number;
};

export type LandParcelRow = {
  id: string;
  landPurchaseId: string;
  parentParcelId: string | null;
  parentParcelNumber: string | null;
  number: string;
  area: number;
  areaUnit: AreaUnit;
  status: LandParcelStatus;
  acquisitionCost: number;
  askingPrice: number | null;
  currentValuation: number;
  projectId: string | null;
  projectName: string | null;
  childCount: number;
};

// ───────────────────────────────────────────────────────────
//  Built Units module
// ───────────────────────────────────────────────────────────

export type BuiltUnitType = "BHK_1" | "BHK_2" | "BHK_3" | "BHK_4" | "SHOP" | "OFFICE" | "WAREHOUSE_UNIT" | "OTHER";
export type BuiltUnitStatus = "PLANNED" | "UNDER_CONSTRUCTION" | "AVAILABLE" | "HOLD" | "SOLD";

export type BuiltUnitRow = {
  id: string;
  projectId: string;
  projectName: string;
  phaseId: string | null;
  phaseName: string | null;
  unitType: BuiltUnitType;
  unitNumber: string;
  floor: number | null;
  wing: string | null;
  area: number;
  areaUnit: AreaUnit;
  status: BuiltUnitStatus;
  productionCost: number;
  askingPrice: number | null;
  currentValuation: number;
  saleId: string | null;
};

// ───────────────────────────────────────────────────────────
//  Customers module
// ───────────────────────────────────────────────────────────

export type CustomerRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  address: string | null;
  activeSales: number;
};

// ───────────────────────────────────────────────────────────
//  Sales module
// ───────────────────────────────────────────────────────────

export type SaleStatus = "ACTIVE" | "CANCELLED";
export type PaymentStatus = "PENDING" | "PARTIAL" | "PAID";
export type AssetType = "LAND" | "BUILT_UNIT";

export type AssetSaleRow = {
  id: string;
  saleNumber: string;
  assetType: AssetType;
  landParcelId: string | null;
  landParcelNumber: string | null;
  builtUnitId: string | null;
  builtUnitNumber: string | null;
  builtUnitType: BuiltUnitType | null;
  assetArea: number | null;
  assetAreaUnit: AreaUnit | null;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  projectId: string;
  projectName: string;
  salePrice: number;
  costBasis: number;
  profit: number;
  saleDate: string;
  status: SaleStatus;
  paymentStatus: PaymentStatus;
  paymentMode: string | null;
  notes: string | null;
  totalPaid: number;
  balanceDue: number;
  paymentCount: number;
};

export type AssetSaleDetail = AssetSaleRow & {
  payments: {
    id: string;
    amount: number;
    paymentDate: string;
    mode: string;
    reference: string | null;
    status: string;
  }[];
};

// ───────────────────────────────────────────────────────────
//  Finance module
// ───────────────────────────────────────────────────────────

export type ProjectCostRow = {
  id: string;
  projectId: string;
  projectName: string;
  costType: "LABOUR" | "OVERHEAD" | "EQUIPMENT" | "CONTRACTOR" | "PERMIT" | "OTHER";
  amount: number;
  date: string;
  vendor: string | null;
  subcontractorId: string | null;
  subcontractorName: string | null;
  notes: string | null;
  receiptUrl: string | null;
};

export type ExpenseRow = {
  id: string;
  projectId: string | null;
  projectName: string | null;
  category: string;
  amount: number;
  date: string;
  notes: string | null;
};

export type SellableAssetRow = {
  assetType: AssetType;
  assetId: string;
  label: string;
  projectId: string | null;
  projectName: string | null;
  costBasis: number;
  askingPrice: number | null;
  currentValuation: number;
};

export type ProjectPnlRow = {
  projectId: string;
  projectName: string;
  totalCost: number;
  revenue: number;
  profit: number;
  margin: number;
};

export type AuditLogRow = {
  id: string;
  userId: string | null;
  userName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  details: string | null;
  timestamp: string;
};

// ───────────────────────────────────────────────────────────
//  Equipment module
// ───────────────────────────────────────────────────────────

export type EquipmentStatus = "AVAILABLE" | "ASSIGNED" | "IN_MAINTENANCE" | "RETIRED";
export type MaintenanceType = "SCHEDULED" | "REPAIR" | "INSPECTION";

export type EquipmentRow = {
  id: string;
  assetTag: string;
  name: string;
  model: string | null;
  serialNumber: string | null;
  category: string | null;
  status: EquipmentStatus;
  acquisitionCost: number;
  currentValue: number;
  purchaseDate: string | null;
  notes: string | null;
  activeAssignment: {
    id: string;
    locationId: string;
    locationName: string;
    projectId: string | null;
    projectName: string | null;
    assignedAt: string;
  } | null;
};

export type EquipmentAssignmentHistory = {
  id: string;
  locationId: string;
  locationName: string;
  projectId: string | null;
  projectName: string | null;
  assignedAt: string;
  returnedAt: string | null;
  status: "ACTIVE" | "RETURNED";
  notes: string | null;
};

export type EquipmentMaintenanceHistory = {
  id: string;
  type: MaintenanceType;
  startDate: string;
  endDate: string | null;
  cost: number;
  vendor: string | null;
  notes: string | null;
};

export type EquipmentDetail = {
  id: string;
  assetTag: string;
  name: string;
  model: string | null;
  serialNumber: string | null;
  category: string | null;
  status: EquipmentStatus;
  acquisitionCost: number;
  currentValue: number;
  purchaseDate: string | null;
  notes: string | null;
  assignments: EquipmentAssignmentHistory[];
  maintenance: EquipmentMaintenanceHistory[];
};

export type EquipmentAssignmentRow = {
  id: string;
  equipmentId: string;
  equipmentName: string;
  assetTag: string;
  locationId: string;
  locationName: string;
  projectId: string | null;
  projectName: string | null;
  assignedAt: string;
  returnedAt: string | null;
  status: "ACTIVE" | "RETURNED";
  notes: string | null;
};

export type EquipmentMaintenanceRow = {
  id: string;
  equipmentId: string;
  equipmentName: string;
  assetTag: string;
  type: MaintenanceType;
  startDate: string;
  endDate: string | null;
  cost: number;
  vendor: string | null;
  notes: string | null;
};

// ───────────────────────────────────────────────────────────
//  Requisitions module
// ───────────────────────────────────────────────────────────

export type RequisitionStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "CONVERTED" | "REJECTED";

export type RequisitionRow = {
  id: string;
  reqNumber: string;
  projectId: string;
  projectName: string;
  phaseId: string | null;
  phaseName: string | null;
  status: RequisitionStatus;
  requestDate: string;
  neededByDate: string | null;
  notes: string | null;
  convertedPoId: string | null;
  lineCount: number;
  totalQty: number;
};

export type RequisitionDetail = RequisitionRow & {
  lines: {
    id: string;
    materialId: string;
    materialCode: string;
    materialName: string;
    unit: string;
    qtyRequested: number;
    notes: string | null;
  }[];
};

// ───────────────────────────────────────────────────────────
//  Subcontractor module
// ───────────────────────────────────────────────────────────

export type SubcontractorRow = {
  id: string;
  name: string;
  gstin: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  trade: string | null;
};

// ───────────────────────────────────────────────────────────
//  Supplier Returns module
// ───────────────────────────────────────────────────────────

export type SupplierReturnStatus = "DRAFT" | "SUBMITTED" | "COMPLETED" | "CANCELLED";

export type SupplierReturnLineRow = {
  id: string;
  materialId: string;
  materialCode: string;
  materialName: string;
  materialUnit: string;
  qty: number;
  reason: string | null;
};

export type SupplierReturnRow = {
  id: string;
  returnNumber: string;
  supplierId: string;
  supplierName: string;
  purchaseOrderId: string | null;
  locationId: string;
  locationName: string;
  status: SupplierReturnStatus;
  returnDate: string;
  creditNoteNo: string | null;
  notes: string | null;
  lines: SupplierReturnLineRow[];
};

// ── Approvals ──

export type ApprovalPORow = {
  id: string;
  poNumber: string;
  supplierName: string;
  projectName: string | null;
  procurementScope: "COMPANY" | "PROJECT";
  status: string;
  total: number;
  subtotal: number;
  gstTotal: number;
  lineCount: number;
  createdByName: string | null;
  createdAt: string;
  expectedDate: string | null;
  canApprove: boolean;
};

export type ApprovalReqRow = {
  id: string;
  reqNumber: string;
  projectName: string;
  phaseName: string | null;
  status: string;
  lineCount: number;
  totalQty: number;
  requestedByName: string | null;
  neededByDate: string | null;
  createdAt: string;
  canApprove: boolean;
};


