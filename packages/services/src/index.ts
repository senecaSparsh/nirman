// Status-bearing error for service validation failures
export { ServiceError } from "./errors";

// Optimistic locking — concurrent edit conflict detection
export { ConcurrentEditError, extractVersion } from "./optimistic-locking";

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
  getLotHistory,
} from "./stock-ledger";

// UOM Conversion — pure functions for base/secondary unit conversion
export {
  toBaseUnit,
  toSecondaryUnit,
  displayQty,
  type UomMaterial,
} from "./uom-conversion";

// Valuation — derived financial reporting
export {
  materialInventoryValue,
  materialInventoryValueByLocation,
  unsoldAssetValue,
  projectTotalCost,
  projectRevenue,
  projectPnl,
  reallocateProjectCosts,
  getCompanyPortfolioSummary,
  getRealEstateInventory,
  type CompanyPortfolioSummary,
  type PortfolioProjectSummary,
  type RealEstateInventorySummary,
  type RealEstateProjectSummary,
  type MonthlyAddition,
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
export { issueMaterialsToProject, issueMaterialsToDepartment, amountInWords } from "./issue";

// Scrap / "Create" Material Generation — internally generated material at scrap valuation
export {
  createScrapGeneration,
  listScrapGenerations,
  getScrapGeneration,
  type CreateScrapGenerationInput,
} from "./scrap";

// Standard Consumption Benchmarks — per-work-type standard material consumption rates
// used by the auto-scrap detection logic during DPR submission
export {
  createStandardConsumption,
  updateStandardConsumption,
  deleteStandardConsumption,
  listStandardConsumptions,
  listWorkTypes,
  calculateConsumptionVariance,
  runDprVarianceAnalysis,
  type CreateStandardConsumptionInput,
  type ConsumptionVariance,
  type DprVarianceResult,
} from "./standard-consumption";

// Integration Config — per-company credentials for Tally, WhatsApp, Email, Portals
export {
  encryptSecret,
  decryptSecret,
  getIntegrationConfig,
  listIntegrationConfigs,
  listIntegrationConfigsMasked,
  upsertIntegrationConfig,
  deleteIntegrationConfig,
  verifyIntegration,
  getIntegrationStatus,
  createTallyProviderFromConfig,
  createWhatsAppProviderFromConfig,
  createEmailProviderFromConfig,
  createPortalProviderFromConfig,
  SmtpEmailProvider,
  INTEGRATION_SCHEMAS,
  type IntegrationSchema,
  type IntegrationFieldSchema,
} from "./integration-config";

// Auto-Sync — automatic Tally sync after GL posting (if configured)
export { autoSyncEntryToTally, autoSyncBatchToTally } from "./auto-sync";

// Tally ERP Integration — generate Tally XML vouchers, sync via pluggable provider
export {
  generateTallyVoucherXml,
  syncEntryToTally,
  syncBatchToTally,
  syncFromTally,
  fetchTallyCollections,
  getUnsyncedEntries,
  getTallySyncLog,
  getTallySyncStats,
  StubTallyProvider,
  HttpTallyProvider,
  createTallyProvider,
  parseTallyResponse,
  type TallyProvider,
  type TallySyncResult,
} from "./tally";

// Notifications — WhatsApp / email / in-app alerts with pluggable providers
export {
  sendNotification,
  notifyLowStock,
  notifyTaskAssignment,
  notifyQuoteApproval,
  renderTemplate,
  listNotificationTemplates,
  upsertNotificationTemplate,
  listNotificationLogs,
  getNotificationStats,
  createInAppNotification,
  getUnreadNotifications,
  getUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getUnreadCount,
  getUserPreferences,
  upsertNotificationPreference,
  isNotificationEnabled,
  StubWhatsAppProvider,
  CloudWhatsAppProvider,
  createWhatsAppProvider,
  StubEmailProvider,
  type WhatsAppProvider,
  type EmailProvider,
  type NotificationSendResult,
  type SendNotificationInput,
  type WhatsAppTemplateComponent,
} from "./notifications";

// Notification Event Bus — event-driven notification system
export {
  emitNotificationEvent,
  NotificationEventType,
  ALL_EVENT_TYPES,
  EVENT_URGENCY,
  type NotificationEvent,
  type NotificationUrgency,
  type NotificationChannel,
} from "./notification-event-bus";

export {
  processPendingNotifications,
  getEventNotificationStats,
} from "./notification-handlers";

// Portal Listings — sync built units to 99acres / MagicBricks / Housing.com
export {
  createPortalListing,
  syncListingToPortal,
  delistPortalListing,
  listPortalListings,
  updatePortalListing,
  deletePortalListing,
  getPortalListingStats,
  getUnitListings,
  StubPortalProvider,
  ManualPortalProvider,
  HttpPortalProvider,
  NineAcresProvider,
  MagicBricksProvider,
  HousingProvider,
  createPortalProvider,
  type PortalProvider,
  type PortalSyncResult,
  type CreatePortalListingInput,
  type PortalListingPayload,
  type PortalFieldMapping,
} from "./portal-listing";

// Direct Purchase — simplified purchase log for local/ad-hoc buys
export { createDirectPurchase, listDirectPurchases } from "./direct-purchase";

// Supplier Payment — pay down accounts payable
export { createSupplierPayment, getSupplierPayments, getSupplierOutstanding } from "./supplier-payment";

// Supplier Invoice — three-way matching (invoice ↔ PO ↔ GRN) before payment
export {
  createSupplierInvoice,
  threeWayMatch,
  approveSupplierInvoice,
  getSupplierInvoices,
  getSupplierInvoice,
  type InvoiceLineInput,
  type MatchVariance,
  type ThreeWayMatchResult,
} from "./supplier-invoice";

// Stock Count — physical reconciliation
export {
  createStockCount,
  confirmStockCount,
  reconcileStockCount,
  deleteStockCount,
} from "./stock-count";

// Partition — land subdivision
export {
  partitionLandParcel,
  updateParcelValuation,
  updateParcelDetails,
  setParcelStatus,
  validateAreaConservation,
  allocateCostByArea,
  allocatePartitionCosts,
} from "./partition";
export type { AllocationModel } from "./partition";

// Sale — asset sales + payments + staged deposit flow
export {
  sellAsset,
  recordDeposit,
  completeSale,
  recordPayment,
  cancelSale,
  computeSaleProfit,
  computePaymentStatus,
} from "./sale";
export type { SellAssetInput, RecordDepositInput, CompleteSaleInput, RecordPaymentInput } from "./sale";

// Material Sale — sell inventory items to customers
export {
  createMaterialSale,
  cancelMaterialSale,
  type CreateMaterialSaleInput,
  type MaterialSaleLineInput,
} from "./material-sale";

// Material Sale Payment — partial / additional payments against material sales
export { createMaterialSalePayment, getMaterialSalePayments } from "./sale-payment";

// Renovation / Value-Add — track enhancement work on existing assets
export {
  createRenovation,
  startRenovation,
  addRenovationCost,
  deleteRenovationCost,
  completeRenovation,
  cancelRenovation,
  computeRoi,
  type CreateRenovationInput,
  type AddRenovationCostInput,
} from "./renovation";

// Land — land purchases
export { recordLandPurchase } from "./land";

// Built Units — sellable units within projects
export {
  createBuiltUnits,
  updateBuiltUnit,
  updateUnitStatus,
  updateUnitValuation,
  purchaseBuiltUnit,
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

// Comparative Quote Engine — vendor quote upload, cheapest-flagging, winner selection, gate
export {
  createVendorQuote,
  updateVendorQuote,
  deleteVendorQuote,
  selectWinningQuote,
  waiveQuoteRequirement,
  getComparativeStatement,
  getWinningQuoteLineCosts,
  cheapestQuoteId,
  quoteVariances,
  isQuoteGateSatisfied,
  winningLineCosts,
  type CreateVendorQuoteInput,
  type UpdateVendorQuoteInput,
  type SelectWinnerInput,
  type WaiveQuotesInput,
  getPurchaserPerformance,
  type PurchaserPerformanceRow,
} from "./quote-comparison";

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
  postMaterialSale,
  postPaymentReceived,
  postDepositReceived,
  postDepositRefund,
  postMaterialSalePayment,
  postProjectCost,
  postRaBillApproval,
  postRenovationCost,
  postExpense,
  postSupplierReturn,
  postLandPurchase,
  postPayroll,
  postPayrollPayment,
  postDirectPurchase,
  postStockAdjustment,
  postEquipmentAcquisition,
  postEquipmentMaintenance,
  postEquipmentRetirement,
  postSecurityDepositReceived,
  postSecurityDepositRefunded,
  reverseJournalEntry,
  trialBalance,
  accountLedger,
  CHART_OF_ACCOUNTS,
  ACCT,
  type JournalLineInput,
  type PostJournalInput,
} from "./gl-posting";

// GL Preview — pure functions that compute journal lines without persisting
export {
  previewExpenseGl,
  previewProjectCostGl,
  previewPurchaseReceiptGl,
  previewMaterialIssueGl,
  previewAssetSaleGl,
  previewStockAdjustmentGl,
  previewPayrollGl,
  type GlPreviewLine,
} from "./gl-preview";

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

// HR & Field Workforce — crews, attendance, payroll (+GL), DPR
export {
  createCrew,
  updateCrew,
  deleteCrew,
  createEmployee,
  updateEmployee,
  recordAttendance,
  bulkRecordAttendance,
  generatePayroll,
  updatePayrollLine,
  processPayroll,
  payPayroll,
  submitDPR,
  createDpr,
  updateDpr,
  deleteDpr,
  deleteAttendance,
  projectProgressHistory,
  workforceProductivity,
  attendanceSummary,
  dprAnalysis,
  payrollSummary,
  dprFinanceReconciliation,
  markDprCostPosted,
  attendanceWeight,
  computeDaysWorked,
  computeOvertimeHours,
  computeWorkingDays,
  hourlyRateFor,
  computeBasicAmount,
  computeGrossPay,
  computeTotalDeductions,
  computeNetPay,
  HrError,
  type CreateCrewInput,
  type UpdateCrewInput,
  type CreateEmployeeInput,
  type UpdateEmployeeInput,
  type LogAttendanceInput,
  type BulkAttendanceInput,
  type GeneratePayrollInput,
  type AdjustPayrollLineInput,
  type SubmitDprInput,
  type DprMaterialLineInput,
  type DprLaborLineInput,
  subAdminApproveDpr,
  adminApproveDpr,
  rejectDpr,
  resubmitDpr,
  generateMaterialIssueFromDPR,
} from "./hr";

// Leave Management — requests with approval workflow
export {
  createLeaveRequest,
  approveLeaveRequest,
  cancelLeaveRequest,
  leaveBalance,
  type CreateLeaveInput,
  type ApproveLeaveInput,
} from "./leave";

// Tenancy — rent/lease agreements for land parcels and built units
export {
  createTenancy,
  updateTenancy,
  activateTenancy,
  terminateTenancy,
  recordRentPayment,
  type CreateTenancyInput,
  type UpdateTenancyInput,
  type RecordRentInput,
} from "./tenancy";

// Daily Report — site operations log (separate from DPR)
export {
  createDailyReport,
  updateDailyReport,
  deleteDailyReport,
  type CreateDailyReportInput,
} from "./daily-report";

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

export {
  RbacError,
  defaultScopeType,
  resolveScopeType,
  requiresScopeEntries,
  validateScopeEntries,
  wouldCreateCycle,
  resolveUserScope,
  getReportingChain,
  assignScopedMembership,
  getDirectReports,
  type ScopeType,
  type ScopeKind,
  type ResolvedScope,
  type AssignScopeInput,
} from "./rbac";

// BOQ + WBS + Measurement Book + EVM — construction execution backbone
export {
  createBoqItem,
  updateBoqItem,
  deleteBoqItem,
  getBoqTree,
  createWbsNode,
  updateWbsNode,
  deleteWbsNode,
  addWbsDependency,
  removeWbsDependency,
  getWbsTree,
  createMbEntry,
  verifyMbEntry,
  approveMbEntry,
  rejectMbEntry,
  generateMaterialTakeOff,
  getEvmMetrics,
  type CreateBoqItemInput,
  type CreateWbsNodeInput,
  type CreateMbEntryInput,
} from "./boq";

// Subcontractor Work Orders + RA Bills + TDS
export {
  createWorkOrder,
  issueWorkOrder,
  completeWorkOrder,
  payAdvance,
  createRaBill,
  submitRaBill,
  approveRaBill,
  rejectRaBill,
  payRaBill,
  releaseRetention,
  getTdsCertificate,
  listTdsSubcontractors,
  VALID_PAYMENT_MODES,
  type CreateWorkOrderInput,
  type CreateRaBillInput,
  type TdsCertificateData,
} from "./subcontractor";

// Scheduling + EVM + Cost Overrun Forecast
export {
  computeSchedule,
  getNodeEvm,
  getCostOverrunForecast,
} from "./scheduling";

// Advanced Procurement — vendor rating, rate contracts, approval routing, commitments
export {
  computeVendorRating,
  getVendorRankings,
  createRateContract,
  getActiveRateContract,
  getRateContracts,
  cancelRateContract,
  getApprovalRouting,
  getProjectCommitments,
  type VendorRating,
  type CreateRateContractInput,
  type ApprovalRouting,
  type ProjectCommitments,
} from "./procurement-advanced";

// CRM + Sales Workflow — lead pipeline, payment schedules, GST on real estate
export {
  createLead,
  generatePaymentSchedule,
  checkMilestonePayments,
  recordSchedulePayment,
  computeRealEstateGst,
  type LeadSource,
  type LeadStage,
  type LeadPriority,
  type ScheduleType,
  type GeneratePaymentScheduleInput,
} from "./crm";

// Finance Enhancement — profit centers, cash flow, job costing, budget variance
export {
  getProjectProfitCenter,
  getCashFlowForecast,
  getJobCosting,
  getBudgetVariance,
  type ProjectProfitCenter,
  type CashFlowForecast,
  type BudgetVariance,
  type BudgetVarianceItem,
} from "./finance-advanced";

// Material Reconciliation + Cost Control
export {
  getProjectMaterialReconciliation,
  getSiteStockValuation,
  type MaterialReconciliation,
  type ProjectReconciliation,
  type SiteStockValuation,
} from "./reconciliation";

// Excel / XLSX Export — formatted workbook generation for reports
export {
  generateExcelWorkbook,
  buildInventoryValueReport,
  buildPurchaseTrendsReport,
  buildSalesRevenueReport,
  buildProjectProgressReport,
  buildPayrollExpenseReport,
  buildPendingPaymentsReport,
  buildTrialBalanceReport,
  buildStockMovementReport,
  buildPurchaserPerformanceReport,
  buildReconciliationReport,
  buildStockIssueSummaryReport,
  buildStockMovementSummaryReport,
  buildIssueRegisterReport,
  buildPurchaseRegisterReport,
  type ExcelColumn,
  type ExcelSheet,
  type ExcelExportOptions,
  type InventoryValueData,
  type PurchaseTrendsData,
  type SalesRevenueData,
  type ProjectProgressData,
  type PayrollExpenseData,
  type PendingPaymentsData,
  type TrialBalanceData,
  type StockMovementData,
  type PurchaserPerformanceData,
  type ReconciliationData,
  type StockIssueSummaryData,
  type StockMovementSummaryReportData,
  type IssueRegisterReportData,
  type PurchaseRegisterReportData,
} from "./excel-export";
