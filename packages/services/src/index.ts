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
  approvePurchaseOrder,
  orderPurchaseOrder,
  cancelPurchaseOrder,
  receiveGoods,
} from "./procurement";

// Transfer — company→project stock movements
export {
  createTransfer,
  completeTransfer,
  cancelTransfer,
} from "./transfer";

// Issue — material consumption into projects
export { issueMaterialsToProject } from "./issue";

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
