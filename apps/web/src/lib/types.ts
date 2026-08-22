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
  categoryId: string | null;
  categoryName: string | null;
  unit: string;
  hsnCode: string | null;
  gstRate: number;
  standardCost: number;
  minStock: number | null;
  reorderPoint: number | null;
  economicOrderQty: number | null;
  volumetricDensity: number | null;
  bulkDiscountPct: number | null;
  isCorporateCommodity: boolean;
  description: string | null;
  totalQty: number;
  totalValue: number;
  lowStock: boolean;
};

export type StockLocationRow = {
  id: string;
  type: "COMPANY_WAREHOUSE" | "PROJECT_SITE" | "DEPARTMENT";
  name: string;
  address: string | null;
  projectId: string | null;
  projectName: string | null;
  stockValue: number;
  itemCount: number;
  // Company context — needed so the transfer dialog can group destinations
  // by company and label cross-company (inter-company STO) destinations.
  companyId: string;
  companyName: string;
};

export type StockRow = {
  id: string;
  locationId: string;
  locationName: string;
  locationType: "COMPANY_WAREHOUSE" | "PROJECT_SITE" | "DEPARTMENT";
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
  destinationLocationType: "COMPANY_WAREHOUSE" | "PROJECT_SITE" | "DEPARTMENT";
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
  freightTotal: number;
  loadingTotal: number;
  packingTotal: number;
  insuranceTotal: number;
  discountTotal: number;
  miscChargesTotal: number;
  total: number;
  notes: string | null;
  createdAt: string;
  sourceRequisition: { id: string; reqNumber: string } | null;
  charges: {
    id: string;
    heading: string;
    amount: number;
    notes: string | null;
  }[];
  lines: {
    id: string;
    materialId: string;
    materialCode: string;
    materialName: string;
    unit: string;
    baseUnit: string;
    secondaryUnit: string | null;
    uomConversionFactor: number | null;
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
  fromCompanyName: string | null;
  toLocationId: string;
  toLocationName: string;
  toLocationType: string;
  toCompanyName: string | null;
  status: "DRAFT" | "IN_TRANSIT" | "COMPLETED" | "CANCELLED";
  transferDate: string;
  notes: string | null;
  createdAt: string;
  lineCount: number;
  totalQty: number;
  materials: string[];
  // Inter-company Stock Transfer Order (STO) economics.
  // isInterCompany = true when from/to locations belong to different companies.
  // transferPriceTotal = Σ line transfer totals (set on completion).
  isInterCompany: boolean;
  transferPriceTotal: number | null;
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
//  Stock Count module
// ───────────────────────────────────────────────────────────

export type StockCountStatus = "DRAFT" | "COUNTED" | "RECONCILED";

export type StockCountLineRow = {
  id: string;
  materialId: string;
  materialCode: string;
  materialName: string;
  unit: string;
  countedQty: number;
  systemQty: number;
  variance: number;
  unitCost?: number;
};

export type StockCountRow = {
  id: string;
  locationId: string;
  locationName: string;
  locationType: string;
  status: StockCountStatus;
  countDate: string;
  notes: string | null;
  createdAt: string;
  lineCount: number;
  totalVariance: number;
  lines: StockCountLineRow[];
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
  // RERA registration
  reraNumber: string | null;
  reraRegistrationDate: string | null;
  reraValidityDate: string | null;
  reraWebsiteUrl: string | null;
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
  type: "COMPANY_WAREHOUSE" | "PROJECT_SITE" | "DEPARTMENT";
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
  isLotTracked?: boolean;
};

export type SupplierOption = {
  id: string;
  name: string;
};

export type StockLocationOption = {
  id: string;
  type: "COMPANY_WAREHOUSE" | "PROJECT_SITE" | "DEPARTMENT";
  name: string;
  projectId: string | null;
  projectName: string | null;
};

export type DepartmentRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  active: boolean;
  stockLocationId: string | null;
  stockLocationName: string | null;
  issueCount: number;
};

export type DepartmentOption = {
  id: string;
  code: string;
  name: string;
};

export type MaterialIssueListRow = {
  id: string;
  issueNumber: string;
  projectId: string | null;
  projectName: string | null;
  departmentId: string | null;
  departmentName: string | null;
  departmentCode: string | null;
  fromLocationId: string;
  fromLocationName: string;
  issueDate: string;
  status: "PENDING" | "COMPLETED" | "CANCELLED";
  notes: string | null;
  receiverName: string | null;
  receiverMobile: string | null;
  totalCost: number;
  roundOff: number;
  totalAmount: number;
  lineCount: number;
};

export type DirectPurchaseRow = {
  id: string;
  billNumber: string;
  supplierId: string | null;
  supplierName: string;
  supplierPhone: string | null;
  locationId: string;
  locationName: string;
  billDate: string;
  subtotal: number;
  gstTotal: number;
  roundOff: number;
  billAmount: number;
  notes: string | null;
  lineCount: number;
  lines: {
    id: string;
    materialId: string;
    materialCode: string;
    materialName: string;
    unit: string;
    qty: number;
    unitCost: number;
    gstRate: number;
    lineTotal: number;
  }[];
};

// NOTE: SupplierReturnRow is defined further below with the proper
// SupplierReturnStatus enum type. See line ~841.

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

export type LandParcelStatus = "AVAILABLE" | "HOLD" | "PARTITIONED" | "RESERVED" | "SOLD" | "RENTED";
export type AreaUnit = "SQFT" | "SQM" | "SQYD" | "ACRE" | "BIGHA" | "KATHA" | "HECTARE";

/** A lightweight parcel summary embedded inside a LandPurchaseRow for card rendering. */
export type LandParcelSummary = {
  id: string;
  number: string;
  status: LandParcelStatus;
  purpose?: "SELL" | "PROJECT" | "HOLD" | null;
  area: number;
  acquisitionCost: number;
  currentValuation: number;
  parentParcelId: string | null;
  childCount: number;
  geometry?: unknown;
};

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
  documentUrl: string | null;
  mode?: "WHOLE" | "SUBDIVIDED" | null;
  parcelCount: number;
  availableArea: number;
  // ── Aggregates for the rich card + portfolio ──
  parcels: LandParcelSummary[];
  soldCount: number;
  soldRevenue: number;       // Σ salePrice of sold parcels under this purchase
  soldProfit: number;        // Σ profit of sold parcels
  availableCount: number;
  holdCount: number;
  partitionedCount: number;
  unsoldValue: number;       // Σ currentValuation of AVAILABLE + HOLD parcels
  costBasis: number;         // Σ acquisitionCost of unsold (AVAILABLE + HOLD) parcels
  valuationGain: number;     // unsoldValue - costBasis
  hasChildren: boolean;      // any parcel with a parentParcelId (i.e. partitioned)
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
  purpose?: "SELL" | "PROJECT" | "HOLD" | null;
  acquisitionCost: number;
  askingPrice: number | null;
  currentValuation: number;
  isInfrastructure: boolean;
  marketValue: number | null;
  weightFactor: number | null;
  projectId: string | null;
  projectName: string | null;
  childCount: number;
  geometry: unknown;
  // ── Sale info (only present for SOLD parcels; optional elsewhere) ──
  salePrice?: number | null;
  saleProfit?: number | null;
  saleNumber?: string | null;
  saleDate?: string | null;
  customerName?: string | null;
};

/** Company-wide land portfolio rollup shown in the portfolio strip. */
export type LandPortfolio = {
  purchaseCount: number;
  totalArea: number;
  parcelCount: number;
  availableCount: number;
  holdCount: number;
  soldCount: number;
  partitionedCount: number;
  availableArea: number;
  costBasis: number;         // Σ acquisitionCost of unsold parcels
  unsoldValue: number;       // Σ currentValuation of unsold parcels
  unrealizedGain: number;    // unsoldValue - costBasis
  soldRevenue: number;       // Σ salePrice of sold parcels
  soldProfit: number;        // Σ profit of sold parcels
  totalValue: number;        // unsoldValue + soldRevenue
};

// ───────────────────────────────────────────────────────────
//  Built Units module
// ───────────────────────────────────────────────────────────

export type BuiltUnitType = "BHK_1" | "BHK_2" | "BHK_3" | "BHK_4" | "SHOP" | "OFFICE" | "WAREHOUSE_UNIT" | "VILLA" | "OTHER";
export type BuiltUnitStatus = "PLANNED" | "UNDER_CONSTRUCTION" | "AVAILABLE" | "RESERVED" | "HOLD" | "SOLD" | "RENTED";

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
  // ── RERA compliance fields ──
  carpetArea: number | null;
  superBuiltUpArea: number | null;
  balconyArea: number | null;
  clearHeight: number | null;
  hasLoadingDock: boolean;
  status: BuiltUnitStatus;
  // ── Origin tracking ──
  originType: "CREATED" | "PURCHASED";
  acquisitionCost: number;
  purchaseDate: string | null;
  landParcelId: string | null;
  productionCost: number;
  askingPrice: number | null;
  currentValuation: number;
  nrvWriteDown: number;
  saleId: string | null;
  // ── Sale info (only present for units with an active sale; optional elsewhere) ──
  salePrice?: number | null;
  saleProfit?: number | null;
  saleNumber?: string | null;
  saleDate?: string | null;
  customerName?: string | null;
};

export type PhaseOption = {
  id: string;
  projectId: string;
  name: string;
  status?: string;
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

export type LeadSource = "PORTAL" | "WALK_IN" | "REFERRAL" | "BROKER" | "DIGITAL_AD" | "OTHER";
export type LeadStage = "NEW" | "CONTACTED" | "SITE_VISIT" | "NEGOTIATION" | "BOOKED" | "LOST";
export type LeadPriority = "LOW" | "MEDIUM" | "HIGH" | "HOT";
export type LeadActivityType = "CALL" | "EMAIL" | "WHATSAPP" | "MEETING" | "SITE_VISIT" | "NOTE" | "STAGE_CHANGE";

export type LeadRow = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  source: LeadSource;
  stage: LeadStage;
  priority: LeadPriority;
  score: number;
  budgetMin: number | null;
  budgetMax: number | null;
  interestedUnitType: string | null;
  notes: string | null;
  projectId: string | null;
  projectName: string | null;
  interestedUnitId: string | null;
  interestedUnitLabel: string | null;
  assignedToId: string | null;
  assignedToName: string | null;
  convertedCustomerId: string | null;
  nextFollowUpAt: string | null;
  lastContactAt: string | null;
  lostReason: string | null;
  convertedAt: string | null;
  createdAt: string;
  activityCount: number;
  latestActivity: {
    type: LeadActivityType;
    note: string | null;
    outcome: string | null;
    occurredAt: string;
  } | null;
};

export type LeadDetail = LeadRow & {
  project: { id: string; name: string } | null;
  interestedUnit: { id: string; unitNumber: string; unitType: string } | null;
  assignedTo: { id: string; name: string } | null;
  convertedCustomer: { id: string; name: string } | null;
  updatedAt: string;
  activities: {
    id: string;
    type: LeadActivityType;
    note: string | null;
    outcome: string | null;
    occurredAt: string;
    nextFollowUpAt: string | null;
    createdByName: string | null;
  }[];
};

// ───────────────────────────────────────────────────────────
//  Sales module
// ───────────────────────────────────────────────────────────

export type SaleStatus = "PENDING" | "ACTIVE" | "CANCELLED";
export type PaymentStatus = "PENDING" | "PARTIAL" | "PAID";
export type AssetType = "LAND" | "BUILT_UNIT" | "PROJECT";

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
  projectId: string | null;
  projectName: string | null;
  salePrice: number;
  gstRate: number;
  gstAmount: number;
  costBasis: number;
  profit: number;
  saleDate: string;
  status: SaleStatus;
  saleStage: string; // PENDING | DEPOSIT_RECEIVED | COMPLETED | CANCELLED
  depositAmount: number | null;
  depositDate: string | null;
  finalSaleDate: string | null;
  saleDeedNo: string | null;
  expectedRegistryDate: string | null;
  // Sale compliance documents
  allotmentLetterNo: string | null;
  allotmentDate: string | null;
  bbaNo: string | null;
  bbaDate: string | null;
  // TDS tracking
  tdsAmount: number | null;
  tdsCertificateNo: string | null;
  // Home loan tracking
  homeLoanBank: string | null;
  homeLoanAmount: number | null;
  homeLoanSanctionNo: string | null;
  homeLoanSanctionDate: string | null;
  // Deal terms
  dealMaturityMonths: number | null;
  dealMaturityDate: string | null;
  paymentCycle: string | null;
  // Broker / deal source
  dealSource: "SELF" | "BROKER";
  brokerId: string | null;
  brokerName: string | null;
  brokerPhone: string | null;
  brokerAgency: string | null;
  commissionAmount: number | null;
  commissionIsPartOfDeal: boolean;
  commissionPaid: boolean;
  commissionPaidDate: string | null;
  // Sale expenses
  expenses: {
    id: string;
    head: "REGISTRY" | "STAMP_DUTY" | "TRANSFER" | "LEASE_RENT" | "GST" | "OTHER";
    label: string | null;
    amount: number;
    borneBy: "CLIENT" | "SELLER" | "NA";
    isIncluded: boolean;
  }[];
  // Sale terms
  terms: {
    id: string;
    description: string;
    extraAmount: number | null;
    isIncluded: boolean;
  }[];
  // Payment schedule
  paymentSchedule: {
    type: "CLP" | "TLP" | "DPP";
    totalAmount: number;
    items: {
      installmentNo: number;
      description: string;
      percentage: number;
      amount: number;
      dueDate: string | null;
      status: string;
      paidAmount: number;
    }[];
  } | null;
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
  costType: "LABOUR" | "OVERHEAD" | "EQUIPMENT" | "CONTRACTOR" | "PERMIT" | "TRANSFER_DUTY" | "OTHER";
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
  projectReraNumber: string | null;
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
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
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
  projectId: string | null;
  projectName: string | null;
  phaseId: string | null;
  phaseName: string | null;
  status: RequisitionStatus;
  requestDate: string;
  neededByDate: string | null;
  notes: string | null;
  convertedPoId: string | null;
  lineCount: number;
  totalQty: number;
  quoteCount?: number;
  minQuotesRequired?: number;
  quotesWaived?: boolean;
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
    currentStock: number | null;
    lastRate: number | null;
    lastRateDate: string | null;
    preferredSupplier: { id: string; name: string; phone: string | null } | null;
  }[];
  quotes?: {
    count: number;
    minRequired: number;
    waived: boolean;
    waivedReason: string | null;
    gateSatisfied: boolean;
    cheapest: { id: string; supplierName: string; landedTotal: number } | null;
    selected: { id: string; supplierName: string; landedTotal: number } | null;
  };
};

// ───────────────────────────────────────────────────────────
//  Comparative Quote Engine types
// ───────────────────────────────────────────────────────────

export type QuoteStatus = "PENDING" | "SELECTED" | "REJECTED";

export type VendorQuoteRow = {
  id: string;
  supplierId: string;
  supplierName: string;
  supplierPhone: string | null;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  landedTotal: number;
  validUntil: string | null;
  isCheapest: boolean;
  status: QuoteStatus;
  selectedAt: string | null;
  selectionReason: string | null;
  submittedBy: { id: string; name: string } | null;
  selectedBy: { id: string; name: string } | null;
  notes: string | null;
  varianceVsCheapest: number;
  createdAt: string;
  deliveryTermsType: "DELIVERED_SITE" | "EX_WORKS" | "FOR_STATION" | "CUSTOM";
  deliveryTerms: string | null;
  buyerTransportTotal: number;
  paymentTerms: string | null;
  leadTimeDays: number | null;
  warranty: string | null;
  subtotal: number;
  gstTotal: number;
  freightTotal: number;
  loadingTotal: number;
  packingTotal: number;
  insuranceTotal: number;
  discountTotal: number;
  handlingTotal: number;
  lines: {
    id: string;
    materialId: string;
    materialCode: string;
    materialName: string;
    unit: string;
    qty: number;
    unitPrice: number;
    gstRate: number;
    gstAmount: number;
    discountPerUnit: number;
    packingPerUnit: number;
    freightPerUnit: number;
    loadingPerUnit: number;
    insurancePerUnit: number;
    handlingPerUnit: number;
    buyerTransportPerUnit: number;
    unitLandedCost: number;
    taxableValue: number;
    lineSubtotal: number;
    lineTotal: number;
  }[];
};

export type ComparativeStatement = {
  requisition: {
    id: string;
    reqNumber: string;
    status: RequisitionStatus;
    minQuotesRequired: number;
    quotesWaived: boolean;
    quotesWaivedReason: string | null;
    quotesLockedAt: string | null;
  };
  quotes: VendorQuoteRow[];
  cheapestQuoteId: string | null;
  selectedQuoteId: string | null;
  nonRejectedCount: number;
  gateSatisfied: boolean;
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
  // Budget context (null for COMPANY-scoped POs or projects without a budget)
  projectBudget: number | null;
  projectSpent: number | null;
  budgetRemaining: number | null;
  budgetUtilizationPct: number | null;
  wouldExceedBudget: boolean;
  // Urgency: "overdue" | "due_today" | "due_this_week" | "normal"
  urgency: string;
};

export type ApprovalReqLineDetail = {
  materialId: string;
  materialName: string;
  materialCode: string;
  unit: string;
  qtyRequested: number;
  currentStock: number | null;
  lastRate: number | null;
  lastRateDate: string | null;
};

export type ApprovalReqRow = {
  id: string;
  reqNumber: string;
  projectName: string | null;
  phaseName: string | null;
  status: string;
  lineCount: number;
  totalQty: number;
  requestedByName: string | null;
  neededByDate: string | null;
  createdAt: string;
  canApprove: boolean;
  // Budget context (null for projects without a budget)
  projectBudget: number | null;
  projectSpent: number | null;
  budgetRemaining: number | null;
  budgetUtilizationPct: number | null;
  wouldExceedBudget: boolean;
  // Urgency: "overdue" | "due_today" | "due_this_week" | "normal"
  urgency: string;
  // Line-level stock/rate context for the approver
  lineDetails: ApprovalReqLineDetail[];
};


