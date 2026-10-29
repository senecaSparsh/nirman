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

/**
 * DETAIL LEADS — record-level orientation for /m/{entity}/[id] pages.
 * Voice: what this record is, and what a user can do with it here.
 * Keyed by the parent list path — `/m/materials/cmx123` resolves to
 * `"/m/materials"`.
 */
export const MOBILE_DETAIL_LEADS: Record<string, string> = {
  "/m/boq": "One project's cost budget — line by line. Actual spend tracks against each head.",
  "/m/budget-variance": "Planned vs actual for one project head — where the overrun is coming from.",
  "/m/calls": "One call — recording, notes, and the follow-up it created.",
  "/m/change-orders": "One scope change — what changed, who approved it, and its cost effect.",
  "/m/customers": "One customer — their units, payments, documents and follow-ups.",
  "/m/dprs": "One day's site report — work done, labour and material used. Approvals happen here.",
  "/m/equipment": "One machine — where it is, who has it, and its service history.",
  "/m/expense-claims": "One claim — the bills inside and its approval. Approved claims can be paid here.",
  "/m/expenses": "One expense — what it was for, its approval, and receipt.",
  "/m/land": "One land parcel — cost, documents, and how it's been divided.",
  "/m/leads": "One interested buyer — call history, follow-ups, and converting to a sale.",
  "/m/material-issues": "One stock issue — what went out, to which project, and its gate pass.",
  "/m/material-sales": "One material sale — the items sold and payments recorded against it.",
  "/m/materials": "One material — stock at each location, cost history, and where it went.",
  "/m/measurement-book": "One measurement — quantities the engineer verified for billing.",
  "/m/portal-listings": "One portal listing — what buyers see for this unit.",
  "/m/procurement": "One purchase order — lines, supplier, and what's been received.",
  "/m/project-control": "One project's control view — cost, progress and variance in one place.",
  "/m/projects": "One project — its phases, spend, units and documents.",
  "/m/rate-contracts": "One supplier rate contract — the agreed prices and validity.",
  "/m/rentals": "One tenancy — tenant, rent schedule, escalation and collections.",
  "/m/requisitions": "One material request from site — approved items become purchase orders.",
  "/m/sales": "One unit sale — buyer, payment schedule, and collections.",
  "/m/scrap-generations": "One scrap lot — quantity generated, sold and remaining.",
  "/m/standard-consumptions": "One consumption benchmark — expected material per work item.",
  "/m/stock-counts": "One physical count — book vs counted, and the variance to reconcile.",
  "/m/subcontractors": "One labour contractor — work orders, bills and payments.",
  "/m/supplier-returns": "One return to a supplier — items sent back and the credit note.",
  "/m/suppliers": "One supplier — GSTIN, purchases, and what you still owe.",
  "/m/transfers": "One stock transfer — what moved, between which stores, and its receipt.",
  "/m/units": "One unit — construction status, buyer, and payment schedule.",
  "/m/wbs": "One work breakdown — the project's tasks and their progress.",
  "/m/work-orders": "One work order — the contractor, scope, and bills against progress.",
  "/m/workflows": "One approval chain — who signs off, in what order.",
};

/**
 * CREATE LEADS — for /m/{entity}/new form pages. Voice: what you're
 * making, and what happens after you save (the part people call about).
 * Keyed by the /new path itself.
 */
export const MOBILE_CREATE_LEADS: Record<string, string> = {
  "/m/brokers/new": "Add a broker — set their commission % and contact. Deals link to them from sales.",
  "/m/customers/new": "Add a customer — their units and payments track here once a sale is made.",
  "/m/equipment/new": "Register a machine — track its location, custodian and service schedule.",
  "/m/expense-claims/new": "File bills for reimbursement — submit it, a manager approves, then it's paid.",
  "/m/expenses/new": "Record a spend outside purchases — it needs approval before it hits the books.",
  "/m/leads/new": "Note an interested buyer — follow-ups remind you until they convert or go cold.",
  "/m/material-sales/new": "Sell scrap or surplus material — the buyer pays against this record.",
  "/m/materials/new": "Add an item you buy — set its unit and reorder level so alerts fire.",
  "/m/petty-cash/new": "Open a cash float for a site or person — spends and top-ups track against it.",
  "/m/portal-listings/new": "List a unit on the buyer-facing portal — this is what customers see.",
  "/m/procurement/new": "Raise a purchase order — after approval it's ordered, then received at the gate.",
  "/m/quotations/new": "Ask suppliers for rates — compare landed costs and convert the winner to a PO.",
  "/m/requisitions/new": "Site asking office to buy material — approved items become purchase orders.",
  "/m/sales/new": "Sell a unit to a buyer — sets the payment schedule and collections against it.",
  "/m/scrap-generations/new": "Record scrap generated on site — sell it later to recover cost.",
  "/m/stock-counts/new": "Count physical stock at a location — mismatches flag for reconciliation.",
  "/m/stock-locations/new": "Add a warehouse or site store — stock lives and moves between these.",
  "/m/subcontractors/new": "Add a labour contractor — give them work orders and match bills to progress.",
  "/m/supplier-payments/new": "Pay a supplier against open bills — their balance updates instantly.",
  "/m/supplier-returns/new": "Send items back to a supplier — creates the debit note and stock deduction.",
  "/m/suppliers/new": "Add a supplier — their GSTIN, rates and running balance track here.",
  "/m/transfers/new": "Move stock between stores — it stays in-transit until the receiver confirms.",
  "/m/workflows/new": "Build an approval chain — who signs off, in what order, for which documents.",
};

/** Normalize /m/…/ trailing slashes so lookup is forgiving. */
export function leadForPath(pathname: string): string | undefined {
  const key =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;
  if (MOBILE_PAGE_LEADS[key]) return MOBILE_PAGE_LEADS[key];
  // Create-form route — its own lead voice.
  const last = key.slice(key.lastIndexOf("/") + 1);
  if (last === "new") return MOBILE_CREATE_LEADS[key];
  if (last === "edit") return undefined;
  // Detail route — strip the [id] segment and try the detail map.
  const parent = key.slice(0, key.lastIndexOf("/"));
  return parent.startsWith("/m") ? MOBILE_DETAIL_LEADS[parent] : undefined;
}
