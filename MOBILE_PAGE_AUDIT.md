# Mobile Page Structure Audit

> Audited: 2026-09-07 · 154 `page.tsx` routes under `apps/web/src/app/m/`
> Goal: group pages by structural pattern so similar pages can be refined
> consistently (shared primitives, shared layouts, shared UX flows).

## Summary

| # | Pattern | Pages | Description |
|---|---------|-------|-------------|
| A | **Tabbed Hub** | 9 | `?tab=` query-param hub with tabbed navigation, aggregates sub-modules |
| B | **Full CRUD** (List + `[id]` + `/new`) | 14 | List page, detail page, dedicated new-form page |
| C | **List + Detail** (FAB/dialog create) | 14 | List page + `[id]` detail; create via FAB or dialog (no `/new` route) |
| D | **List + New** (no detail) | 5 | List page + `/new` form; no detail page (entity is simple) |
| E | **List-only** | 14 | Single list page, no detail or new sub-routes |
| F | **Project-scoped** | 6 | Requires `?project=` selector; shows project picker then scoped data |
| G | **Persona Dashboard** | 6 | Custom dashboard layouts (attention banners, quick actions, widgets) |
| H | **Settings sub-tree** | 6 | Settings pages with distinct purposes |
| I | **Report pages** | 18 | Individual report views under `/reports/` |
| J | **Site sub-pages** | 8 | Field-persona sub-routes under `/site/` |
| K | **Pulse / attention** | 3 | Approval/attention dashboards |
| L | **Single-purpose** | 7 | Unique non-CRUD pages (profile, queue, SMS, telephony, etc.) |
| M | **Redirect / utility** | 4 | Redirects, root index, error/loading/not-found |

---

## Pattern A — Tabbed Hub (9 pages)

**Structure:** `page.tsx` reads `?tab=` searchParam → renders a `*HubTabs` wrapper
with tab-specific content. Each tab fetches its own data server-side. Aggregates
multiple sub-modules into one page (reuses list components from sub-module pages).

**Shared components:** `*HubTabs` wrapper, `AttentionBannerCarousel`, `MobileStatCard`,
`MobileSectionTitle`, `MobileSkeletonHome`.

| Route | Tabs | Hub component |
|-------|------|---------------|
| `/m/accounts` | overview, expenses, claims, petty-cash, payments, receipts, gl | `MobileAccountsHubTabs` |
| `/m/stock` | locations, movements, scrap, counts (via `?tab=`) | `MobileStockHubTabs` |
| `/m/procurement` | POs, direct purchases, requisitions, rate-contracts | `MobileProcurementHubTabs` |
| `/m/construction` | BOQ, WBS, change-orders, work-orders, DPRs, measurement-book | `MobileConstructionHubTabs` |
| `/m/real-estate` | projects, units, land, customers, brokers, rentals | `MobileRealEstateHubTabs` |
| `/m/hr` | overview, employees, leaves, onboarding, pending | `MobileHrHubTabs` |
| `/m/reports` | overview, financial, purchasing, inventory, projects | `MobileReportsHubTabs` |
| `/m/crm` | leads, calls, customers, sales (inline, no HubTabs component) | inline |
| `/m/sales` | sales list + new sale hub | `MobileSalesHub` |

**Notes:**
- `/m/books` is a redirect to `/m/accounts` (Pattern M).
- `/m/expenses-hub` is a dashboard-style hub (could be Pattern G) but groups
  expense-related links — not truly tabbed. See Pattern G.
- `/m/inventory` is a dashboard with attention banners + hierarchy tree, not
  tabbed. See Pattern G.
- `/m/customers` has `MobileCustomersLeadsTabs` (customers/leads toggle) but is
  also a standalone list page — borderline Pattern A/E.

---

## Pattern B — Full CRUD: List + `[id]` + `/new` (14 modules)

**Structure:** Three routes per module:
1. `page.tsx` — server-component list (fetch + serialize → `<Mobile*List>`)
2. `[id]/page.tsx` — server-component detail (fetch → `<Mobile*DetailClient>`)
3. `new/page.tsx` — server-component wrapper → `<MobileNew*Client>` form

**Shared conventions:**
- List: `Suspense` + `MobileSkeletonList`, `connection()`, `getCompany()`,
  `getUserRole()`, permission check, Prisma `findMany` with `take: 50–80`,
  serialize to typed `*ListItem[]`, pass to `<Mobile*List>` with export props.
- Detail: fetch by `id` + `companyId`, serialize, pass to client component.
- New: minimal server wrapper, client component handles form + mutation.
- Most have `loading.tsx` in `/new` for skeleton.
- Most have `error.tsx` for error boundary.

| Module | List | Detail | New | Loading | Error |
|--------|------|--------|-----|---------|-------|
| `customers` | ✅ | ✅ `[id]` | ✅ | ✅ | ✅ |
| `equipment` | ✅ | ✅ `[id]` | ✅ | ✅ | ✅ |
| `expense-claims` | ✅ | ✅ `[id]` | ✅ | ❌ | ❌ |
| `leads` | ✅ | ✅ `[id]` | ✅ | ✅ | ✅ |
| `material-sales` | ✅ | ✅ `[id]` | ✅ | ✅ | ✅ |
| `materials` | ✅ | ✅ `[id]` + `[id]/edit` | ✅ | ✅ | ❌ |
| `portal-listings` | ✅ | ✅ `[id]` | ✅ | ✅ | ❌ |
| `procurement` | ✅ | ✅ `[id]` | ✅ | ✅ | ✅ |
| `quotations` | ✅ | ✅ `[id]` | ✅ | ✅ | ✅ |
| `requisitions` | ✅ | ✅ `[id]` | ✅ | ✅ | ✅ |
| `scrap-generations` | ✅ | ✅ `[id]` | ✅ | ✅ | ❌ |
| `stock-counts` | ✅ | ✅ `[id]` | ✅ | ✅ | ❌ |
| `subcontractors` | ✅ | ✅ `[id]` | ✅ | ✅ | ❌ |
| `supplier-returns` | ✅ | ✅ `[id]` | ✅ | ✅ | ❌ |
| `suppliers` | ✅ | ✅ `[id]` | ✅ | ✅ | ✅ |
| `transfers` | ✅ | ✅ `[id]` | ✅ | ✅ | ✅ |
| `workflows` | ✅ | ✅ `[id]` | ✅ | ✅ | ❌ |

**Inconsistencies found:**
- `expense-claims` and `petty-cash` are missing `loading.tsx` in `/new`. *(fixed)*
- `expense-claims` is missing `error.tsx`.
- `materials` has an extra `[id]/edit` route (unique — edit form as separate
  route rather than dialog).
- `procurement` is both a hub (Pattern A) AND has full CRUD sub-routes.

---

## Pattern C — List + Detail (FAB/dialog create, no `/new`) (14 modules)

**Structure:** Two routes:
1. `page.tsx` — list with stat cards + `<Mobile*List>` + optional `<Mobile*Fab>`
   or `<MobileNew*Dialog>` for inline creation.
2. `[id]/page.tsx` — detail page.

**Shared conventions:** Same as Pattern B list/detail, but create is a FAB
(floating action button) or dialog instead of a separate route.

| Module | List | Detail | Create method | Error |
|--------|------|--------|---------------|-------|
| `boq` | ✅ | ✅ `[id]` | `MobileBoqFab` (dialog) | ❌ |
| `budget-variance` | ✅ | ✅ `[id]` | N/A (read-only) | ❌ |
| `calls` | ✅ | ✅ `[id]` | N/A (system-created) | ✅ |
| `change-orders` | ✅ | ✅ `[id]` | `MobileChangeOrdersFab` (dialog) | ❌ |
| `dprs` | ✅ | ✅ `[id]` | `MobileDprsFab` (dialog) | ✅ |
| `hr/employees` | ✅ | ✅ `[id]` | `MobileEmployeesFab` (dialog) | ✅ |
| `hr/onboarding` | ✅ | ✅ `[id]` | N/A (from employee detail) | ❌ |
| `land` | ✅ | ✅ `[id]` | `MobileNewLandDialog` (dialog) | ✅ |
| `material-issues` | ✅ | ✅ `[id]` | N/A (from stock-out) | ✅ |
| `measurement-book` | ✅ | ✅ `[id]` | `MobileNewMbEntryDialog` (dialog) | ❌ |
| `projects` | ✅ | ✅ `[id]` | `MobileNewProjectDialog` (dialog) | ✅ |
| `quality-control` | ✅ | `ncr/[id]` | `MobileNcrFab` (dialog) | ❌ |
| `rate-contracts` | ✅ | ✅ `[id]` | `MobileRateContractsFab` (dialog) | ❌ |
| `rentals` | ✅ | ✅ `[id]` | `MobileNewTenancyDialog` (dialog) | ✅ |
| `safety` | ✅ | `hazards/[id]` + `incidents/[id]` + `inspections/[id]` | FAB per sub-type | ✅ |
| `standard-consumptions` | ✅ | ✅ `[id]` | `MobileStandardConsumptionsFab` (dialog) | ❌ |
| `stock` | ✅ | ✅ `[id]` | N/A (from other flows) | ✅ |
| `units` | ✅ | ✅ `[id]` | `MobileUnitsFab` (dialog) | ❌ |
| `wbs` | ✅ | ✅ `[id]` | `MobileNewWbsNodeDialog` (dialog) | ❌ |
| `work-orders` | ✅ | ✅ `[id]` | `MobileWorkOrdersFab` (dialog) | ❌ |
| `books/receipts` | ✅ | ✅ `[id]` | N/A (from sales) | ❌ |

**Notes:**
- `safety` is unique: one list page with three sub-entity types (hazards,
  incidents, inspections), each with their own `[id]` detail route and FAB.
- `budget-variance`, `calls`, `material-issues`, `hr/onboarding` are read-only
  detail (no create action — data comes from other flows).

---

## Pattern D — List + New (no detail) (5 modules)

**Structure:** List page + `/new` form page, but no `[id]` detail route.
The entity is simple enough that the list row shows all needed info.

| Module | List | New | Loading | Error |
|--------|------|-----|---------|-------|
| `brokers` | ✅ | ✅ | ✅ | ❌ |
| `petty-cash` | ✅ | ✅ | ❌ | ❌ |
| `supplier-payments` | ✅ | ✅ | ❌ | ❌ |

**Notes:**
- `petty-cash` and `supplier-payments` are missing `loading.tsx` and `error.tsx`. *(loading.tsx fixed)*
- These could potentially benefit from detail pages for viewing individual
  transactions.

---

## Pattern E — List-only (14 pages)

**Structure:** Single `page.tsx` — server-component list with stats + list
component. No detail or new sub-routes. Create/manage via dialogs or external
links.

| Route | List component | Create method | Error |
|-------|---------------|---------------|-------|
| `/m/attendance` | `MobileAttendanceList` | N/A (check-in/out) | ❌ |
| `/m/departments` | `MobileDepartmentsList` | dialog (in list component) | ❌ |
| `/m/expenses` | `MobileExpensesList` | link to `/m/accounts?tab=expenses` | ❌ |
| `/m/gate-pass` | `MobileGatePassList` | N/A | ❌ |
| `/m/material-reconciliation` | project selector → recon data | N/A (read-only) | ❌ |
| `/m/permissions` | `MobilePermissionsList` | N/A (admin) | ❌ |
| `/m/profit-center` | `MobileProfitCenterClient` | N/A (read-only) | ❌ |
| `/m/vehicles` | (inline list) | `MobileNewVehicleDialog` | ❌ |
| `/m/books/finance` | `MobileFinanceList` | `MobileNewFinanceDialog` | ❌ |
| `/m/books/gl` | `MobileGlList` | `MobileReseedAccountsButton` | ❌ |
| `/m/books/payroll` | `MobilePayrollList` | `MobileGeneratePayrollDialog` | ❌ |
| `/m/books/reports` | (inline report links) | N/A | ❌ |
| `/m/hr/leaves` | `MobileLeavesList` | `MobileLeavesFab` (dialog) | ❌ |
| `/m/hr/pending` | (inline approval queue) | N/A | ❌ |

**Notes:**
- None of these have `error.tsx` — they all rely on the parent error boundary.
- `/m/expenses` is somewhat redundant with `/m/accounts?tab=expenses`.
- `/m/books/*` pages are sub-routes that are also linked from `/m/accounts` hub.

---

## Pattern F — Project-scoped pages (6 modules)

**Structure:** `page.tsx` reads `?project=` searchParam → shows a
`Mobile*ProjectSelector` dropdown. If no project selected, shows empty state.
If project selected, fetches and renders project-scoped data. Most also have
`[id]` detail routes.

| Module | Selector | Detail | Notes |
|--------|----------|--------|-------|
| `boq` | `MobileBoqProjectSelector` | ✅ `[id]` | BOQ tree for project |
| `budget-variance` | `MobileBudgetVarianceProjectSelector` | ✅ `[id]` | Budget vs actual per project |
| `material-reconciliation` | `MobileMaterialReconProjectSelector` | ❌ | Read-only recon |
| `measurement-book` | `MobileMbProjectSelector` | ✅ `[id]` | MB entries for project |
| `project-control` | `MobileProjectControlSelector` | ✅ `[id]` | Project control dashboard |
| `wbs` | `MobileWbsProjectSelector` | ✅ `[id]` | WBS tree for project |

**Shared conventions:**
- All use `?project=` query param.
- All have a `Mobile*ProjectSelector` component.
- All show "Select a project" empty state when no project chosen.
- `boq` and `wbs` render tree structures (flattened with indentation).
- `budget-variance` and `project-control` render dashboard-style detail pages.

---

## Pattern G — Persona Dashboard (6 pages)

**Structure:** Custom dashboard layout with attention banners, quick-action
cards, multi-column widget grids, and context-aware sections. Not list-based —
each is a unique composition of widgets.

**Shared components:** `AttentionBannerCarousel`, `MobileStatCard`, `MobileRow`,
`MobileSectionTitle`, `MobileEmptyState`, `MobileCta`, quick-action grids.

| Route | Persona | Key widgets |
|-------|---------|-------------|
| `/m/home` | All (orbit nav) | Company hierarchy tree, quick actions, attention |
| `/m/site` | Supervisor (field) | 6-col quick actions, tasks, in-transit POs, recent issues, projects |
| `/m/inventory` | Inventory manager | Attention banners, hierarchy tree, pending indents |
| `/m/hr` (hub) | HR manager | Org hierarchy, workforce breakdown, attention, quick actions |
| `/m/expenses-hub` | Finance | Expense category cards, links to sub-pages |
| `/m/pulse` | Manager | Portfolio summary, alerts, approvals queue |

**Notes:**
- `/m/home` is the most complex — adaptive home with company tree navigation.
- `/m/site` has the most dense layout (6-col action grid + 2-col widget grids).
- `/m/hr` doubles as both a hub (Pattern A) and a dashboard (Pattern G).
- `/m/inventory` is a dashboard, not a tabbed hub.

---

## Pattern H — Settings sub-tree (6 pages)

**Structure:** Settings pages under `/m/settings/`, each with a distinct
purpose. Mix of list pages and form pages.

| Route | Type | Component |
|-------|------|-----------|
| `/m/settings` | Settings menu | inline link list |
| `/m/settings/company` | Edit form | `MobileCompanyEditClient` |
| `/m/settings/export` | Data export | inline |
| `/m/settings/notifications` | Notification prefs | inline |
| `/m/settings/project-assignments` | Assignment manager | `MobileProjectAssignmentsClient` |
| `/m/settings/team` | Team list | `MobileTeamList` |

**Shared:** `error.tsx`, `loading.tsx` at settings root. `company-switcher.tsx`
shared component.

---

## Pattern I — Report pages (18 pages)

**Structure:** Each report is a standalone `page.tsx` under `/m/reports/`.
The parent `/m/reports` is a tabbed hub (Pattern A) that links to these.

| Route | Report |
|-------|--------|
| `/m/reports/balance-sheet` | Balance Sheet |
| `/m/reports/cash-flow` | Cash Flow |
| `/m/reports/comparative` | Comparative Analysis |
| `/m/reports/department-consumption` | Department Consumption |
| `/m/reports/expenses` | Expenses |
| `/m/reports/gst` | GST Report |
| `/m/reports/inventory-value` | Inventory Value |
| `/m/reports/issue-register` | Issue Register |
| `/m/reports/job-costing` | Job Costing |
| `/m/reports/payroll-expense` | Payroll Expense |
| `/m/reports/pending-payments` | Pending Payments |
| `/m/reports/profit` | Profit & Loss |
| `/m/reports/project-progress` | Project Progress |
| `/m/reports/purchase-register` | Purchase Register |
| `/m/reports/purchase-trends` | Purchase Trends |
| `/m/reports/purchaser-performance` | Purchaser Performance |
| `/m/reports/real-estate-inventory` | Real Estate Inventory |
| `/m/reports/sales-revenue` | Sales Revenue |
| `/m/reports/stock-movement-summary` | Stock Movement Summary |
| `/m/reports/tds-certificates` | TDS Certificates |

**Shared:** `MobileReportHeader`, `MobileReportTable`/`MobileReportChart`
(likely from `@/components/mobile/v2/report-ui`). `/m/reports/error.tsx` at
parent level.

---

## Pattern J — Site sub-pages (8 pages)

**Structure:** Field-persona sub-routes under `/m/site/`. Each is a
single-purpose page for a field operation.

| Route | Purpose |
|-------|---------|
| `/m/site/attendance` | Worker attendance (GPS-tagged check-in/out) |
| `/m/site/dpr` | Daily Progress Report submission |
| `/m/site/field` | Field notes/observations |
| `/m/site/issue` | Quick material issue (shortcut to stock-out) |
| `/m/site/me` | Field worker profile |
| `/m/site/receive` | Receive stock against POs |
| `/m/site/stock` | Site stock view |
| `/m/site/tasks` | Task list with FAB for new tasks |

**Notes:**
- `/m/site/tasks` has `MobileTasksFab` + `MobileNewTaskDialog` (Pattern C style).
- `/m/site/receive` has `MobileReceiveList` component.
- `/m/site/stock` has `MobileSiteStockList` component.

---

## Pattern K — Pulse / Attention (3 pages)

**Structure:** Approval and attention dashboards under `/m/pulse/`.

| Route | Purpose |
|-------|---------|
| `/m/pulse` | Main pulse dashboard (portfolio summary, alerts, approvals) |
| `/m/pulse/approvals` | Approval queue |
| `/m/pulse/attention` | Attention items |

**Shared:** `error.tsx` at pulse root.

---

## Pattern L — Single-purpose pages (7 pages)

**Structure:** Unique pages that don't fit CRUD or dashboard patterns.

| Route | Purpose | Component |
|-------|---------|-----------|
| `/m/me` | User profile | `MePageClient` |
| `/m/queue` | Offline sync queue | `MobileOfflineQueueClient` |
| `/m/sms` | SMS ingest log | `MobileSmsIngest` |
| `/m/telephony` | Telephony dashboard | `MobileTelephonyView` |
| `/m/alerts/lease-expiry` | Lease expiry alerts | inline |
| `/m/rent` | Rent dashboard | inline |
| `/m/stock-out` | Quick material issue flow | `MobileStockOutClient` |

---

## Pattern M — Redirect / Utility (4 pages)

| Route | Purpose |
|-------|---------|
| `/m` | Redirect to `/m/home` |
| `/m/books` | Redirect to `/m/accounts` |
| `/m/not-found` | 404 page |
| `/m/error` | Error boundary |

**Also at root level:** `layout.tsx`, `loading.tsx` (shared across all `/m/*`).

---

## Cross-cutting findings

### Missing `error.tsx` boundaries (should have their own)
These modules have multiple routes but no error boundary, relying on the
parent `/m/error.tsx`:
- `boq`, `budget-variance`, `change-orders`, `departments`, `equipment`
  (has error but...), `expense-claims`, `expenses-hub`, `gate-pass`,
  `material-reconciliation`, `measurement-book`, `permissions`, `petty-cash`,
  `portal-listings`, `profit-center`, `project-control`, `quality-control`,
  `rate-contracts`, `scrap-generations`, `site` (all sub-pages), `sms`,
  `standard-consumptions`, `stock-counts`, `stock-locations`, `stock-out`,
  `subcontractors`, `supplier-payments`, `supplier-returns`, `telephony`,
  `units`, `vehicles`, `wbs`, `work-orders`, `workflows`

### Missing `loading.tsx` in `/new` routes
- ~~`expense-claims/new`~~ — added
- ~~`petty-cash/new`~~ — added
- ~~`supplier-payments/new`~~ — added

### Structural inconsistencies
1. **`materials` has `[id]/edit`** — unique edit route. All other modules
   use dialogs or inline forms for editing.
2. **`safety` has three sub-entity types** in one module (hazards, incidents,
   inspections) — each with its own `[id]` route and FAB. Other modules keep
   one entity per route folder.
3. **`procurement` is both a hub (Pattern A) and has full CRUD (Pattern B)** —
   the hub shows POs/direct purchases/requisitions/rate-contracts in tabs,
   but also has `[id]` and `/new` sub-routes.
4. **`customers` has `MobileCustomersLeadsTabs`** — a tabbed list (customers
   vs leads) but also has `[id]` and `/new`. The leads module (`/m/leads`) is
   a separate full CRUD module. This creates two entry points for leads.
5. **`books/*` sub-routes are linked from `/m/accounts` hub** but also exist
   as standalone pages. Potential navigation confusion.
6. **`expenses` page exists standalone** but is also a tab in `/m/accounts`.
   Same for `expense-claims`, `petty-cash`, `supplier-payments`.

### Shared primitives usage
All pages import from `@/components/mobile/v2/primitives`:
- `MobileSectionTitle`, `MobileRow`, `MobileStatCard`, `MobileEmptyState`,
  `Badge`, `MobileCta`, `SectionHead`, `MobileNoAccess`
- Export/share: `MobileColumnSpec` from `@/components/mobile/v2/export-share-bar`
- Skeletons: `MobileSkeletonList`, `MobileSkeletonHome` from
  `@/components/mobile/mobile-skeleton`

### Permission pattern
All server pages follow: `getUserRole()` → `hasPermission(role, PERM.*)` →
`notFound()` or `<MobileNoAccess>` if denied. Consistent across all patterns.
