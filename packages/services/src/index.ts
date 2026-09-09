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

// Serializable transaction helper — for auto-numbered creates and status transitions
export { withSerializableTransaction } from "./transaction";

// Atomic sequence number generator — replaces race-prone count+1 pattern
export { nextSequenceNumber } from "./sequence";

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
  rejectPurchaseOrder,
  orderPurchaseOrder,
  cancelPurchaseOrder,
  addLineToPurchaseOrder,
  receiveGoods,
  rejectDelivery,
} from "./procurement";

// Transfer — company→project stock movements (intra + inter-company STO)
export {
  createTransfer,
  dispatchTransfer,
  completeTransfer,
  cancelTransfer,
  returnTransferToSource,
  computeTransferPrice,
  type TransferPriceLineInput,
  type TransferPriceLineResult,
  type TransferPriceResult,
} from "./transfer";

// Issue — material consumption into projects or departments (cost centers)
export { issueMaterialsToProject, issueMaterialsToDepartment, cancelMaterialIssue, createMaterialIssueRequest, executeMaterialIssue, amountInWords } from "./issue";

// Scrap / "Create" Material Generation — internally generated material at scrap valuation
export {
  createScrapGeneration,
  cancelScrapGeneration,
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
  createHsnSacProviderFromConfig,
  createOcrProviderFromConfig,
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
  notifyPaymentDue,
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

// HSN/SAC Auto-Fetch (D24) — look up HSN/SAC codes and GST rates
export {
  searchHsnSac,
  CbicHsnSacProvider,
  FastGstHsnSacProvider,
  type HsnSacResult,
  type HsnSacProvider,
} from "./hsn-sac";

// OCR (M19) — extract DPR data from photos via AI vision
export {
  StubOcrProvider,
  OpenAiVisionOcrProvider,
  GoogleVisionOcrProvider,
  AzureDiOcrProvider,
  type DprOcrResult,
  type DprOcrMaterialLine,
  type DprOcrLaborLine,
  type OcrProvider,
} from "./ocr";

// Direct Purchase — simplified purchase log for local/ad-hoc buys
export { createDirectPurchase, cancelDirectPurchase, listDirectPurchases } from "./direct-purchase";

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

// Manual Stock Adjustment — opening stock / corrections / write-offs
export {
  recordStockAdjustment,
  type RecordStockAdjustmentInput,
  type StockAdjustmentResult,
  type AdjustmentDirection,
} from "./stock-adjustment";

// Partition — land subdivision
export {
  partitionLandParcel,
  unpartitionLandParcel,
  updateParcelValuation,
  updateParcelDetails,
  setParcelStatus,
  validateAreaConservation,
  allocateCostByArea,
  allocatePartitionCosts,
} from "./partition";
export type { AllocationModel } from "./partition";

// Legal documents — permissions, licenses, NOCs, certificates, agreements to sell
export {
  createLegalDoc,
  updateLegalDoc,
  deleteLegalDoc,
  listLegalDocs,
  listAllLegalDocs,
  checkExpiringLegalDocs,
} from "./legal-docs";
export type { CreateLegalDocInput, UpdateLegalDocInput } from "./legal-docs";

// Sale — asset sales + payments + staged deposit flow
export {
  sellAsset,
  recordDeposit,
  completeSale,
  recordPayment,
  cancelSale,
  updateSale,
  computeSaleProfit,
  computePaymentStatus,
  createSalePaymentSchedule,
  autoGenerateScheduleItems,
  payBrokerCommission,
  clearCheque,
  bounceCheque,
  uploadSaleDocument,
  getPrintableSaleData,
  computePropertyTds,
} from "./sale";
export type {
  SellAssetInput,
  RecordDepositInput,
  CompleteSaleInput,
  RecordPaymentInput,
  UpdateSaleInput,
  SaleExpenseInput,
  SaleTermInput,
  PaymentScheduleInput,
  PaymentScheduleItemInput,
  UploadSaleDocumentInput,
} from "./sale";

// Material Sale — sell inventory items to customers
export {
  createMaterialSale,
  createMaterialSaleRequest,
  executeMaterialSale,
  cancelMaterialSale,
  createMaterialSaleReturn,
  type CreateMaterialSaleInput,
  type MaterialSaleLineInput,
  type MaterialSaleReturnLineInput,
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
export {
  recordLandPurchase,
  recordLandPurchaseWithPlan,
  recordLandPurchaseOrder,
  recordLandPurchasePayment,
  uploadLandPurchaseDocument,
  completeLandPurchase,
  clearLandPurchaseCheque,
  bounceLandPurchaseCheque,
  createLandPaymentSchedule,
  getLandPaymentSchedule,
  markPossession,
} from "./land";
export type {
  LandPurchaseOrderInput,
  RecordLandPurchasePaymentInput,
  UploadLandPurchaseDocumentInput,
  CompleteLandPurchaseInput,
  CreateLandPaymentScheduleInput,
  LandPaymentScheduleItemInput,
  MarkPossessionInput,
} from "./land";

// Land cost components — arbitrary / recurring / future costs
export {
  addLandCostComponent,
  updateLandCostComponent,
  deleteLandCostComponent,
  recomputeLandTotalCost,
  refreshLandTotalCost,
  effectivePostedAmount,
  scheduledTotal,
} from "./land-cost-component";

// Built Units — sellable units within projects
export {
  createBuiltUnits,
  updateBuiltUnit,
  updateUnitStatus,
  updateUnitValuation,
  purchaseBuiltUnit,
  purchaseBuiltUnits,
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

// Expenses — full expense-booking lifecycle (DRAFT→PENDING→APPROVED|REJECTED)
// with GL posting on approval, category master, GST/TDS breakdown.
export {
  createExpense,
  updateExpense,
  submitExpense,
  approveExpense,
  rejectExpense,
  deleteExpense,
  createExpenseCategory,
  updateExpenseCategory,
  deleteExpenseCategory,
  type CreateExpenseInput,
  type UpdateExpenseInput,
  type CreateCategoryInput,
} from "./expense";

// Expense claims — employee reimbursement lifecycle
export {
  createExpenseClaim,
  addClaimLine,
  removeClaimLine,
  submitExpenseClaim,
  approveExpenseClaim,
  rejectExpenseClaim,
  payExpenseClaim,
  type CreateClaimInput,
  type AddClaimLineInput,
} from "./expense-claim";

// Petty cash — site/office cash floats + top-ups
export {
  createPettyCashFloat,
  topUpPettyCash,
  recordPettyCashSpend,
  type CreateFloatInput,
  type TopUpInput,
} from "./petty-cash";

// Recurring expenses — templates + due-generation scheduler
export {
  createRecurringExpense,
  generateDueRecurringExpenses,
  type CreateRecurringInput,
} from "./recurring-expense";

// Expense budgets — budget vs actuals variance
export {
  setExpenseBudget,
  getExpenseBudgetVariance,
  checkExpenseBudget,
  type SetBudgetInput,
  type ExpenseBudgetVariance,
} from "./expense-budget";

// Equipment — discrete trackable assets (machinery, tools, vehicles)
export {
  createEquipment,
  assignEquipment,
  returnEquipment,
  recordMaintenance,
  completeMaintenance,
  retireEquipment,
  unretireEquipment,
  sellEquipment,
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

// HSN / GST Master — government-provided HSN codes with auto-pick GST rates
export {
  seedHsnGstRates,
  lookupGstByHsn,
  suggestHsnByMaterial,
  searchHsnGst,
  type HsnGstEntry,
} from "./hsn-gst";

// Material Code Auto-Generation — {CATEGORY_PREFIX}-{GRADE}-{SEQ}
export { generateMaterialCode, previewMaterialCode } from "./material-code";
export { autoFillHsnGst, quickCreateMaterial } from "./material-service";

// Standalone Quotation Request — employee collects supplier quotes with
// per-piece landed cost comparative analysis; approved by direct manager
export {
  createQuotationRequest,
  addQuoteToRequest,
  approveQuotation,
  getPendingApprovalsForManager,
  getComparativeMatrix,
  listQuotationRequests,
  computeLineLandedCost,
  computeQuoteTotals,
  type CreateQuotationRequestInput,
  type AddQuoteToRequestInput,
  type ApproveQuotationInput,
  type LineLandedCostInput,
  type LineLandedCostResult,
  type QuoteTotalsResult,
} from "./quotation";

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

// Vehicle Master + Trip Log — auto-builds vehicle list from every goods movement
export {
  recordVehicleTrip,
  searchVehicles,
  getVehicleHistory,
  listVehicles,
  createVehicle,
  VEHICLE_TYPES,
  VEHICLE_TYPE_LABELS,
  type VehicleType,
  type VehicleTripInput,
  type CreateVehicleInput,
} from "./vehicle";

// Alerts & Reporting — low-stock, aging, NRV write-downs, lease expiry, EOQ
export {
  lowStockAlerts,
  inventoryAgingReport,
  flagNrvWriteDowns,
  computeNrvWriteDown,
  leaseExpiryAlerts,
  computeWilsonEoq,
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
  postLandCostComponent,
  postPayroll,
  postPayrollPayment,
  postDirectPurchase,
  postStockAdjustment,
  postTransferShortage,
  postInterCompanyTransfer,
  postEquipmentAcquisition,
  postEquipmentMaintenance,
  postEquipmentRetirement,
  postEquipmentSale,
  postDepreciation,
  postSecurityDepositReceived,
  postSecurityDepositRefunded,
  postSaleExpense,
  postBrokerCommission,
  postBrokerCommissionPaid,
  reverseJournalEntry,
  trialBalance,
  accountLedger,
  CHART_OF_ACCOUNTS,
  ACCT,
  type JournalLineInput,
  type PostJournalInput,
} from "./gl-posting";

// GST reconciliation reports (GSTR-1, GSTR-3B) + CGST/SGST/IGST split utilities
export {
  generateGstr1,
  generateGstr3b,
  getStateCodeFromGstin,
  isIntraState,
  splitGst,
} from "./gst-reports";

// e-Invoicing — NIC e-Invoice API integration (IRN + QR code)
export {
  generateMaterialSaleIrn,
  generateAssetSaleIrn,
  cancelMaterialSaleIrn,
  cancelAssetSaleIrn,
  buildMaterialSaleEInvoicePayload,
  buildAssetSaleEInvoicePayload,
  setEInvoiceProvider,
  isEInvoiceConfigured,
  type EInvoicePayload,
  type EInvoiceProvider,
  type EInvoiceResult,
} from "./e-invoice";

// GL Preview — pure functions that compute journal lines without persisting
export {
  previewExpenseGl,
  previewProjectCostGl,
  previewLandCostComponentGl,
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
  computeStatusFromHours,
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
  combineTimeWithDate,
  computeAttendanceTier,
  type AttendanceTier,
  type AttendanceWithTier,
  getAttendanceWithTiers,
  getAttendanceTierCounts,
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

// Employee Dossier — employment terms, bank, tax, benefits, emergency contact, address
export {
  updateEmployeeDossier,
  createEmployeeBenefit,
  updateEmployeeBenefit,
  deleteEmployeeBenefit,
  createSalaryComponent,
  updateSalaryComponent,
  deleteSalaryComponent,
  setSalaryComponents,
  type EmployeeDossierInput,
  type CreateBenefitInput,
  type UpdateBenefitInput,
  type CreateSalaryComponentInput,
  type UpdateSalaryComponentInput,
  type SalaryComponentTypeInput,
  type ComponentFrequencyInput,
} from "./employee-dossier";

// Employee Account Linking — connects Employee (HR) ↔ User (auth) ↔ CompanyPhone (call tracking)
export {
  createEmployeeAccount,
  linkEmployeeToUser,
  assignPhoneToEmployee,
  unlinkEmployeePhone,
  terminateEmployee,
  syncEmployeeUser,
  checkPhoneAvailability,
  findAvailablePhoneNumbers,
  getEmployeeTelephonyCost,
  generateEmploymentAgreement,
  confirmEmploymentAgreement,
  generateOfferLetter,
  generateAppointmentLetter,
  generateEmployeeIdCard,
  setupAutoDeposit,
  disableAutoDeposit,
  type CreateEmployeeAccountInput,
  type LinkEmployeeToUserInput,
  type AssignPhoneToEmployeeInput,
  type TerminateEmployeeInput,
  type ModulePermission,
  type ScopeEntry,
  type EmployeeTelephonyCost,
} from "./employee-account";

// SMS Parser — auto payment entry from bank SMS notifications
export {
  parseSms,
  ingestSms,
  ingestSmsBatch,
  manualMatchSms,
  getSmsStats,
  type ParsedSms,
  type IngestSmsInput,
  type IngestSmsResult,
  type ManualMatchInput,
} from "./sms-parser";

// Tenancy — rent/lease agreements for land parcels and built units
export {
  createTenancy,
  updateTenancy,
  activateTenancy,
  terminateTenancy,
  recordRentPayment,
  applyRentEscalation,
  processDueEscalations,
  changeTenant,
  generateRentSchedule,
  generateDueRentSchedules,
  sendRentDueReminders,
  uploadRentAgreement,
  uploadDraft,
  type CreateTenancyInput,
  type UpdateTenancyInput,
  type RecordRentInput,
  type ApplyEscalationInput,
  type ChangeTenantInput,
  type GenerateRentScheduleInput,
  type UploadAgreementInput,
  type UploadDraftInput,
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

// Rate Analysis — BOQ line item rate breakdown (material + labour + equipment + overhead + profit)
export {
  createRateAnalysis,
  getRateAnalysis,
  updateRateAnalysis,
  deleteRateAnalysis,
  computeRateAnalysis,
  type ComponentType,
  type LineBasis,
  type RateAnalysisLineInput,
  type CreateRateAnalysisInput,
  type UpdateRateAnalysisInput,
  type RateAnalysisComputation,
} from "./rate-analysis";

// Change Order — project scope/budget/schedule modifications with approval workflow
export {
  createChangeOrder,
  getChangeOrders,
  getChangeOrder,
  updateChangeOrder,
  submitChangeOrder,
  approveChangeOrder,
  rejectChangeOrder,
  cancelChangeOrder,
  implementChangeOrder,
  deleteChangeOrder,
  type ChangeOrderType,
  type ChangeOrderReason,
  type ChangeOrderStatus,
  type ChangeOrderLineInput,
  type CreateChangeOrderInput,
  type UpdateChangeOrderInput,
} from "./change-order";

// Quality Control — NCR (Non-Conformance Reports) + CAPA (Corrective And Preventive Actions)
export {
  createNcr,
  getNcrs,
  getNcr,
  updateNcr,
  reviewNcr,
  closeNcr,
  cancelNcr,
  deleteNcr,
  createCapa,
  getCapa,
  updateCapa,
  startCapa,
  completeCorrectiveAction,
  completePreventiveAction,
  verifyCapa,
  closeCapa,
  type NcrSeverity,
  type NcrStatus,
  type NcrCategory,
  type CapaStatus,
  type CreateNcrInput,
  type UpdateNcrInput,
  type ReviewNcrInput,
  type CreateCapaInput,
  type UpdateCapaInput,
} from "./quality-control";

// Safety Management — Incidents, Hazards, Inspections
export {
  computeRiskLevel,
  createIncident, getIncidents, getIncident, updateIncident, investigateIncident, closeIncident, cancelIncident, deleteIncident,
  createHazard, getHazards, getHazard, updateHazard, startMitigation, resolveHazard, deleteHazard,
  createInspection, getInspections, getInspection, updateInspection, startInspection, completeInspection, cancelInspection, deleteInspection,
  type IncidentType, type IncidentSeverity, type IncidentStatus,
  type HazardStatus, type HazardRiskLevel,
  type InspectionResult, type SafetyInspectionStatus,
  type CreateIncidentInput, type UpdateIncidentInput, type InvestigateIncidentInput,
  type CreateHazardInput, type CreateInspectionInput,
} from "./safety";

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
  recordLeadActivity,
  updateLeadStage,
  convertLeadToCustomer,
  deleteLead,
  computeLeadScore,
  isLeadStageTransitionAllowed,
  generatePaymentSchedule,
  checkMilestonePayments,
  recordSchedulePayment,
  sendPaymentDueReminders,
  computeRealEstateGst,
  type LeadSource,
  type LeadStage,
  type LeadPriority,
  type LeadActivityType,
  type CreateLeadInput,
  type RecordLeadActivityInput,
  type UpdateLeadStageInput,
  type ConvertLeadInput,
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

// Gate Pass — outbound gate pass with approval workflow
export {
  createGatePass,
  submitGatePass,
  approveGatePass,
  rejectGatePass,
  resubmitGatePass,
  confirmExit,
  cancelGatePass,
  assertGatePassApproved,
  autoCreateGatePassFromRef,
  type CreateGatePassInput,
  type GatePassLineInput,
  type ConfirmExitInput,
} from "./gate-pass";

// Web Push notifications
export { sendPushToUser, sendPushToApprovers, isPushConfigured, getVapidPublicKey, type PushPayload } from "./push";

// Instant Feedback — screenshot + voice + text feedback from any user
export {
  createFeedback,
  listFeedback,
  getFeedback,
  markFeedbackRead,
  resolveFeedback,
  archiveFeedback,
  reopenFeedback,
  getFeedbackStats,
  type CreateFeedbackInput,
} from "./feedback";

// Books Reconciliation — the "trust surface" that ties operational ledgers to the GL
export {
  runBookReconciliation,
  reconcileStockLedger,
  reconcileInventoryGl,
  reconcileLandCosts,
  reconcileUnitCosts,
  reconcileTrialBalance,
  decimalDelta,
  statusForDelta,
  buildCheck,
  summarizeChecks,
  type CheckStatus,
  type ReconciliationDetail,
  type ReconciliationCheck,
  type ReconciliationSummary,
  type ReconciliationReport,
} from "./reconciliation-health";
