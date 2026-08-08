# Gauntlet Loop — Critic Rubric

This is the reference bar every critic subagent compares work against.
The builder's work must **beat** this bar — equal is a fail.

## Reference Products

1. **Buildesk ERP** (buildesk.in) — Indian real-estate developer ERP.
   Functional twin of Nirman: Indent→PO→GRN procurement, sales inventory,
   project costing, auto TDS/GST/VAT, Tally integration, RERA-ready.
   Reference for *functional completeness* and *domain correctness*.

2. **Procore Materials** (procore.com/materials) — global gold standard
   for construction software UX. Reference for *UX quality*:
   - Clean data tables with vendor, date, status columns
   - Status tracking with colored badges (not text)
   - Drill-down from list → detail on every row
   - Mobile-first field workflows (receive, issue, count from phone)
   - Real-time inventory counts with storage locations
   - Three-way matching (PO ↔ receipt ↔ invoice)
   - Supply chain visibility (order → delivery → installation)
   - Spatial overlay of material locations
   - Defect logging at the tailgate
   - AI-powered low-stock alerts

## Functional Bar (from AGENTS.md)

Every page MUST satisfy:

- **Multi-tenant**: filter by `companyId` via `getCompany()`. Never leak
  cross-company data.
- **Soft deletes**: master entities filtered by `deletedAt: null`.
- **RBAC**: Server Components call `getUserRole()` + `hasPermission()`.
  API routes call `requirePermission(PERM.X)` or `requireUser()`.
- **Money**: `Decimal` in DB, `toNum()` + `formatCurrency()` in UI.
  Never raw JS number for money in DB layer.
- **Stock ledger**: never mutate stock directly — `recordMovement()` /
  `recordTransfer()` only.
- **Audit logging**: every mutation calls `logAction()`.
- **GL posting**: every financial mutation posts a balanced journal
  entry in the same transaction.
- **Approvals**: POs DRAFT→APPROVED, requisitions SUBMITTED→APPROVED.
  DPRs SUBMITTED→SUB_ADMIN_APPROVED→APPROVED|REJECTED.
- **Dynamic rendering**: `connection()` + Suspense + skeleton fallback.

## UX Bar (per page type)

### List pages (desktop)
- Data table with: sortable columns, column visibility, search/filter
  bar, pagination or virtual scroll for large sets
- Status column with colored Badge components (not lowercase text)
- Row click → detail page (drill-down is mandatory, not optional)
- Action buttons per row where RBAC allows (approve, receive, cancel)
- Bulk actions where applicable (select rows → act)
- Empty state with icon + helpful hint + primary CTA to create
- Loading: skeleton rows, not spinners
- Export to CSV / print where appropriate

### List pages (mobile /m/)
- Pull-to-refresh or refresh button
- Search bar (filter by name/number/status)
- Status filter chips (All / Draft / Pending / Completed)
- Tappable rows → mobile detail view or bottom sheet
- Status as colored badge/chip, not lowercase text
- Quick actions accessible (FAB or swipe action)
- Stat cards at top (already present — keep)
- Empty state with hint (already present — keep)
- Skeleton loading (already present — keep)
- Bottom nav / back button to return

### Detail pages
- Header with entity number, status badge, key dates
- Tabbed or sectioned layout for related data
- Action bar with RBAC-gated buttons (approve, edit, print, cancel)
- Linked entities shown as clickable chips/links
- Money formatted as currency, quantities with units
- Audit trail / activity feed where applicable
- Print button → /print/[type]/[id] page

### Form / create pages
- Validation with inline error messages
- Required field indicators
- Line items: add/remove rows, auto-calc totals
- Money fields with proper formatting
- Select dropdowns for related entities (supplier, project, material)
- Submit + cancel, with confirmation for destructive actions
- Success → redirect to detail or list with toast

### Dashboard / overview pages
- KPI cards with trend indicators
- Charts (bar/line) for time-series data
- Quick links to drill into details
- Role-adaptive content (different KPIs per role)
- Alerts / pending actions widget

## Verdict Rules

The critic returns one of:
- **PASS** — the page beats the reference bar. Name any residual risks.
- **FAIL** — the reference bar wins. List the biggest gaps in priority
  order. The builder must fix the top gap before the next round.

Equal-to-bar = FAIL. The work must exceed the bar.

## Critic Output Format

```
VERDICT: PASS | FAIL
GAPS (if FAIL, ranked by severity):
1. [CRITICAL] <what's broken or missing> — <expected per rubric>
2. [MAJOR] ...
3. [MINOR] ...
RESIDUAL RISKS (if PASS):
- <risk> — <mitigation>
```
