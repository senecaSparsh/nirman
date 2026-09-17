/**
 * Employee field-visibility policy — the single place that decides which
 * Employee columns a given permission tier may serialize to a client.
 *
 * The permission flags come from getEmployeeAccessScope() in lib/server.ts;
 * this module owns *which columns* belong to each tier. Keeping the field
 * lists here means a new sensitive column can't leak into roster-tier
 * responses unless someone deliberately adds it to a group.
 *
 * RULE: never `json(prismaRow)` an Employee. The model carries bank details,
 * gov IDs, compensation, employment terms, and public-signing bearer tokens
 * (contractToken / offerToken) in one row. Serialize through one of:
 *
 *   pickEmployeeRoster(row)   — deny-by-default allowlist: what a plain
 *                               hr.view holder (site engineer, supervisor,
 *                               QAQC, project director) may see. Use for
 *                               detail/list responses to roster-tier viewers.
 *   redactEmployeeRow(row, s) — full shape with gated columns nulled. Use when
 *                               a response must keep the same shape for both
 *                               tiers (e.g. a shared list serializer).
 *
 * Pages hand-picking props for their own client components should follow the
 * same tier groups via getEmployeeAccessScope() flags.
 */

/** Compensation + employment-terms columns — payroll.manage | hr.manage. */
export const EMPLOYEE_COMP_FIELDS = [
  "dailyRate",
  "monthlySalary",
  "payDay",
  "autoDepositEnabled",
  "autoDepositSetupAt",
  "employmentType",
  "probationEndDate",
  "confirmationDate",
  "noticePeriodDays",
  "contractStartDate",
  "contractEndDate",
  "contractTerms",
  "offerLetterTerms",
] as const;

/**
 * Identity/dossier columns — bank, gov IDs, addresses, DOB, and document
 * attachment references — hr.manage | payroll.manage.
 */
export const EMPLOYEE_DOCS_FIELDS = [
  "bankAccountHolder",
  "bankAccountNumber",
  "bankIfsc",
  "bankName",
  "bankBranch",
  "panNumber",
  "aadhaarNumber",
  "pfNumber",
  "esiNumber",
  "uan",
  "permanentAddress",
  "currentAddress",
  "dateOfBirth",
  "contractAttachmentId",
  "offerLetterAttachmentId",
  "idCardAttachmentId",
  "appointmentLetterAttachmentId",
] as const;

/**
 * Bearer tokens that authorize the public contract/offer signing endpoints.
 * Leaking one lets anyone sign the document as the employee — always gated.
 */
export const EMPLOYEE_TOKEN_FIELDS = ["contractToken", "offerToken"] as const;

/**
 * Roster allowlist — what plain hr.view may see. Explicit allowlist means
 * future schema columns are invisible to roster viewers by default.
 * Includes safety fields field staff legitimately need (emergency contact,
 * blood group, photo) and workflow STATUS flags (states, never contents).
 */
export const EMPLOYEE_ROSTER_FIELDS = [
  "id",
  "name",
  "trade",
  "phone",
  "email",
  "designation",
  "departmentId",
  "joinDate",
  "crewId",
  "activeProjectId",
  "reportingLocationId",
  "hierarchyLevel",
  "reportsToEmployeeId",
  "active",
  // Pay-structure category only ("DAILY"/"MONTHLY"/"FIXED") — the amounts
  // stay in COMP. Needed so roster UIs can label the worker class.
  "wageType",
  "companyId",
  "userId",
  "version",
  "createdAt",
  "updatedAt",
  "deletedAt",
  // Safety
  "emergencyContactName",
  "emergencyContactPhone",
  "emergencyContactRelation",
  "bloodGroup",
  "photoUrl",
  // Workflow status flags (no document contents)
  "documentsSubmitted",
  "backgroundVerified",
  "onboardingComplete",
  "contractStatus",
  "contractIssuedAt",
  "contractConfirmedAt",
  "offerLetterStatus",
  "offerLetterIssuedAt",
  "offerLetterAcceptedAt",
  "idCardStatus",
  "idCardIssuedAt",
  "appointmentLetterStatus",
  "appointmentLetterIssuedAt",
] as const;

/** The subset of getEmployeeAccessScope() flags this module consumes. */
export interface EmployeeFieldScope {
  canSeePayroll: boolean;
  canSeeBankDetails: boolean;
  canSeePersonalDocs: boolean;
}

/**
 * Deny-by-default roster pick — returns ONLY the allowlisted fields that are
 * present on `row`. Use for detail/list responses to hr.view-only callers.
 */
export function pickEmployeeRoster<T extends Record<string, unknown>>(row: T): Partial<T> {
  const out: Partial<T> = {};
  for (const key of EMPLOYEE_ROSTER_FIELDS) {
    if (key in row) out[key as keyof T] = row[key as keyof T];
  }
  return out;
}

/**
 * Shape-preserving redaction — returns the row with every gated column set to
 * null when the scope lacks the tier. Use when both tiers share one response
 * shape (null = "hidden", distinguishable from a real 0).
 */
export function redactEmployeeRow<T extends Record<string, unknown>>(
  row: T,
  scope: EmployeeFieldScope,
): T {
  const out = { ...row } as Record<string, unknown>;
  if (!scope.canSeePayroll) {
    for (const key of EMPLOYEE_COMP_FIELDS) if (key in out) out[key] = null;
  }
  // Bank/gov-ID docs + signing tokens ride the strictest doc tier.
  if (!(scope.canSeePersonalDocs && scope.canSeeBankDetails)) {
    for (const key of EMPLOYEE_DOCS_FIELDS) if (key in out) out[key] = null;
    for (const key of EMPLOYEE_TOKEN_FIELDS) if (key in out) out[key] = null;
  }
  return out as T;
}
