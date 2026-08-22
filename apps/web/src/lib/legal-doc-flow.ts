/**
 * LEGAL_DOC_FLOW — defines the guided sequential checklist for Indian
 * construction permissions, licenses, NOCs, and certificates.
 *
 * The flow is organized into three stages:
 *   1. FEASIBILITY (land-level) — title, sanctions, ATS, transfer duty
 *   2. SANCTION (project-level) — building permission, NOCs, commencement
 *   3. POST_COMPLETION — plinth, completion, occupancy, functional
 *
 * Each step has:
 *   - type: the LegalDocType enum value
 *   - label: user-friendly name
 *   - description: what this permission is and why it's needed
 *   - appliesTo: LAND, PROJECT, or BOTH — where it shows in the UI
 *   - prerequisite: which doc type must be APPROVED first (null = no prereq)
 *   - defaultAuthority: typical issuing authority (user can override)
 *   - typicalValidityMonths: typical validity period (null = permanent)
 *   - stage: which stage of the project lifecycle
 *   - isOptional: if true, user can mark "not required" and skip
 *   - hasAmount: whether this doc typically has a fee/amount
 *   - amountLabel: label for the amount field (e.g. "Registration Amount", "Transfer Duty", "Fee Paid")
 *
 * The UI uses this config to:
 *   - Show a sequential checklist with progress bar
 *   - Drive yes/no branching (obtained = yes → expand sub-form)
 *   - Show prerequisite warnings
 *   - Auto-suggest authority and validity when adding
 */

export type LegalDocStage = "FEASIBILITY" | "SANCTION" | "POST_COMPLETION";

export interface LegalDocFlowStep {
  type: string;
  label: string;
  description: string;
  appliesTo: "LAND" | "PROJECT" | "BOTH";
  prerequisite: string | null;
  defaultAuthority: string;
  typicalValidityMonths: number | null;
  stage: LegalDocStage;
  isOptional: boolean;
  hasAmount: boolean;
  amountLabel?: string;
  /** For ATS only — show expected registry date field */
  hasExpectedRegistryDate?: boolean;
}

export const LEGAL_DOC_FLOW: LegalDocFlowStep[] = [
  // ── STAGE 1: FEASIBILITY (land-level) ──
  {
    type: "OWNERSHIP_CERTIFICATE",
    label: "Ownership Certificate / Title Deed",
    description: "Proof of land ownership from the Revenue Department. Required before any other permission can be applied for.",
    appliesTo: "LAND",
    prerequisite: null,
    defaultAuthority: "Revenue Department",
    typicalValidityMonths: null,
    stage: "FEASIBILITY",
    isOptional: false,
    hasAmount: false,
  },
  {
    type: "NON_ENCUMBRANCE",
    label: "Non-Encumbrance Certificate",
    description: "Certifies the land is free from legal dues or mortgages. Often required by lenders and development authorities.",
    appliesTo: "LAND",
    prerequisite: "OWNERSHIP_CERTIFICATE",
    defaultAuthority: "Revenue Department",
    typicalValidityMonths: null,
    stage: "FEASIBILITY",
    isOptional: true,
    hasAmount: false,
  },
  {
    type: "LAND_SANCTION",
    label: "Land Sanction / Land Use Conversion (CLU)",
    description: "Change of Land Use approval — converts agricultural/other land to residential/commercial use. Issued by the Development Authority. This is the foundational permission; building permission cannot be obtained without it.",
    appliesTo: "LAND",
    prerequisite: "OWNERSHIP_CERTIFICATE",
    defaultAuthority: "Development Authority",
    typicalValidityMonths: null,
    stage: "FEASIBILITY",
    isOptional: false,
    hasAmount: true,
    amountLabel: "Sanction Fee",
  },
  {
    type: "MUTATION_ENTRY",
    label: "Mutation / Land Records Integration",
    description: "Updating revenue records to reflect the new owner after purchase. Required for clear title.",
    appliesTo: "LAND",
    prerequisite: "OWNERSHIP_CERTIFICATE",
    defaultAuthority: "Revenue Department",
    typicalValidityMonths: null,
    stage: "FEASIBILITY",
    isOptional: false,
    hasAmount: false,
  },
  {
    type: "AGREEMENT_TO_SELL",
    label: "Agreement to Sell (ATS)",
    description: "Registry substitute — used when the seller cannot register the sale deed immediately (e.g. land under government acquisition, conversion pending, or registry window closed). Records the registration amount paid and the expected future registry date. ATS gives the buyer a right to sue for specific performance but does NOT transfer title — a registered sale deed is still needed later.",
    appliesTo: "LAND",
    prerequisite: "OWNERSHIP_CERTIFICATE",
    defaultAuthority: "Sub-Registrar Office",
    typicalValidityMonths: null,
    stage: "FEASIBILITY",
    isOptional: true,
    hasAmount: true,
    amountLabel: "Registration Amount",
    hasExpectedRegistryDate: true,
  },
  {
    type: "TRANSFER_DUTY",
    label: "Transfer Duty / Unearned Increase",
    description: "Transfer charges on authority-allotted land (DDA, HUDCO, etc.). When leasehold authority land is transferred outside blood relations, the authority charges a percentage of the unearned increase in land value. Must be paid before the transfer is recognized.",
    appliesTo: "LAND",
    prerequisite: "OWNERSHIP_CERTIFICATE",
    defaultAuthority: "Development Authority (DDA/HUDCO)",
    typicalValidityMonths: null,
    stage: "FEASIBILITY",
    isOptional: true,
    hasAmount: true,
    amountLabel: "Transfer Duty Amount",
  },

  // ── STAGE 2: SANCTION (project-level, sequential) ──
  {
    type: "BUDGET_APPROVAL",
    label: "Project Budget Approval",
    description: "The project budget must be prepared and approved before applying for building permission. The sanctioned plan's validity clock starts from sanction, so the budget (land + construction + permits + contingency) must be locked in first. This is an internal document, not an authority permission.",
    appliesTo: "PROJECT",
    prerequisite: "LAND_SANCTION",
    defaultAuthority: "Internal — Management",
    typicalValidityMonths: null,
    stage: "SANCTION",
    isOptional: false,
    hasAmount: true,
    amountLabel: "Approved Budget",
  },
  {
    type: "LAYOUT_APPROVAL",
    label: "Layout / Subdivision Plan Approval",
    description: "Approval of the layout plan showing plots, roads, open spaces, and amenities. Required before building plan submission.",
    appliesTo: "PROJECT",
    prerequisite: "BUDGET_APPROVAL",
    defaultAuthority: "Development Authority",
    typicalValidityMonths: 36,
    stage: "SANCTION",
    isOptional: true,
    hasAmount: true,
    amountLabel: "Approval Fee",
  },
  {
    type: "BUILDING_PERMISSION",
    label: "Building Permission / Map Approval (Sanctioned Plan)",
    description: "The sanctioned building plan from the local authority — confirms compliance with FAR, setbacks, height limits, and building bylaws. This is the core permission that allows construction to begin. Validity is typically 2-3 years; construction must start within this period. The budget must be approved before applying, as the plan validity clock starts from sanction.",
    appliesTo: "PROJECT",
    prerequisite: "BUDGET_APPROVAL",
    defaultAuthority: "Municipal Corporation / Development Authority",
    typicalValidityMonths: 36,
    stage: "SANCTION",
    isOptional: false,
    hasAmount: true,
    amountLabel: "Permission Fee",
  },
  {
    type: "ENVIRONMENTAL_CLEARANCE",
    label: "Environmental Clearance (EIA)",
    description: "Required for large projects (typically >20,000 sqm built-up or specific categories). Involves Environmental Impact Assessment and approval from the State Level Expert Appraisal Committee.",
    appliesTo: "PROJECT",
    prerequisite: "BUILDING_PERMISSION",
    defaultAuthority: "State Environment Impact Assessment Authority",
    typicalValidityMonths: 60,
    stage: "SANCTION",
    isOptional: true,
    hasAmount: true,
    amountLabel: "Clearance Fee",
  },
  {
    type: "POLLUTION_NOC_ESTABLISH",
    label: "Pollution NOC — Consent to Establish",
    description: "Pollution Control Board consent required BEFORE starting construction (or before land use conversion in some states). Certifies the project's pollution control measures are adequate. Validity typically 1-5 years depending on category. Applies at both the land conversion stage and the project building stage.",
    appliesTo: "BOTH",
    prerequisite: "BUILDING_PERMISSION",
    defaultAuthority: "State Pollution Control Board",
    typicalValidityMonths: 60,
    stage: "SANCTION",
    isOptional: false,
    hasAmount: true,
    amountLabel: "Consent Fee",
  },
  {
    type: "FIRE_NOC",
    label: "Fire NOC",
    description: "Fire department No Objection Certificate — confirms the building design complies with fire safety standards (fire exits, sprinklers, hydrants). Required for multi-storey and commercial buildings. Often provisional at plan/layout stage, final after construction. Applies at both the layout approval stage (land) and the building plan stage (project).",
    appliesTo: "BOTH",
    prerequisite: "BUILDING_PERMISSION",
    defaultAuthority: "Fire Department",
    typicalValidityMonths: 36,
    stage: "SANCTION",
    isOptional: true,
    hasAmount: false,
  },
  {
    type: "TREE_CUTTING_NOC",
    label: "Tree Cutting NOC",
    description: "Permission from the Forest Department / Municipal Corporation to cut trees on the site. Includes replantation conditions.",
    appliesTo: "PROJECT",
    prerequisite: "BUILDING_PERMISSION",
    defaultAuthority: "Forest Department / Municipal Corporation",
    typicalValidityMonths: 6,
    stage: "SANCTION",
    isOptional: true,
    hasAmount: false,
  },
  {
    type: "AIRPORT_NOC",
    label: "Airport Authority NOC",
    description: "Required for buildings near airport zones — confirms compliance with height restrictions and aviation safety standards.",
    appliesTo: "PROJECT",
    prerequisite: "BUILDING_PERMISSION",
    defaultAuthority: "Airport Authority of India",
    typicalValidityMonths: null,
    stage: "SANCTION",
    isOptional: true,
    hasAmount: false,
  },
  {
    type: "DRAINAGE_NOC",
    label: "Drainage & Sewerage NOC",
    description: "Municipal Corporation NOC for drainage and sewerage connections. Required before commencement of construction.",
    appliesTo: "PROJECT",
    prerequisite: "BUILDING_PERMISSION",
    defaultAuthority: "Municipal Corporation",
    typicalValidityMonths: null,
    stage: "SANCTION",
    isOptional: true,
    hasAmount: false,
  },
  {
    type: "ELECTRICITY_NOC",
    label: "Electricity Connection Sanction",
    description: "Electricity board sanction for temporary and permanent power connections to the site.",
    appliesTo: "PROJECT",
    prerequisite: "BUILDING_PERMISSION",
    defaultAuthority: "State Electricity Board",
    typicalValidityMonths: null,
    stage: "SANCTION",
    isOptional: true,
    hasAmount: true,
    amountLabel: "Connection Charges",
  },
  {
    type: "WATER_NOC",
    label: "Water Supply NOC",
    description: "Water authority NOC for water supply connection to the project.",
    appliesTo: "PROJECT",
    prerequisite: "BUILDING_PERMISSION",
    defaultAuthority: "Water Authority / Jal Board",
    typicalValidityMonths: null,
    stage: "SANCTION",
    isOptional: true,
    hasAmount: true,
    amountLabel: "Connection Charges",
  },
  {
    type: "COMMENCEMENT_CERTIFICATE",
    label: "Commencement Certificate",
    description: "Final permission to start construction. Issued after all NOCs are in place and the building plan is sanctioned. Construction cannot legally begin without this.",
    appliesTo: "PROJECT",
    prerequisite: "BUILDING_PERMISSION",
    defaultAuthority: "Municipal Corporation / Development Authority",
    typicalValidityMonths: 36,
    stage: "SANCTION",
    isOptional: false,
    hasAmount: true,
    amountLabel: "Certificate Fee",
  },
  {
    type: "RERA_REGISTRATION",
    label: "RERA Registration",
    description: "Mandatory registration under RERA Act 2016 for projects > 500 sqm or > 8 units. The RERA registration number must appear on all marketing material, sale agreements, and advertisements. Without RERA registration, the project cannot legally be marketed or sold. Registration is valid until the project is completed and possession is handed over.",
    appliesTo: "PROJECT",
    prerequisite: "COMMENCEMENT_CERTIFICATE",
    defaultAuthority: "State RERA Authority",
    typicalValidityMonths: 60,
    stage: "SANCTION",
    isOptional: false,
    hasAmount: true,
    amountLabel: "Registration Fee",
  },

  // ── STAGE 3: POST_COMPLETION ──
  {
    type: "PLINTH_CERTIFICATE",
    label: "Plinth Certificate",
    description: "Issued after foundation/plinth construction is inspected and found compliant with the sanctioned plan. Allows progression to the superstructure.",
    appliesTo: "PROJECT",
    prerequisite: "COMMENCEMENT_CERTIFICATE",
    defaultAuthority: "Municipal Corporation",
    typicalValidityMonths: null,
    stage: "POST_COMPLETION",
    isOptional: true,
    hasAmount: false,
  },
  {
    type: "COMPLETION_CERTIFICATE",
    label: "Completion Certificate",
    description: "Issued by the Municipal Corporation after construction is complete and confirmed to conform to the sanctioned plan (FAR, setbacks, structural specs). Must be applied for within 30 days of construction completion. Without CC, the building cannot legally be occupied.",
    appliesTo: "PROJECT",
    prerequisite: "COMMENCEMENT_CERTIFICATE",
    defaultAuthority: "Municipal Corporation",
    typicalValidityMonths: null,
    stage: "POST_COMPLETION",
    isOptional: false,
    hasAmount: true,
    amountLabel: "Inspection Fee",
  },
  {
    type: "OCCUPANCY_CERTIFICATE",
    label: "Occupancy Certificate (OC)",
    description: "Certifies the building is fit for occupation — covers water supply, sewage, electrical safety, and fire compliance. Cannot be issued without the Completion Certificate. Required for lawful possession and utility connections.",
    appliesTo: "PROJECT",
    prerequisite: "COMPLETION_CERTIFICATE",
    defaultAuthority: "Municipal Corporation",
    typicalValidityMonths: null,
    stage: "POST_COMPLETION",
    isOptional: false,
    hasAmount: true,
    amountLabel: "Certificate Fee",
  },
  {
    type: "FUNCTIONAL_CERTIFICATE",
    label: "Functional Certificate",
    description: "Confirms all utilities (water, electricity, sewage, fire systems) are connected and operational. Often the final document before offering possession to buyers.",
    appliesTo: "PROJECT",
    prerequisite: "OCCUPANCY_CERTIFICATE",
    defaultAuthority: "Municipal Corporation",
    typicalValidityMonths: null,
    stage: "POST_COMPLETION",
    isOptional: true,
    hasAmount: false,
  },
  {
    type: "POLLUTION_NOC_OPERATE",
    label: "Pollution NOC — Consent to Operate",
    description: "Pollution Control Board consent required AFTER construction, before the project becomes operational. Renewed periodically (1-5 years depending on category).",
    appliesTo: "PROJECT",
    prerequisite: "COMPLETION_CERTIFICATE",
    defaultAuthority: "State Pollution Control Board",
    typicalValidityMonths: 60,
    stage: "POST_COMPLETION",
    isOptional: true,
    hasAmount: true,
    amountLabel: "Consent Fee",
  },
];

// ── Helper maps for quick lookup ──

export const LEGAL_DOC_FLOW_MAP: Record<string, LegalDocFlowStep> = Object.fromEntries(
  LEGAL_DOC_FLOW.map((s) => [s.type, s]),
);

export const STAGE_LABELS: Record<LegalDocStage, string> = {
  FEASIBILITY: "Feasibility & Land",
  SANCTION: "Sanction & Approvals",
  POST_COMPLETION: "Post-Completion",
};

export const STAGE_ORDER: LegalDocStage[] = ["FEASIBILITY", "SANCTION", "POST_COMPLETION"];

/**
 * Get the flow steps relevant to a given context (land or project).
 * Returns only steps where appliesTo matches or is BOTH.
 */
export function getFlowStepsForContext(context: "LAND" | "PROJECT"): LegalDocFlowStep[] {
  return LEGAL_DOC_FLOW.filter(
    (s) => s.appliesTo === context || s.appliesTo === "BOTH",
  );
}

/**
 * Check if a prerequisite doc is satisfied (status = APPROVED and obtained = true).
 *
 * Context-aware: if the prerequisite step doesn't apply to the current
 * context (e.g. BUILDING_PERMISSION is PROJECT-only but we're viewing the
 * LAND context), the prerequisite is treated as met — the step isn't
 * locked just because its parent lives on the other page. The user can
 * still record the doc on the land page independently.
 */
export function isPrerequisiteMet(
  prerequisiteType: string | null,
  docs: { type: string; status: string; obtained: boolean }[],
  context?: "LAND" | "PROJECT",
): boolean {
  if (!prerequisiteType) return true;
  // If the prerequisite step doesn't apply to this context, don't lock.
  if (context) {
    const prereqStep = LEGAL_DOC_FLOW_MAP[prerequisiteType];
    if (prereqStep && prereqStep.appliesTo !== "BOTH" && prereqStep.appliesTo !== context) {
      return true;
    }
  }
  const prereq = docs.find((d) => d.type === prerequisiteType);
  if (!prereq) return false;
  return prereq.status === "APPROVED" && prereq.obtained === true;
}

/**
 * Calculate days until expiry. Returns null if no validTill.
 * Negative = already expired.
 */
export function daysUntilExpiry(validTill: string | Date | null): number | null {
  if (!validTill) return null;
  const expiry = typeof validTill === "string" ? new Date(validTill) : validTill;
  const now = new Date();
  return Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Get expiry status for display.
 */
export function getExpiryStatus(validTill: string | Date | null): "ok" | "expiring" | "expired" | "none" {
  const days = daysUntilExpiry(validTill);
  if (days === null) return "none";
  if (days < 0) return "expired";
  if (days <= 30) return "expiring";
  return "ok";
}
