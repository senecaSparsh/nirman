# Pilot Company Onboarding

> The guided runbook for the first real company. Order matters — later
> steps depend on earlier ones existing. Every step was verified present
> in the UI on 2026-10-22; if a step is missing, that's a regression.

## Day 0 — Company shell

1. **Create the company** — fresh deploy: `/sign-up` bootstraps Company +
   OWNER. Multi-company: Settings → Companies → New Company, then
   **Switch** (top-right of each company card). Owner lands as OWNER.
2. **Company identity** — Settings → Company tab: GSTIN, PAN, registered
   address (address picker sets geo-fence center), UPI ID (enables
   tap-to-pay on demand notices), books-locked-through date.
3. **Set approval routing** — same tab: PO approval thresholds
   (manager vs owner), LCI threshold, approval aging hours (default 48h).

## Day 0 — Structure

4. **Stock locations** — Settings → Locations: one central warehouse +
   one PROJECT_SITE per live site (site locations auto-scope stock).
5. **Projects** — Projects → New Project: name, code, site address
   (geo-fence for check-ins), budget if known.
6. **Departments** — Settings → Cost Centres if cost-centre reporting
   is wanted (optional).

## Day 1 — Masters (bulk, not by hand)

7. **Materials** — Materials → Import (CSV): code, name, unit, category,
   HSN, GST rate, reorder point. Verify 3 rows by hand after import.
8. **Suppliers** — Suppliers → Import CSV: name, GSTIN, phone, payment
   terms, MSME flag (drives 43B(h) aging). Check MSME flags carefully —
   they drive statutory interest accrual.
9. **Employees** — HR → Employees → Bulk Import. Then per-employee:
   salary components (basic/HRA/special), UAN/PF/ESI numbers,
   bank details, site assignment.

## Day 1 — Opening balances (the audit-critical step)

10. **Opening stock** — per material × location: Materials → row →
    Adjust Stock → IN, qty + unit cost, reason "Opening stock entry".
    Posts `Dr Inventory / Cr Opening Balance Equity` automatically.
    **Reconcile total against the physical count sheet before users
    start transacting** — every future valuation inherits this base.
11. **Opening GL balances** — Finance → GL → Opening Balance entry:
    trial balance as of cutover date (cash, bank, creditor/debtor
    ledgers, capital, loans). Must balance to zero — the API enforces.
12. **Open receivables** — Sales: create customer ledgers with opening
    balance flags or backdated demands as of cutover.
13. **Open payables** — Suppliers: opening balances + any open POs
    recreated (with original PO dates in the notes for traceability).

## Day 2 — Users + first transaction

14. **Invite users** — Settings → Users: assign roles hierarchically
    (OWNER → ADMIN → dept heads → site staff). Verify one SITE_ENGINEER
    can check in on `/m/home` from a real phone on site GPS.
15. **First transaction** — walk one PO → GRN → bill → payment end to
    end on a real supplier. Confirm the GL postings match expectation.

## Parallel-run agreement (non-negotiable for pilot)

- Books continue in the company's existing system (Tally/Excel) for the
  first full month.
- Weekly: export Nirman trial balance, compare line-by-line with the
  incumbent. Any divergence > ₹1 → investigate before proceeding.
- GST month-end: run GSTR-1/3B summary, hand to their CA for sign-off
  before filing from it.
- TDS: verify 194C deductions on one real subcontractor bill.

## Support loop

- Bug report → RUNBOOK.md template (symptom → screenshots → what they
  expected). Fix-forward within the pilot SLA.
- Weekly review: what did they _not_ do in the app this week, and why.
