/**
 * Department Activity — maps audit-log action prefixes to departments so
 * each dashboard can show a live, department-scoped activity feed.
 *
 * The AuditLog table is the single source of truth — every mutation in the
 * system already calls `logAction()` with an `action` string like
 * "PURCHASE_ORDER_CREATE". This module groups those actions by department
 * and humanizes them for display.
 *
 * Design rules:
 *  - Each action prefix belongs to exactly ONE department (no overlaps).
 *  - Prefixes are matched with `startsWith` — "MATERIAL_" catches
 *    "MATERIAL_CREATE", "MATERIAL_UPDATE", etc.
 *  - There is NO exclusion mechanism. The query is an OR of startsWith
 *    predicates. To keep an action out of a department, simply don't list
 *    its prefix there. E.g. MATERIAL_SALE_* is listed under `sales`, not
 *    under `inventory` — it is never listed in inventory.
 */

import { PERM } from "@/lib/roles";

export type DepartmentKey =
  | "inventory"
  | "procurement"
  | "sales"
  | "finance"
  | "hr"
  | "projects"
  | "land"
  | "crm"
  | "safety"
  | "quality";

interface DepartmentDef {
  /** Display label for the feed header */
  label: string;
  /**
   * Permission required to view this department's activity feed.
   * Mirrors the pattern used by all other department APIs
   * (e.g. /api/purchase-orders requires PROCUREMENT_VIEW).
   */
  viewPermission: string;
  /**
   * Action prefixes that belong to this department.
   * Each prefix must appear in exactly ONE department — no overlaps.
   * The query uses OR of startsWith for all prefixes, so listing a
   * prefix here means ALL actions starting with it will appear in
   * this department's feed. Do NOT list "exception" prefixes here
   * expecting them to be excluded — there is no exclusion mechanism.
   */
  prefixes: string[];
}

export const DEPARTMENTS: Record<DepartmentKey, DepartmentDef> = {
  inventory: {
    label: "Inventory",
    viewPermission: PERM.INVENTORY_VIEW,
    prefixes: [
      "MATERIAL_CATEGORY_RESTORE",
      "MATERIAL_CATEGORY_CREATE",
      "MATERIAL_QUICK_CREATE_RESTORE",
      "MATERIAL_QUICK_CREATE",
      "MATERIAL_RESTORE",
      "MATERIAL_LOT_CREATE",
      "MATERIAL_ISSUE_DEPARTMENT_CREATE",
      "MATERIAL_ISSUE_EXECUTE",
      "MATERIAL_ISSUE_CANCEL",
      "MATERIAL_ISSUE_CREATE",
      "MATERIAL_DELETE",
      "MATERIAL_UPDATE",
      "MATERIAL_CREATE",
      "STOCK_LOCATION_UPDATE",
      "STOCK_LOCATION_CREATE",
      "STOCK_TRANSFER_RETURN_TO_SOURCE",
      "STOCK_TRANSFER_DISPATCH",
      "STOCK_TRANSFER_COMPLETE",
      "STOCK_TRANSFER_CANCEL",
      "STOCK_TRANSFER_CREATE",
      "STOCK_COUNT_RECONCILE",
      "STOCK_COUNT_DELETE",
      "STOCK_COUNT_CONFIRM",
      "STOCK_COUNT_CREATE",
      "STOCK_ADJUSTMENT",
      "SCRAP_GENERATION_CANCEL",
      "SCRAP_GENERATION_CREATE",
      "STANDARD_CONSUMPTION_DELETE",
      "STANDARD_CONSUMPTION_UPDATE",
      "STANDARD_CONSUMPTION_CREATE",
      "NRV_WRITE_DOWN",
      "GATE_PASS_EXIT",
      "GATE_PASS_RESUBMIT",
      "GATE_PASS_SUBMIT",
      "GATE_PASS_REJECT",
      "GATE_PASS_CANCEL",
      "GATE_PASS_APPROVE",
      "GATE_PASS_CREATE",
    ],
  },
  procurement: {
    label: "Procurement",
    viewPermission: PERM.PROCUREMENT_VIEW,
    prefixes: [
      "SUPPLIER_RETURN_SUBMIT",
      "SUPPLIER_RETURN_COMPLETE",
      "SUPPLIER_RETURN_CANCEL",
      "SUPPLIER_RETURN_CREATE",
      "SUPPLIER_INVOICE_REJECT",
      "SUPPLIER_INVOICE_APPROVE",
      "SUPPLIER_INVOICE_CREATE",
      "SUPPLIER_UPDATE",
      "SUPPLIER_CREATE",
      "PURCHASE_ORDER_RECEIVE",
      "PURCHASE_ORDER_REJECT",
      "PURCHASE_ORDER_ORDER",
      "PURCHASE_ORDER_APPROVE",
      "PURCHASE_ORDER_CANCEL",
      "PURCHASE_ORDER_ADD_LINE",
      "PURCHASE_ORDER_CREATE",
      "REQUISITION_CONVERT",
      "REQUISITION_SUBMIT",
      "REQUISITION_REJECT",
      "REQUISITION_DELETE",
      "REQUISITION_APPROVE",
      "REQUISITION_CREATE",
      "AUTO_REQUISITION_GENERATE",
      "RATE_CONTRACT_CANCEL",
      "RATE_CONTRACT_CREATE",
      "VENDOR_QUOTE_DELETE",
      "VENDOR_QUOTE_SELECT",
      "VENDOR_QUOTE_UPDATE",
      "VENDOR_QUOTE_CREATE",
      "DIRECT_PURCHASE_CANCEL",
      "DIRECT_PURCHASE_CREATE",
      "QUOTATION_REQUEST_APPROVE",
      "QUOTATION_REQUEST_CREATE",
      "QUOTATION_ADD_QUOTE",
      "QUOTE_REQUIREMENT_WAIVED",
      "RATE_ANALYSIS_DELETE",
      "RATE_ANALYSIS_UPDATE",
      "RATE_ANALYSIS_CREATE",
      "DELIVERY_REJECTED",
    ],
  },
  sales: {
    label: "Sales",
    viewPermission: PERM.SALES_VIEW,
    prefixes: [
      "MATERIAL_SALE_RETURN",
      "MATERIAL_SALE_PAYMENT_CREATE",
      "MATERIAL_SALE_EXECUTE",
      "MATERIAL_SALE_CANCEL",
      "MATERIAL_SALE_CREATE",
      "ASSET_SALE_DEPOSIT",
      "ASSET_SALE_PAYMENT",
      "ASSET_SALE_CANCEL",
      "ASSET_SALE_COMPLETE",
      "ASSET_SALE_CREATE",
      "BUILT_UNIT_VALUATION",
      "BUILT_UNIT_STATUS_CHANGE",
      "BUILT_UNIT_PURCHASE",
      "BUILT_UNIT_EDIT",
      "BUILT_UNIT_CREATE",
      "PORTAL_LISTING_DELISTED",
      "PORTAL_LISTING_DELETE",
      "PORTAL_LISTING_UPDATE",
      "PORTAL_LISTING_CREATE",
      "SALE_REGISTRY_DONE",
      "SALE_DOCUMENT_UPLOAD",
      "SALE_SCHEDULE_CREATE",
      "SALE_UPDATE",
      "SCHEDULE_COMPUTED",
      "SCHEDULE_PAYMENT_RECORD",
      "RETENTION_RELEASE",
      "E_INVOICE_CANCELLED",
      "E_INVOICE_GENERATED",
    ],
  },
  finance: {
    label: "Finance",
    viewPermission: PERM.FINANCE_VIEW,
    prefixes: [
      "SUPPLIER_PAYMENT_CREATE",
      "EXPENSE_BUDGET_SET",
      "EXPENSE_CATEGORY_DEACTIVATE",
      "EXPENSE_CATEGORY_DELETE",
      "EXPENSE_CATEGORY_UPDATE",
      "EXPENSE_CATEGORY_CREATE",
      "EXPENSE_CLAIM_REJECT",
      "EXPENSE_CLAIM_SUBMIT",
      "EXPENSE_CLAIM_PAY",
      "EXPENSE_CLAIM_APPROVE",
      "EXPENSE_CLAIM_LINE_REMOVE",
      "EXPENSE_CLAIM_LINE_ADD",
      "EXPENSE_CLAIM_CREATE",
      "EXPENSE_DELETE",
      "EXPENSE_REJECT",
      "EXPENSE_SUBMIT",
      "EXPENSE_APPROVE",
      "EXPENSE_UPDATE",
      "EXPENSE_CREATE",
      "RECURRING_EXPENSE_GENERATE",
      "RECURRING_EXPENSE_CREATE",
      "PETTY_CASH_TOPUP",
      "PETTY_CASH_SPEND",
      "PETTY_CASH_CREATE",
      "JOURNAL_ENTRY_POST",
      "CHEQUE_BOUNCED",
      "CHEQUE_CLEARED",
      "BANK_SMS_MANUAL_MATCH",
      "BANK_SMS_INGESTED",
      "PROJECT_COST_REALLOCATE",
      "PROJECT_COST_DELETE",
      "PROJECT_COST_UPDATE",
      "PROJECT_COST_ADD",
      "RA_BILL_SUBMIT",
      "RA_BILL_REJECT",
      "RA_BILL_PAY",
      "RA_BILL_APPROVE",
      "RA_BILL_CREATE",
      "ADVANCE_PAYMENT",
      "MB_ENTRY_REJECT",
      "MB_ENTRY_VERIFY",
      "MB_ENTRY_APPROVE",
      "MB_ENTRY_CREATE",
    ],
  },
  hr: {
    label: "HR",
    viewPermission: PERM.HR_VIEW,
    prefixes: [
      "EMPLOYEE_AUTO_DEPOSIT_DISABLED",
      "EMPLOYEE_AUTO_DEPOSIT_SETUP",
      "EMPLOYEE_DOSSIER_UPDATE",
      "EMPLOYEE_BENEFIT_DELETE",
      "EMPLOYEE_BENEFIT_UPDATE",
      "EMPLOYEE_BENEFIT_CREATE",
      "EMPLOYEE_ACCOUNT_CREATE",
      "EMPLOYEE_OFFER_LETTER_GENERATED",
      "EMPLOYEE_APPOINTMENT_LETTER_GENERATE",
      "EMPLOYEE_AGREEMENT_CONFIRMED",
      "EMPLOYEE_AGREEMENT_GENERATED",
      "EMPLOYEE_ID_CARD_GENERATED",
      "EMPLOYEE_ONBOARDING_COMPLETE",
      "EMPLOYEE_PHONE_UNLINK",
      "EMPLOYEE_PHONE_ASSIGN",
      "EMPLOYEE_REPORTS_TO_UPDATE",
      "EMPLOYEE_TERMINATE",
      "EMPLOYEE_LINK_USER",
      "EMPLOYEE_USER_SYNC",
      "EMPLOYEE_ADD_TO_COMPANY",
      "EMPLOYEE_UPDATE",
      "EMPLOYEE_CREATE",
      "ATTENDANCE_BULK_LOG",
      "ATTENDANCE_DELETE",
      "ATTENDANCE_UPDATE",
      "ATTENDANCE_LOG",
      "LEAVE_REQUEST_CANCEL",
      "LEAVE_REQUEST_CREATE",
      "CREW_DELETE",
      "CREW_UPDATE",
      "CREW_CREATE",
      "SALARY_COMPONENTS_SET",
      "SALARY_COMPONENT_DELETE",
      "SALARY_COMPONENT_UPDATE",
      "SALARY_COMPONENT_CREATE",
      "PAYROLL_PROCESS",
      "PAYROLL_GENERATE",
      "PAYROLL_LINE_PAID",
      "PAYROLL_LINE_ADJUST",
      "PAYROLL_PAID",
      "DPR_AUTO_SCRAP_GENERATED",
      "DPR_COST_POSTED",
      "DPR_GENERATE_MATERIAL_ISSUE",
      "DPR_ADMIN_APPROVE",
      "DPR_SUB_ADMIN_APPROVE",
      "DPR_RESUBMIT",
      "DPR_REJECT",
      "DPR_DELETE",
      "DAILY_REPORT_DELETE",
      "DAILY_REPORT_UPDATE",
      "DAILY_REPORT_CREATE",
      "APPOINTMENT_LETTER_GENERATE",
    ],
  },
  projects: {
    label: "Projects",
    viewPermission: PERM.PROJECTS_VIEW,
    prefixes: [
      "PROJECT_ASSIGNMENT_DELETE",
      "PROJECT_ASSIGNMENT_UPDATE",
      "PROJECT_POSSESSION_MARKED",
      "PROJECT_CREATE_FROM_LAND",
      "PROJECT_UPDATE",
      "WBS_DEPENDENCY_REMOVE",
      "WBS_DEPENDENCY_ADD",
      "WBS_NODE_DELETE",
      "WBS_NODE_UPDATE",
      "WBS_NODE_CREATE",
      "CHANGE_ORDER_IMPLEMENT",
      "CHANGE_ORDER_REJECT",
      "CHANGE_ORDER_SUBMIT",
      "CHANGE_ORDER_DELETE",
      "CHANGE_ORDER_CANCEL",
      "CHANGE_ORDER_APPROVE",
      "CHANGE_ORDER_UPDATE",
      "CHANGE_ORDER_CREATE",
      "WORK_ORDER_COMPLETE",
      "WORK_ORDER_ISSUE",
      "WORK_ORDER_CREATE",
      "RENOVATION_COST_DELETE",
      "RENOVATION_COST_ADD",
      "RENOVATION_COMPLETE",
      "RENOVATION_CANCEL",
      "RENOVATION_START",
      "RENOVATION_UPDATE",
      "RENOVATION_CREATE",
      "BOQ_ITEM_DELETE",
      "BOQ_ITEM_UPDATE",
      "BOQ_ITEM_CREATE",
      "TASK_REASSIGN",
      "TASK_STATUS_CHANGE",
      "TASK_CREATE",
      "EQUIPMENT_MAINTENANCE_COMPLETE",
      "EQUIPMENT_MAINTENANCE_RECORD",
      "EQUIPMENT_UNRETIRE",
      "EQUIPMENT_RETIRE",
      "EQUIPMENT_RETURN",
      "EQUIPMENT_SELL",
      "EQUIPMENT_ASSIGN",
      "EQUIPMENT_DELETE",
      "EQUIPMENT_UPDATE",
      "EQUIPMENT_CREATE",
      "SUBCONTRACTOR_CREATE",
      "CLP_DEMAND_GENERATED",
    ],
  },
  land: {
    label: "Land",
    viewPermission: PERM.ASSETS_VIEW,
    prefixes: [
      "LAND_COST_COMPONENT_DELETE",
      "LAND_COST_COMPONENT_UPDATE",
      "LAND_COST_COMPONENT_ADD",
      "LAND_COST_RECOMPUTE",
      "LAND_PARCEL_VALUATION",
      "LAND_PARCEL_STATUS_CHANGE",
      "LAND_PARCEL_UPDATE",
      "LAND_POSSESSION_MARKED",
      "LAND_PAYMENT_SCHEDULE_CREATED",
      "LAND_PURCHASE_CHEQUE_BOUNCED",
      "LAND_PURCHASE_CHEQUE_CLEARED",
      "LAND_PURCHASE_DOCUMENT_UPLOAD",
      "LAND_PURCHASE_COMPLETE",
      "LAND_PURCHASE_PAYMENT",
      "LAND_PURCHASE_ORDER",
      "LAND_PURCHASE_UPDATE",
      "LAND_UNPARTITION",
      "LAND_PARTITION",
      "TENANCY_TERMINATE",
      "TENANCY_ACTIVATE",
      "TENANCY_DRAFT_UPLOAD",
      "TENANCY_UPDATE",
      "TENANCY_CREATE",
      "TENANT_CHANGE",
      "RENT_ESCALATION_APPLIED",
      "RENT_PAYMENT_RECORD",
      "RENT_SCHEDULE_GENERATE",
      "RENT_AGREEMENT_UPLOAD",
      "CONSENT_POLICY_CREATE",
      "LEGAL_DOC_DELETE",
      "LEGAL_DOC_UPDATE",
      "LEGAL_DOC_CREATE",
      "BROKER_COMMISSION_PAID",
      "BROKER_UPDATE",
      "BROKER_DELETE",
    ],
  },
  crm: {
    label: "CRM",
    viewPermission: PERM.SALES_VIEW,
    prefixes: [
      "LEAD_ACTIVITY_CREATE",
      "LEAD_STAGE_CHANGE",
      "LEAD_CONVERT",
      "LEAD_DELETE",
      "LEAD_CREATE",
      "CUSTOMER_UPDATE",
      "CUSTOMER_CREATE",
      "CALL_RECORDING_UPLOAD",
      "CALL_TAG_REMOVE",
      "CALL_TAG_ADD",
      "CALL_NOTE_CREATE",
      "CALL_LOG_DELETE",
      "CALL_LOG_UPDATE",
      "CALL_LOG_CREATE",
      "FEEDBACK_RESOLVE",
      "FEEDBACK_CREATE",
    ],
  },
  safety: {
    label: "Safety",
    viewPermission: PERM.SAFETY_VIEW,
    prefixes: [
      "SAFETY_INSPECTION_UPDATE",
      "SAFETY_INSPECTION_START",
      "SAFETY_INSPECTION_DELETE",
      "SAFETY_INSPECTION_CREATE",
      "SAFETY_INSPECTION_COMPLETE",
      "SAFETY_INSPECTION_CANCEL",
      "SAFETY_INCIDENT_UPDATE",
      "SAFETY_INCIDENT_INVESTIGATE",
      "SAFETY_INCIDENT_DELETE",
      "SAFETY_INCIDENT_CREATE",
      "SAFETY_INCIDENT_CLOSE",
      "SAFETY_INCIDENT_CANCEL",
      "SAFETY_HAZARD_UPDATE",
      "SAFETY_HAZARD_RESOLVE",
      "SAFETY_HAZARD_MITIGATE",
      "SAFETY_HAZARD_DELETE",
      "SAFETY_HAZARD_CREATE",
    ],
  },
  quality: {
    label: "Quality",
    viewPermission: PERM.QC_VIEW,
    prefixes: [
      "NCR_UPDATE",
      "NCR_REVIEW",
      "NCR_DELETE",
      "NCR_CREATE",
      "NCR_CLOSE",
      "NCR_CANCEL",
      "CAPA_UPDATE",
      "CAPA_START",
      "CAPA_PREVENTIVE_DONE",
      "CAPA_CORRECTIVE_DONE",
      "CAPA_CREATE",
      "CAPA_CLOSE",
    ],
  },
};

/**
 * Build a Prisma `where` clause for the given department — an OR of
 * `action: { startsWith: prefix }` conditions, scoped to the company.
 *
 * Excluded prefixes (e.g. "MATERIAL_SALE_" in inventory) are handled by
 * simply not listing them in the department's prefix array — the first
 * matching department wins, and since each prefix appears in exactly one
 * department, there's no ambiguity.
 */
export function departmentWhere(
  department: DepartmentKey,
  companyId: string,
): { OR: { action: { startsWith: string } }[]; companyId: string } {
  const def = DEPARTMENTS[department];
  return {
    companyId,
    OR: def.prefixes.map((p) => ({ action: { startsWith: p } })),
  };
}

/**
 * Humanize an action string for display.
 * "PURCHASE_ORDER_CREATE" → "Created purchase order"
 * "MATERIAL_ISSUE_EXECUTE" → "Executed material issue"
 * "SAFETY_HAZARD_MITIGATE" → "Mitigated safety hazard"
 *
 * Strategy: the last token of most action strings is the verb. We map ~40
 * common verb tokens to past tense and lowercase the rest as the subject.
 * Anything not in the map falls through to a plain lowercase rendering.
 * This is deliberately simple — new actions ending in a known verb
 * (CREATE, UPDATE, etc.) humanize correctly without any map changes.
 */
export function humanizeAction(action: string): string {
  const parts = action.split("_");

  const verbs: Record<string, string> = {
    CREATE: "created",
    UPDATE: "updated",
    DELETE: "deleted",
    CANCEL: "cancelled",
    APPROVE: "approved",
    REJECT: "rejected",
    SUBMIT: "submitted",
    COMPLETE: "completed",
    EXECUTE: "executed",
    GENERATE: "generated",
    CONVERT: "converted",
    DISPATCH: "dispatched",
    RETURN: "returned",
    CONFIRM: "confirmed",
    ASSIGN: "assigned",
    REASSIGN: "reassigned",
    START: "started",
    CLOSE: "closed",
    REVIEW: "reviewed",
    RESOLVE: "resolved",
    INVESTIGATE: "investigated",
    MITIGATE: "mitigated",
    REALLOCATE: "reallocated",
    VERIFY: "verified",
    RESTORE: "restored",
    ADJUST: "adjusted",
    ISSUE: "issued",
    RECEIVE: "received",
    ORDER: "ordered",
    PAY: "paid",
    PROCESS: "processed",
    RECORD: "recorded",
    UPLOAD: "uploaded",
    ACTIVATE: "activated",
    TERMINATE: "terminated",
    RETIRE: "retired",
    UNRETIRE: "unretired",
    RECONCILE: "reconciled",
    RESUBMIT: "resubmitted",
    PURCHASE: "purchased",
    SELL: "sold",
    EDIT: "edited",
    ADD: "added",
    REMOVE: "removed",
    LINK: "linked",
    UNLINK: "unlinked",
    SELECT: "selected",
    DEPOSIT: "deposited",
    POST: "posted",
    SYNC: "synced",
    SYNCED: "synced",
    DONE: "completed",
    SET: "set",
    BOUNCED: "bounced",
    CLEARED: "cleared",
    INGESTED: "ingested",
    APPLIED: "applied",
    COMPUTED: "computed",
    MATCH: "matched",
    MARKED: "marked",
    WAIVED: "waived",
    DELISTED: "delisted",
    UNPARTITION: "unpartitioned",
    PARTITION: "partitioned",
  };

  const lastToken = parts[parts.length - 1];
  const verb = lastToken ? verbs[lastToken] : undefined;

  if (verb) {
    const subject = parts.slice(0, -1).join(" ").toLowerCase();
    return subject ? `${verb} ${subject}` : verb;
  }

  // Fallback: lowercase the whole thing
  return action.toLowerCase().replace(/_/g, " ");
}

/**
 * Relative time formatter — "just now", "3m ago", "2h ago", "Yesterday", "3d ago".
 * Pure function, safe for SSR (no Date timezone issues — uses absolute diff).
 */
export function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return "Yesterday";
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
