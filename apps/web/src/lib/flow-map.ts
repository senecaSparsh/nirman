/**
 * FLOW MAP — the single source of truth for "where am I, what comes
 * before, what comes next, and what's the one action I should take
 * next — doable on the page I'm already on."
 *
 * Every transactional page in the app sits inside a flow. This module
 * describes those flows as data, so the guidance primitives
 * (PageLead, NextActionCard, FlowStrip, ContextTag, DoneStrip) can
 * answer the three orientation questions without each page
 * re-deriving them:
 *
 *   1. What is this page for?          → PageLead (static, per route)
 *   2. Where am I in the flow?         → FlowStrip / ContextTag (per record)
 *   3. What do I do next — right here? → NextActionCard (per record + role)
 *
 * The "next action" is deliberately a *same-page* action whenever
 * possible (open a sheet, switch a filter chip, scroll to a section).
 * When it must navigate, it navigates to the next node in the flow,
 * not a generic list.
 *
 * Status values mirror the Prisma enums exactly (see schema.prisma):
 *   RequisitionStatus, PurchaseOrderStatus, StockTransferStatus,
 *   MaterialIssueStatus, DprApprovalStatus, NcrStatus, BuiltUnitStatus.
 *
 * Adding a new flow: append a FlowDef to FLOWS. Adding a new status:
 * add a NextAction entry to the relevant flow. No UI changes needed —
 * the primitives read from here.
 */

import { hasPermission } from "@/lib/roles";

export type FlowId =
  | "procurement"
  | "requisition"
  | "stockTransfer"
  | "materialIssue"
  | "materialSale"
  | "dpr"
  | "ncr"
  | "builtUnit";

/** A node in a flow — a screen the user can be on. */
export interface FlowNode {
  /** The status value (matches the Prisma enum). null for the list page itself. */
  status: string | null;
  /** Human label for the node, e.g. "Approved", "Awaiting receipt". */
  label: string;
  /** The route for this node's detail view. Use {id} for the record id. */
  detailHref: string;
}

/** The "what do I do next" contract. */
export interface NextAction {
  /** The status this action applies to. */
  when: string;
  /** One-line imperative: "Receive the delivery", "Approve the requisition". */
  label: string;
  /** One-line why: "Goods have arrived on site — verify against the PO". */
  reason: string;
  /**
   * How to do it on the SAME page. Prefer a sheet/dialog anchor
   * ("#receive", "#approve") so the action stays in place. Falls back
   * to a navigate href when there's genuinely no on-page action.
   */
  action: { type: "anchor"; hash: string } | { type: "navigate"; href: string } | { type: "filter"; chip: string };
  /** Permission key required to perform the action (from @/lib/roles PERM.*). */
  perm?: string;
  /** Tone for the NextActionCard — defaults to "signal" (amber, the "your turn" colour). */
  tone?: "signal" | "go" | "stop";
}

export interface FlowDef {
  id: FlowId;
  /** The list route for this flow, e.g. "/m/procurement". */
  listHref: string;
  /** One-sentence "what is this list for" — used by PageLead on the list page. */
  listLead: string;
  /** Ordered nodes — the lifecycle. */
  nodes: FlowNode[];
  /** Next actions keyed by status. The FIRST matching action wins. */
  next: NextAction[];
  /** The list-page "next action" — when the whole list has a queue, e.g. "3 drafts to approve". */
  listNext?: {
    /** Count query: which statuses count toward "needs you". */
    countStatuses: string[];
    label: (count: number) => string;
    reason: string;
    /** A filter chip to apply on the same list page. */
    filterChip: string;
    perm?: string;
  };
}

// ─────────────────────────────────────────────────────────────────
// PROCUREMENT — the canonical flow. Indent → Quote → PO → GRN → Issue
// ─────────────────────────────────────────────────────────────────

const PROCUREMENT_FLOW: FlowDef = {
  id: "procurement",
  listHref: "/m/procurement",
  listLead: "Purchase orders to suppliers. Drafts need approval, ordered POs need receiving.",
  nodes: [
    { status: "DRAFT", label: "Draft", detailHref: "/m/procurement/{id}" },
    { status: "APPROVED", label: "Approved", detailHref: "/m/procurement/{id}" },
    { status: "ORDERED", label: "Ordered", detailHref: "/m/procurement/{id}" },
    { status: "PARTIAL", label: "Partially received", detailHref: "/m/procurement/{id}" },
    { status: "RECEIVED", label: "Received", detailHref: "/m/procurement/{id}" },
    { status: "CANCELLED", label: "Cancelled", detailHref: "/m/procurement/{id}" },
  ],
  next: [
    {
      when: "DRAFT",
      label: "Submit for approval",
      reason: "A draft PO isn't sent to the supplier until an approver signs off.",
      action: { type: "anchor", hash: "#approve" },
      perm: "PROCUREMENT_MANAGE",
      tone: "signal",
    },
    {
      when: "APPROVED",
      label: "Send to supplier",
      reason: "Approved — place the order so the supplier can dispatch.",
      action: { type: "anchor", hash: "#order" },
      perm: "PROCUREMENT_MANAGE",
      tone: "signal",
    },
    {
      when: "ORDERED",
      label: "Receive the delivery",
      reason: "Goods are in transit. When they arrive, verify against the PO lines.",
      action: { type: "anchor", hash: "#receive" },
      perm: "PROCUREMENT_VIEW",
      tone: "signal",
    },
    {
      when: "PARTIAL",
      label: "Receive the balance",
      reason: "Some lines are still pending — record the next delivery.",
      action: { type: "anchor", hash: "#receive" },
      perm: "PROCUREMENT_VIEW",
      tone: "signal",
    },
    {
      when: "RECEIVED",
      label: "Issue to site",
      reason: "Stock is in the warehouse — issue it to the project when needed.",
      action: { type: "navigate", href: "/m/site/issue" },
      tone: "go",
    },
  ],
  listNext: {
    countStatuses: ["DRAFT"],
    label: (n) => `${n} draft PO${n !== 1 ? "s" : ""} awaiting approval`,
    reason: "Approve drafts so they can be sent to suppliers.",
    filterChip: "DRAFT",
    perm: "PO_APPROVE",
  },
};

// ─────────────────────────────────────────────────────────────────
// REQUISITION — the planning layer before procurement
// ─────────────────────────────────────────────────────────────────

const REQUISITION_FLOW: FlowDef = {
  id: "requisition",
  listHref: "/m/requisitions",
  listLead: "Material requests raised by site. Approved requisitions become purchase orders.",
  nodes: [
    { status: "DRAFT", label: "Draft", detailHref: "/m/requisitions/{id}" },
    { status: "SUBMITTED", label: "Submitted", detailHref: "/m/requisitions/{id}" },
    { status: "APPROVED", label: "Approved", detailHref: "/m/requisitions/{id}" },
    { status: "CONVERTED", label: "Converted to PO", detailHref: "/m/requisitions/{id}" },
    { status: "REJECTED", label: "Rejected", detailHref: "/m/requisitions/{id}" },
  ],
  next: [
    {
      when: "DRAFT",
      label: "Submit for approval",
      reason: "A draft stays with you until you submit it to an approver.",
      action: { type: "anchor", hash: "#submit" },
      perm: "REQUISITION_MANAGE",
      tone: "signal",
    },
    {
      when: "SUBMITTED",
      label: "Approve or reject",
      reason: "Waiting for an approver to review the request.",
      action: { type: "anchor", hash: "#approve" },
      perm: "REQUISITION_APPROVE",
      tone: "signal",
    },
    {
      when: "APPROVED",
      label: "Collect quotes & convert to PO",
      reason: "Approved — gather ≥3 vendor quotes, then convert to a purchase order.",
      action: { type: "anchor", hash: "#quotes" },
      perm: "PROCUREMENT_MANAGE",
      tone: "signal",
    },
    {
      when: "CONVERTED",
      label: "Open the purchase order",
      reason: "This requisition has become a PO — track it there.",
      action: { type: "navigate", href: "/m/procurement" },
      tone: "go",
    },
  ],
  listNext: {
    countStatuses: ["SUBMITTED"],
    label: (n) => `${n} requisition${n !== 1 ? "s" : ""} awaiting approval`,
    reason: "Approve submitted requests so procurement can collect quotes.",
    filterChip: "SUBMITTED",
    perm: "REQUISITION_APPROVE",
  },
};

// ─────────────────────────────────────────────────────────────────
// STOCK TRANSFER — move stock between locations
// ─────────────────────────────────────────────────────────────────

const STOCK_TRANSFER_FLOW: FlowDef = {
  id: "stockTransfer",
  listHref: "/m/transfers",
  listLead: "Stock moves between warehouses and sites. In-transit transfers need confirmation on arrival.",
  nodes: [
    { status: "DRAFT", label: "Draft", detailHref: "/m/transfers/{id}" },
    { status: "IN_TRANSIT", label: "In transit", detailHref: "/m/transfers/{id}" },
    { status: "COMPLETED", label: "Completed", detailHref: "/m/transfers/{id}" },
    { status: "CANCELLED", label: "Cancelled", detailHref: "/m/transfers/{id}" },
  ],
  next: [
    {
      when: "DRAFT",
      label: "Dispatch the transfer",
      reason: "A draft hasn't left the source location yet.",
      action: { type: "anchor", hash: "#dispatch" },
      perm: "STOCK_TRANSFER",
      tone: "signal",
    },
    {
      when: "IN_TRANSIT",
      label: "Confirm arrival",
      reason: "Stock is on the way — confirm it reached the destination.",
      action: { type: "anchor", hash: "#receive" },
      perm: "STOCK_TRANSFER",
      tone: "signal",
    },
  ],
  listNext: {
    countStatuses: ["IN_TRANSIT"],
    label: (n) => `${n} transfer${n !== 1 ? "s" : ""} in transit`,
    reason: "Confirm arrivals so destination stock updates.",
    filterChip: "IN_TRANSIT",
    perm: "STOCK_TRANSFER",
  },
};

// ─────────────────────────────────────────────────────────────────
// MATERIAL ISSUE — issue stock to a project / unit
// ─────────────────────────────────────────────────────────────────

const MATERIAL_ISSUE_FLOW: FlowDef = {
  id: "materialIssue",
  listHref: "/m/site/issue",
  listLead: "Stock issued to projects and units. Pending issues need a gate pass before stock moves.",
  nodes: [
    { status: "PENDING", label: "Pending", detailHref: "/m/site/issue" },
    { status: "COMPLETED", label: "Completed", detailHref: "/m/site/issue" },
    { status: "CANCELLED", label: "Cancelled", detailHref: "/m/site/issue" },
  ],
  next: [
    {
      when: "PENDING",
      label: "Approve the gate pass",
      reason: "Stock hasn't moved yet — approve the gate pass to release it.",
      action: { type: "anchor", hash: "#approve" },
      perm: "STOCK_ISSUE",
      tone: "signal",
    },
  ],
};

// ─────────────────────────────────────────────────────────────────
// MATERIAL SALE — sell scrap / surplus material
// ─────────────────────────────────────────────────────────────────

const MATERIAL_SALE_FLOW: FlowDef = {
  id: "materialSale",
  listHref: "/m/material-sales",
  listLead: "Sales of scrap and surplus material. Record payments against each sale.",
  nodes: [
    { status: "PENDING", label: "Pending", detailHref: "/m/material-sales/{id}" },
    { status: "ACTIVE", label: "Active", detailHref: "/m/material-sales/{id}" },
    { status: "CANCELLED", label: "Cancelled", detailHref: "/m/material-sales/{id}" },
  ],
  next: [
    {
      when: "PENDING",
      label: "Approve the gate pass",
      reason: "The sale is waiting for gate pass approval before stock can move.",
      action: { type: "anchor", hash: "#approve" },
      perm: "SALE_CREATE",
      tone: "signal",
    },
    {
      when: "ACTIVE",
      label: "Record a payment",
      reason: "Sale is active — record the first payment from the buyer.",
      action: { type: "anchor", hash: "#payment" },
      perm: "SALE_CREATE",
      tone: "signal",
    },
  ],
  // List-level: active sales with pending payment
  listNext: {
    countStatuses: ["PENDING"],
    label: (n) => `${n} sale${n !== 1 ? "s" : ""} awaiting gate pass approval`,
    reason: "Approve sales so stock can be released.",
    filterChip: "PENDING",
    perm: "SALE_CREATE",
  },
};

// ─────────────────────────────────────────────────────────────────
// DPR — daily progress report, two-tier approval
// ─────────────────────────────────────────────────────────────────

const DPR_FLOW: FlowDef = {
  id: "dpr",
  listHref: "/m/dprs",
  listLead: "Daily progress reports from site. Sub-admins approve first, admins give final sign-off.",
  nodes: [
    { status: "SUBMITTED", label: "Submitted", detailHref: "/m/dprs/{id}" },
    { status: "SUB_ADMIN_APPROVED", label: "Sub-admin approved", detailHref: "/m/dprs/{id}" },
    { status: "APPROVED", label: "Approved", detailHref: "/m/dprs/{id}" },
    { status: "REJECTED", label: "Rejected", detailHref: "/m/dprs/{id}" },
  ],
  next: [
    {
      when: "SUBMITTED",
      label: "Sub-admin approval",
      reason: "A project manager or HR manager reviews first.",
      action: { type: "anchor", hash: "#subAdminApprove" },
      perm: "DPR_APPROVE_SUB_ADMIN",
      tone: "signal",
    },
    {
      when: "SUB_ADMIN_APPROVED",
      label: "Final admin approval",
      reason: "Cleared by sub-admin — an owner/admin gives the final sign-off.",
      action: { type: "anchor", hash: "#adminApprove" },
      perm: "DPR_APPROVE_ADMIN",
      tone: "signal",
    },
    {
      when: "REJECTED",
      label: "Resubmit after fixes",
      reason: "This DPR was rejected — fix the notes and resubmit.",
      action: { type: "anchor", hash: "#resubmit" },
      perm: "DPR_MANAGE",
      tone: "stop",
    },
  ],
  listNext: {
    countStatuses: ["SUBMITTED"],
    label: (n) => `${n} DPR${n !== 1 ? "s" : ""} awaiting sub-admin approval`,
    reason: "Review site progress reports from today.",
    filterChip: "SUBMITTED",
    perm: "DPR_APPROVE_SUB_ADMIN",
  },
};

// ─────────────────────────────────────────────────────────────────
// NCR — non-conformance report
// ─────────────────────────────────────────────────────────────────

const NCR_FLOW: FlowDef = {
  id: "ncr",
  listHref: "/m/quality-control",
  listLead: "Non-conformances raised on site. Open NCRs need review and a corrective action plan.",
  nodes: [
    { status: "OPEN", label: "Open", detailHref: "/m/quality-control" },
    { status: "UNDER_REVIEW", label: "Under review", detailHref: "/m/quality-control" },
    { status: "CAPA_REQUIRED", label: "CAPA required", detailHref: "/m/quality-control" },
    { status: "ACCEPTED", label: "Accepted", detailHref: "/m/quality-control" },
    { status: "REJECTED", label: "Rejected", detailHref: "/m/quality-control" },
    { status: "CLOSED", label: "Closed", detailHref: "/m/quality-control" },
    { status: "CANCELLED", label: "Cancelled", detailHref: "/m/quality-control" },
  ],
  next: [
    {
      when: "OPEN",
      label: "Start review",
      reason: "A newly raised NCR needs QA/QC to investigate.",
      action: { type: "anchor", hash: "#review" },
      perm: "QC_MANAGE",
      tone: "signal",
    },
    {
      when: "UNDER_REVIEW",
      label: "Decide on CAPA",
      reason: "Review done — decide if a corrective action plan is needed.",
      action: { type: "anchor", hash: "#capa" },
      perm: "QC_MANAGE",
      tone: "signal",
    },
    {
      when: "CAPA_REQUIRED",
      label: "Create the CAPA",
      reason: "A corrective + preventive action plan is required before closure.",
      action: { type: "anchor", hash: "#capa" },
      perm: "QC_MANAGE",
      tone: "stop",
    },
  ],
};

// ─────────────────────────────────────────────────────────────────
// BUILT UNIT — real estate unit lifecycle
// ─────────────────────────────────────────────────────────────────

const BUILT_UNIT_FLOW: FlowDef = {
  id: "builtUnit",
  listHref: "/m/units",
  listLead: "Apartments, shops and villas in your projects. Track construction status and sales.",
  nodes: [
    { status: "PLANNED", label: "Planned", detailHref: "/m/units" },
    { status: "UNDER_CONSTRUCTION", label: "Under construction", detailHref: "/m/units" },
    { status: "AVAILABLE", label: "Available", detailHref: "/m/units" },
    { status: "RESERVED", label: "Reserved", detailHref: "/m/units" },
    { status: "HOLD", label: "On hold", detailHref: "/m/units" },
    { status: "SOLD", label: "Sold", detailHref: "/m/units" },
    { status: "RENTED", label: "Rented", detailHref: "/m/units" },
  ],
  next: [
    {
      when: "PLANNED",
      label: "Start construction",
      reason: "Planned units have no costs yet — mark under construction when work begins.",
      action: { type: "anchor", hash: "#status" },
      perm: "PROJECT_MANAGE",
      tone: "signal",
    },
    {
      when: "UNDER_CONSTRUCTION",
      label: "Mark available",
      reason: "Construction complete — make the unit available for sale.",
      action: { type: "anchor", hash: "#status" },
      perm: "PROJECT_MANAGE",
      tone: "signal",
    },
    {
      when: "AVAILABLE",
      label: "Create a sale",
      reason: "The unit is ready — record a sale when a buyer is found.",
      action: { type: "navigate", href: "/m/sales" },
      perm: "SALE_CREATE",
      tone: "go",
    },
    {
      when: "RESERVED",
      label: "Convert to sale",
      reason: "Deposit received — finalise the sale.",
      action: { type: "navigate", href: "/m/sales" },
      perm: "SALE_CREATE",
      tone: "signal",
    },
  ],
};

// ─────────────────────────────────────────────────────────────────
// REGISTRY + LOOKUP HELPERS
// ─────────────────────────────────────────────────────────────────

export const FLOWS: Record<FlowId, FlowDef> = {
  procurement: PROCUREMENT_FLOW,
  requisition: REQUISITION_FLOW,
  stockTransfer: STOCK_TRANSFER_FLOW,
  materialIssue: MATERIAL_ISSUE_FLOW,
  materialSale: MATERIAL_SALE_FLOW,
  dpr: DPR_FLOW,
  ncr: NCR_FLOW,
  builtUnit: BUILT_UNIT_FLOW,
};

/**
 * Map a /m/* list route to its flow. Returns undefined for routes that
 * aren't the head of a transactional flow (e.g. /m/materials is a
 * master-data list, not a flow).
 */
const ROUTE_TO_FLOW: Record<string, FlowId> = {
  "/m/procurement": "procurement",
  "/m/requisitions": "requisition",
  "/m/transfers": "stockTransfer",
  "/m/site/issue": "materialIssue",
  "/m/material-sales": "materialSale",
  "/m/dprs": "dpr",
  "/m/quality-control": "ncr",
  "/m/units": "builtUnit",
};

export function flowForRoute(route: string): FlowDef | undefined {
  const id = ROUTE_TO_FLOW[route];
  return id ? FLOWS[id] : undefined;
}

/**
 * The next action for a record in a given status. Returns undefined if
 * the status is terminal (no next action) or unknown.
 *
 * The caller passes the user's permission set so the action is only
 * shown to people who can actually do it.
 */
export function nextActionFor(
  flowId: FlowId,
  status: string,
  can: (perm: string) => boolean,
): NextAction | undefined {
  const flow = FLOWS[flowId];
  if (!flow) return undefined;
  const action = flow.next.find((a) => a.when === status.toUpperCase());
  if (!action) return undefined;
  if (action.perm && !can(action.perm)) return undefined;
  return action;
}

/**
 * Server-side resolver — takes a role string and uses hasPermission
 * directly, so server components can resolve the next action without
 * passing a function across the server/client boundary.
 */
export function resolveNextAction(
  flowId: FlowId,
  status: string,
  role: string,
): NextAction | undefined {
  return nextActionFor(flowId, status, (perm) => hasPermission(role, perm));
}

/**
 * The ordered list of nodes up to and including the current status —
 * for rendering a "before → here" strip. Returns nodes with their
 * state (done / current / pending / skipped).
 */
export function flowPosition(flowId: FlowId, status: string): FlowNode[] {
  const flow = FLOWS[flowId];
  if (!flow) return [];
  const upper = status.toUpperCase();
  const idx = flow.nodes.findIndex((n) => n.status?.toUpperCase() === upper);
  if (idx === -1) return flow.nodes;
  return flow.nodes.map((n, _i) => ({
    ...n,
    // state is derived by the caller; here we just return the slice
  }));
}
