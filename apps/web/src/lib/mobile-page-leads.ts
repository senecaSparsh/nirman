/**
 * MOBILE PAGE LEADS — one plain-language line per list route.
 *
 * Same contract as nav.ts `hint` and PageHeader `description` — written
 * once, shown everywhere a new user lands. PageLead auto-resolves from
 * this map when no explicit `text`/`flow` prop is passed, and
 * MobileListPage renders it above every list — so a first-time user
 * always gets "what this page is for and what needs doing" without
 * anyone explaining it.
 *
 * Voice rules (match FLOWS[].listLead):
 *  - First clause: what the things on this page are.
 *  - Second clause: the state that needs action.
 *  - Field-worker plain — no accounting/ERP jargon, no feature names.
 */

export const MOBILE_PAGE_LEADS: Record<string, string> = {
  "/m/attendance":
    "Who showed up on site today — mark present, half-day or absent (haziri). Days marked here drive payroll.",
  "/m/brokers":
    "Real estate brokers — their commission rate, contact and deal history.",
  "/m/calls":
    "Every call on company numbers — recordings, notes and who handled it.",
  "/m/change-orders":
    "Changes to approved scope, budget or schedule. Submitted ones need approval before work follows them.",
  "/m/customers":
    "People who bought or may buy from you — their units, payments and documents.",
  "/m/departments":
    "Cost centers like workshop or lab. Stock issued to a department counts as expense, not project work.",
  "/m/dprs":
    "Daily progress reports from site. Sub-admins approve first, admins give final sign-off.",
  "/m/equipment":
    "Machines and tools — where they are, who has them, and when they were last serviced.",
  "/m/expense-claims":
    "Bills submitted by staff for reimbursement. Approved claims need paying; yours track below.",
  "/m/expenses":
    "Money spent outside purchases — fuel, repairs, site expenses. Unapproved ones need a manager.",
  "/m/gate-pass":
    "Nothing leaves the gate without a pass. Approved passes need an exit stamp at the gate.",
  "/m/land":
    "Land parcels you own — what they cost and how they've been divided.",
  "/m/leads":
    "Interested buyers not yet customers — follow-ups due show at the top.",
  "/m/material-issues":
    "Stock issued to sites and units. Pending issues need a gate pass before stock moves.",
  "/m/material-sales":
    "Sales of scrap and surplus material. Record payments against each sale.",
  "/m/materials":
    "Every item you buy — its unit, reorder level and current cost.",
  "/m/notifications":
    "Everything waiting on you — approvals, alerts and updates across the company.",
  "/m/permissions":
    "Licenses, NOCs and certificates for projects and land — expiring ones need renewal.",
  "/m/petty-cash":
    "Small cash floats held by staff. Record spends against each float; request a top-up when low.",
  "/m/portal-listings":
    "Units listed on the customer-facing portal — what buyers see.",
  "/m/profit-center":
    "Which projects actually make money — income minus all their costs.",
  "/m/projects":
    "Each site: its phases, its spend, and its cost per sq.ft.",
  "/m/quality-control":
    "Non-conformances raised on site. Open NCRs need review and a corrective action plan.",
  "/m/rate-contracts":
    "Pre-negotiated supplier rates — buy at the contracted price without fresh quotes.",
  "/m/rentals":
    "Units rented out and the rent due each month — overdue collections show first.",
  "/m/safety":
    "Hazards, incidents and inspections on site. Open items need someone assigned.",
  "/m/sales":
    "Unit sales to customers — payment schedules, collections and documents.",
  "/m/sms":
    "Bank SMS messages the system matched to payments — unmatched ones need a look.",
  "/m/standard-consumptions":
    "How much material each work item should use — the benchmark for wastage flags.",
  "/m/stock-locations":
    "Warehouses and site stores — where stock physically lives.",
  "/m/subcontractors":
    "Labour contractors — their work orders, rates and bills.",
  "/m/supplier-payments":
    "Money owed to suppliers — pay against open bills.",
  "/m/suppliers":
    "Who you buy from — GSTIN, contacts and what you still owe them.",
  "/m/telephony":
    "Company phone numbers and call-recording setup.",
  "/m/units":
    "Apartments, shops and villas in your projects — construction status and sales.",
  "/m/work-orders":
    "Work given to labour contractors — issued orders need bills matched to progress.",
  "/m/workflows":
    "Approval chains — who signs off on what, and in what order.",

  // Hubs — the "pick a section" surfaces.
  "/m/accounts": "The money side — receivables, payables, ledger, payroll and reports.",
  "/m/books": "The books — ledger, receivables, payables and statutory reports.",
  "/m/construction": "Site work — DPRs, measurement book, tasks and progress.",
  "/m/crm": "Buyers — leads, customers, calls and follow-ups.",
  "/m/expenses-hub": "Spending — expenses, claims, budgets and petty cash.",
  "/m/hr": "People — attendance, payroll, leaves and staff records.",
  "/m/inventory": "Stock — what's on hand, movements, counts and issues.",
  "/m/procurement": "Buying — indents, quotes, purchase orders and suppliers.",
  "/m/pulse": "Everything waiting on you — approvals and attention items.",
  "/m/real-estate": "Units and customers — sales, collections and rentals.",
  "/m/reports": "Every report, grouped by the stage it belongs to.",
  "/m/settings": "Company setup — team, permissions, projects and data.",
  "/m/site": "Today's site work — attendance, DPR, issues and receipts.",
  "/m/stock": "Stock — on hand, ledger, transfers, counts and scrap.",
  "/m/stock-out": "Stock leaving — issues to site and sales to buyers.",
};

/** Normalize /m/…/ trailing slashes so lookup is forgiving. */
export function leadForPath(pathname: string): string | undefined {
  const key =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;
  return MOBILE_PAGE_LEADS[key];
}
