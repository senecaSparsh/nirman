// Moving Average Cost — pure functions
export {
  computeMovingAverageCost,
  stockValueAfterIssue,
  movementDirection,
  type MovementDirection,
} from "./moving-average-cost";

// Stock Ledger — the only sanctioned way to change stock
export {
  recordMovement,
  recordTransfer,
  withStockTransaction,
  refreshMaterialCurrentCost,
} from "./stock-ledger";

// Valuation — derived financial reporting
export {
  materialInventoryValue,
  materialInventoryValueByLocation,
  unsoldAssetValue,
  projectTotalCost,
  projectRevenue,
  projectPnl,
  reallocateProjectCosts,
} from "./valuation";

// Procurement — Purchase Order lifecycle
export {
  createPurchaseOrder,
  createPurchaseOrderTx,
  approvePurchaseOrder,
  orderPurchaseOrder,
  cancelPurchaseOrder,
  receiveGoods,
} from "./procurement";

// Transfer — company→project stock movements (intra + inter-company STO)
export {
  createTransfer,
  completeTransfer,
  cancelTransfer,
  computeTransferPrice,
  type TransferPriceLineInput,
  type TransferPriceLineResult,
  type TransferPriceResult,
} from "./transfer";

// Issue — material consumption into projects or departments (cost centers)
export { issueMaterialsToProject, issueMaterialsToDepartment } from "./issue";

// Stock Count — physical reconciliation
export {
  createStockCount,
  confirmStockCount,
  reconcileStockCount,
} from "./stock-count";

// Partition — land subdivision
export {
  partitionLandParcel,
  updateParcelValuation,
  setParcelStatus,
  validateAreaConservation,
  allocateCostByArea,
} from "./partition";

// Sale — asset sales + payments
export {
  sellAsset,
  recordPayment,
  cancelSale,
  computeSaleProfit,
  computePaymentStatus,
} from "./sale";

// Land — land purchases
export { recordLandPurchase } from "./land";

// Built Units — sellable units within projects
export {
  createBuiltUnits,
  updateUnitStatus,
  updateUnitValuation,
} from "./built-unit";

// Project Cost — labour/overhead/etc.
export {
  addProjectCost,
  deleteProjectCost,
} from "./project-cost";

// Soft Delete — safe deletion with guards
export {
  softDelete,
  restoreEntity,
} from "./soft-delete";

// Audit — immutable action log
export {
  logAction,
  getAuditTrail,
} from "./audit";

// Equipment — discrete trackable assets (machinery, tools, vehicles)
export {
  createEquipment,
  assignEquipment,
  returnEquipment,
  recordMaintenance,
  completeMaintenance,
  retireEquipment,
  unretireEquipment,
  computeDepreciatedValue,
} from "./equipment";

// Requisition — material request → approve → convert to PO
export {
  createRequisition,
  submitRequisition,
  approveRequisition,
  rejectRequisition,
  convertRequisitionToPo,
} from "./requisition";

// Auto-Requisition — generate DRAFT requisitions from reorder-point breaches
export { generateAutoRequisition, type AutoRequisitionResult } from "./auto-requisition";

// Procurement Routing — Logistics Decision Engine (LCI → central vs direct buying)
export {
  computeLogisticsComplexityIndex,
  decideProcurementScope,
  parseLciWeights,
  evaluateRequisitionRouting,
  getCachedRoutingScope,
  DEFAULT_LCI_WEIGHTS,
  DEFAULT_LCI_THRESHOLD,
  type LciWeights,
  type LciFactors,
  type LineRoutingResult,
  type RoutingDecision,
  type ProcurementScope as RoutingProcurementScope,
} from "./procurement-routing";

// Supplier Return — return defective/excess materials
export {
  createSupplierReturn,
  submitSupplierReturn,
  completeSupplierReturn,
  cancelSupplierReturn,
} from "./supplier-return";

// Alerts & Reporting — low-stock, aging, NRV write-downs
export {
  lowStockAlerts,
  inventoryAgingReport,
  flagNrvWriteDowns,
  computeNrvWriteDown,
} from "./alerts";

// General Ledger — double-entry bookkeeping + GST posting
export {
  seedChartOfAccounts,
  postJournalEntry,
  postPurchaseReceipt,
  postMaterialIssue,
  postMaterialIssueToDepartment,
  postAssetSale,
  postPaymentReceived,
  postProjectCost,
  postExpense,
  postSupplierReturn,
  postLandPurchase,
  trialBalance,
  accountLedger,
  CHART_OF_ACCOUNTS,
  ACCT,
  type JournalLineInput,
  type PostJournalInput,
} from "./gl-posting";

// Task Service — execution engine (subtasks, comments, activity, dependencies, time)
export {
  createTask,
  updateTaskStatus,
  reassignTask,
  addSubTask,
  toggleSubTask,
  deleteSubTask,
  reorderSubTasks,
  addComment,
  deleteComment,
  addDependency,
  removeDependency,
  startTimer,
  stopTimer,
  getTaskDetail,
  computeProgress,
  isBlocked,
  formatDuration,
  totalLoggedMinutes,
  TaskError,
  type CreateTaskInput,
  type StatusChangeInput,
  type ReassignInput,
} from "./task";

// Partition geometry — pure polygon functions for the CAD/GIS partition canvas
export {
  signedArea,
  polygonArea,
  ensureCCW,
  segmentIntersection,
  pointInPolygon,
  centroid,
  splitConvexPolygon,
  rectangle,
  centeredRectangle,
  areaRatios,
  boundingBox,
  normalizePolygon,
  toSvgPath,
  sub,
  add,
  scale,
  cross,
  dot,
  length,
  type Point,
  type Polygon,
  type Segment,
} from "./geometry";
