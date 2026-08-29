# Nirman Inventory OS — Mobile App Complete Flow Map

> **Source of truth for the mobile (`/m/*`) surface.** Every page, every button, every action,
> every API call, every state transition — mapped end-to-end.
>
> Generated from a full code audit of `apps/web/src/app/m/**` + `apps/web/src/components/mobile/**`
> + `apps/web/src/lib/mobile-nav-v2.ts` + `apps/web/src/app/api/orbit/route.ts`.

---

## Table of Contents

1. [Entry & Shell](#1-entry--shell)
2. [Persona-Based Tab Bars](#2-persona-based-tab-bars)
3. [Home Tab — Orbit Navigator](#3-home-tab--orbit-navigator)
4. [Inventory Tab](#4-inventory-tab)
5. [Site Tab — Field Dashboard](#5-site-tab--field-dashboard)
6. [HR Tab](#6-hr-tab)
7. [Accounts Tab](#7-accounts-tab)
8. [Settings / More Tab](#8-settings--more-tab)
9. [NavSheet — Full Sitemap](#9-navsheet--full-sitemap)
10. [Procurement Flow](#10-procurement-flow)
11. [Requisition → Quote → PO Pipeline](#11-requisition--quote--po-pipeline)
12. [Stock Operations Flow](#12-stock-operations-flow)
13. [Stock Transfer Flow](#13-stock-transfer-flow)
14. [Site Field Actions Flow](#14-site-field-actions-flow)
15. [Sales & CRM Flow](#15-sales--crm-flow)
16. [Real Estate / Projects Flow](#16-real-estate--projects-flow)
17. [Construction Management Flow](#17-construction-management-flow)
18. [DPR Multi-Tier Approval Flow](#18-dpr-multi-tier-approval-flow)
19. [Measurement Book Approval Flow](#19-measurement-book-approval-flow)
20. [WBS Node Management Flow](#20-wbs-node-management-flow)
21. [Quality & Safety Flow](#21-quality--safety-flow)
22. [Books / Accounts Flow](#22-books--accounts-flow)
23. [Reports Hub](#23-reports-hub)
24. [Pulse / Dashboards / Approvals](#24-pulse--dashboards--approvals)
25. [Portal Listings Flow](#25-portal-listings-flow)
26. [Cross-Cutting Behaviors](#26-cross-cutting-behaviors)
27. [Complete Page Inventory](#27-complete-page-inventory)

---

## 1. Entry & Shell

### Entry Point
- **`/m`** → pure redirect to **`/m/home`** (no UI, `connection()` for PPR-safe dynamic rendering)
  - Source: `apps/web/src/app/m/page.tsx`

### Layout
- All `/m/*` routes render inside **`<MobileShellV2>`** via `apps/web/src/app/m/layout.tsx`
- The root layout's `<AppShell>` short-circuits for `/m` paths — desktop sidebar never wraps mobile routes

### Shell Components (`MobileShellV2`)
Source: `apps/web/src/components/mobile/v2/mobile-shell.tsx`

#### Header (sticky top)
| Element | Action | Condition |
|---------|--------|-----------|
| 3-dot menu (⋮) | Opens **NavSheet** (side panel, persona-filtered) | On module home pages |
| Back chevron (←) | `router.back()` or fallback to `goBackFallback()` (persona-aware module routing) | On drill-down pages |
| Company name | Opens **company switcher** dropdown | OWNER/ADMIN with >1 company, no parent |
| Voice agent button | Opens voice assistant | Always |
| Online/Offline icon | Status indicator (Wifi/WifiOff) | Always |
| Sync badge | Links to `/m/queue` (offline queue) | When offline items queued |

#### Offline Banner
- Shows when `navigator.onLine === false`
- Displays queued item count
- "Syncing…" or "N Queued" button → `/m/queue`

#### Content Area
- Scrollable, `max-w-[34rem]`, centered
- **Pull-to-refresh**: pull down → `router.refresh()`
- **Edge-swipe back**: swipe right >80px from left edge → `router.back()`
- Both gestures coexist via merged touch handlers

#### Bottom Tab Bar
- Fixed, `56px` touch targets
- Amber underline for active tab
- Count badges per tab (fetched from `ALL_BADGE_TABS` — the union of all
  badge-bearing tabs across all personas, fetched in parallel on mount)
- Persona-based — see [§2](#2-persona-based-tab-bars)
- **Search tab** (center position) opens a full-screen search overlay
  (`MobileGlobalSearch`) instead of navigating — does not change the URL

#### Global Behaviors
| Behavior | Mechanism |
|----------|-----------|
| Auth guard | Redirects to `/sign-in` when no session (unless `NEXT_PUBLIC_AUTH_BYPASS=true`) |
| 401 interceptor | Wraps `window.fetch` — on 401 from `/api/*`, signs out + redirects to `/sign-in` |
| Company resolution | `GET /api/me` + `GET /api/company` in parallel |
| Company switch | `POST /api/company/switch` → dispatches `nirman-company-switched` event → orbit + tree refresh |
| Document title | `{companyName} · Nirman OS` |
| Tab badges | Fetches counts from `ALL_BADGE_TABS` (union of all badge-bearing tabs across all personas) in parallel |
| NavSheet filtering | `navGroupsForPersona(moduleId, persona)` hides NavGroups not relevant to the current persona |
| goBack fallback | `goBackFallback(pathname, personaTabs)` routes back to the persona's relevant tab based on the current path's parent module |

---

## 2. Persona-Based Tab Bars

Source: `apps/web/src/lib/mobile-nav-v2.ts` — `tabsForRole(role)` + `roleToPersona(role)`

Every persona has **Search as the center tab** (the Linear model — search is
the universal entry point for deep hierarchies). The Search tab opens a
full-screen overlay (`MobileGlobalSearch`) instead of navigating — it does
not change the URL.

| Persona | Roles | Tabs (left → right) |
|---------|-------|---------------------|
| **executive** | OWNER, ADMIN, PROJECT_DIRECTOR, FINANCE_HEAD | Home · Inventory · Search · HR · More |
| **ops** | PROJECT_MANAGER | Home · Inventory · Search · Site · More |
| **procurement** | PROCUREMENT_MANAGER, STORE_KEEPER | Inventory · POs · Search · Stock · More |
| **field** | SITE_ENGINEER, SUPERVISOR, QAQC_ENGINEER | Site · DPR · Search · Tasks · More |
| **sales** | SALES_MANAGER | Home · Sales · Search · Customers · More |
| **finance** | ACCOUNTANT | Home · Accounts · Search · Reports · More |
| **hr** | HR_MANAGER | HR · Attendance · Search · DPR · More |

### Tab Definitions
| Tab ID | Label | Route | Badge Endpoint |
|--------|-------|-------|----------------|
| home | Home | `/m/home` | — |
| inventory | Inventory | `/m/inventory` | `/api/purchase-orders?status=DRAFT,APPROVED,ORDERED,PARTIAL` |
| search | Search | `#search` (opens overlay, does not navigate) | — |
| hr | HR | `/m/hr` | — |
| accounts | Accounts | `/m/accounts` | — |
| settings | More | `/m/settings` | — |
| site | Site | `/m/site` | — |
| dpr | DPR | `/m/dprs` | `/api/dprs?approvalStatus=SUBMITTED` |
| tasks | Tasks | `/m/site/tasks` | `/api/my-tasks` |
| stock | Stock | `/m/stock` | — |
| procurement | POs | `/m/procurement` | `/api/purchase-orders?status=DRAFT` |
| transfers | Transfers | `/m/transfers` | — |
| sales | Sales | `/m/sales` | — |
| customers | Customers | `/m/customers` | — |
| reports | Reports | `/m/reports` | — |
| attendance | Attendance | `/m/attendance` | — |

### Badge Fetching
- `ALL_BADGE_TABS` (in `mobile-nav-v2.ts`) is the union of all tabs that
  carry a `badge` endpoint, across every persona.
- `MobileShellV2` fetches all badge endpoints in parallel on mount and
  stores results in a `badgeCounts` map keyed by tab `href`.
- Only tabs in the active persona's tab bar display their badge — but
  counts are pre-fetched for all tabs so switching persona doesn't
  require a refetch.

### Active Tab Detection
- `isModuleActive(pathname, href)`: exact match OR `pathname.startsWith(href + "/")`
- Drill-down pages (not a module home) show back chevron instead of 3-dot menu

---

## 3. Home Tab — Orbit Navigator

**Route:** `/m/home`
**Source:** `apps/web/src/app/m/home/page.tsx` + `home-client.tsx` + `apps/web/src/components/mobile/v2/orbit-navigator.tsx`
**API:** `GET /api/orbit?type=<type>&id=<id>` (node) + `GET /api/orbit?mode=children&parentType=<>&parentId=<>&category=<>` (children)

### Visual Layout
- Circular orbit: center card + category chips arranged in a ring around it
- Center card: entity icon, title, subtitle, meta, detail fields, "Open page" link
- Tapping center card → expands to fill orbit area (chips fade + scale down)
- Tapping a chip → loads children as a 2-col grid below the orbit
- Tapping a child body → drills down (if `hasChildren`)
- Tapping a child's "→" icon → opens the full page for that entity

### Hierarchy
```
Company (center)
  ├─ Companies (subsidiaries) → drill into subsidiary orbit
  ├─ Projects → drill into Project orbit
  │     ├─ Built Units → drill into Unit orbit
  │     │     ├─ Sales (asset sales)
  │     │     ├─ Material Issues
  │     │     ├─ Portal Listings
  │     │     └─ Tenancies
  │     ├─ Land Parcels → drill into Parcel orbit
  │     │     ├─ Sub-Parcels
  │     │     ├─ Partitions
  │     │     └─ Asset Sales
  │     ├─ Requisitions / Purchase Orders / Material Issues
  │     ├─ DPRs / Phases / Expenses / Equipment / Crews / Leads / Scrap
  │     └─ "Open page" → /m/projects/[id]
  ├─ Land (land purchases)
  ├─ Departments (cost centers)
  ├─ Inventory (stock locations)
  ├─ Workforce (employees)
  ├─ Equipment / Suppliers / Customers / Vehicles / Subcontractors
  ├─ Expenses / Leads / Tasks / Scrap / Transfers
  └─ "Open page" → /m/settings
```

### Company Node Details
- GSTIN, PAN, Parent company name
- Project value (sum of `totalProjectCost`)
- Asset value (land + unit valuations)

### Project Node Details
- Status, Type, Budget, Total cost, Cost/sqft, Sellable area, Address

### Built Unit Node Details
- Type, Status, Area, Floor, Wing, Production cost, Asking price, Valuation

### FAB (Floating Action Button)
- **Create new company** — OWNER/ADMIN only (with `COMPANY_MANAGE` permission, no parent company)
- Opens `MobileCompanyFab` → `MobileNewCompanyDialog`

---

## 4. Inventory Tab

**Route:** `/m/inventory`
**Source:** `apps/web/src/app/m/inventory/page.tsx` + `inventory-interactive.tsx` + `InventoryHierarchy.tsx`

### Layout (top → bottom)
1. **Attention banner carousel** — auto-scrolling needs-attention items
   - Out-of-stock materials (red) → tap → `/m/materials/[id]`
   - Low-stock materials (amber) → tap → `/m/materials/[id]`
   - Pending approvals (amber) → tap → `/m/pulse/approvals`
   - "All caught up" (green) → tap → `/m/materials`
2. **Raw Material / Real Estate toggle** (URL-synced `?tab=`)
3. **Quick actions grid** (4-col, switches with tab)
4. **Company-group inventory tree** — parent → subsidiaries → warehouses/projects
5. **Pending indents** list → tap → `/m/requisitions/[id]`

### Quick Actions — Raw Material
| Action | Route |
|--------|-------|
| Quotations | `/m/quotations` |
| Purchase Orders | `/m/procurement` |
| Receive | `/m/site/receive` |
| Issue | `/m/site/issue` |
| Transfers | `/m/transfers` |
| Materials | `/m/materials` |
| Stock Inventory | `/m/stock-counts` |
| Material Sales | `/m/material-sales` |

### Quick Actions — Real Estate
| Action | Route |
|--------|-------|
| Sales | `/m/sales?tab=collections` |
| Projects | `/m/projects` |
| Units | `/m/units` |
| Land | `/m/land` |
| Customers | `/m/customers` |
| Rentals | `/m/rentals` |
| Work Orders | `/m/work-orders` |
| Portal Listings | `/m/portal-listings` |

### Inventory Tree
- Scopes by company position: parent → full group tree; child → own subtree only
- Shows: company name, warehouse stock value, project stock value, SKU count
- Expandable: company → subsidiaries → warehouses / projects → locations

---

## 5. Site Tab — Field Dashboard

**Route:** `/m/site`
**Source:** `apps/web/src/app/m/site/page.tsx`
**Persona:** Field (SITE_ENGINEER, SUPERVISOR, QAQC_ENGINEER), Ops (PROJECT_MANAGER)

### Attention Banners
- DPR not submitted today → tap → `/m/site/dpr`
- Overdue tasks → tap → `/m/site/tasks`
- Overdue POs for receipt → tap → `/m/site/receive?po=[id]`
- "All caught up" if none

### Quick Actions (6-col row)
| Action | Route | Badge |
|--------|-------|-------|
| Quick Issue | `/m/site/issue` | — |
| Receive Stock | `/m/site/receive` | in-transit count (red if overdue) |
| Submit DPR | `/m/site/dpr` | Done/Due |
| Attendance | `/m/site/attendance` | headcount |
| Scrap Log | `/m/scrap-generations` | — |
| Open Tasks | `/m/site/tasks` | task count (red if overdue) |

### Side-by-Side Panels
| Panel | Content | Tap Action |
|-------|---------|------------|
| Tasks (left) | Open tasks with status bar, due date, overdue days | → `/m/site/tasks` |
| In Transit (right) | POs with supplier, PO number, days until/overdue | → `/m/site/receive?po=[id]` |
| Recent Issues (left) | Issue number, date, project, line count | (static) |
| My Projects (right) | Project name, status badge | → `/m/projects/[id]` |

---

## 6. HR Tab

**Route:** `/m/hr`
**Source:** `apps/web/src/app/m/hr/page.tsx`

### Layout
- Today's attendance summary (headcount, present %)
- DPR status overview
- Employee quick access
- Leave management

### Sub-pages
| Page | Route |
|------|-------|
| Employees | `/m/hr/employees` |
| Employee detail | `/m/hr/employees/[id]` |
| Leaves | `/m/hr/leaves` |
| Mark Attendance | `/m/site/attendance` |
| New DPR | `/m/site/dpr` |
| My Profile | `/m/site/me` |
| My Tasks | `/m/site/tasks` |

---

## 7. Accounts Tab

**Route:** `/m/accounts`
**Source:** `apps/web/src/app/m/accounts/page.tsx`

### Layout
- Finance home: GL overview, receipts, payroll
- Quick links to books sub-modules

### Sub-pages
| Page | Route |
|------|-------|
| Finance | `/m/books/finance` |
| Receipts | `/m/books/receipts` |
| Receipt detail | `/m/books/receipts/[id]` |
| Payroll | `/m/books/payroll` |
| Trial Balance (GL) | `/m/books/gl` |
| Analytics | `/m/books/reports` |
| Expenses | `/m/expenses` |

---

## 8. Settings / More Tab

**Route:** `/m/settings`
**Source:** `apps/web/src/app/m/settings/page.tsx`

### Zones (top → bottom)
1. **Company context** — header + switcher (`CompanySwitcher`)
2. **Business overview** (owner only) — last month summary + dues
3. **Profile** — user info, my activity → `/m/me`
4. **Administration** (owner only):
   - Company Details → `/m/settings/company`
   - Team & Permissions → `/m/settings/team`
   - Bulk Export → `/m/settings/export`
   - Notifications → `/m/settings/notifications`
5. **App** — theme toggle, currency toggle, install PWA
6. **Recent activity** — audit log feed
7. **Sign out** — `authClient.signOut()` → `/sign-in`

### Sub-pages
| Page | Route |
|------|-------|
| My Profile | `/m/me` |
| Company Details | `/m/settings/company` |
| Team & Permissions | `/m/settings/team` |
| Bulk Export | `/m/settings/export` |
| Notifications | `/m/settings/notifications` |
| Offline Queue | `/m/queue` |
| Company Portfolio | `/m/settings` (overview section) |

---

## 9. NavSheet — Full Sitemap (Persona-Filtered)

Source: `apps/web/src/lib/mobile-nav-v2.ts` — `NAV_GROUPS` + `navGroupsForPersona(moduleId, persona)`
Opened via 3-dot menu (⋮) in header on module home pages.
Grouped by module, shows available pages with icons + subtitles.

**Persona filtering**: each `NavGroup` may declare a `personas` field. If set,
the group is only shown to those personas. If omitted, the group is shown to
all. This prevents the Procore anti-pattern where a store keeper sees 20 tools
they'll never use (Real Estate, BOQ, Safety, Books, etc.).

**Module switcher grid**: the top of the NavSheet shows the current persona's
tab bar as a 5-column icon grid (not the legacy 5-tab array). The Search tab
is shown as a disabled placeholder (it can't be triggered from the NavSheet).

**Module resolution**: `moduleFromPath(pathname)` maps any `/m/*` path to its
parent module ID, so the NavSheet opens to the right section even on non-tab
pages (e.g. `/m/projects` → inventory module, `/m/boq` → inventory module).

### Home Module Groups
| Group | Personas | Links |
|-------|----------|-------|
| Dashboards | all | Executive Dashboard (`/m/pulse`), Field Dashboard (`/m/site`) |
| Attention | all | Attention Queue (`/m/pulse/attention`), Approvals (`/m/pulse/approvals`) |
| Quick Access | all | Inventory, People, Accounts, Settings |
| Projects & Real Estate | executive, ops, sales | Projects, Land, Sales, Rentals, Customers |
| Inventory & Procurement | executive, ops, procurement, field | Materials, Stock, POs, Suppliers, Equipment |
| Reports | all | All Reports (`/m/reports`) |

### Inventory Module Groups
| Group | Personas | Links |
|-------|----------|-------|
| Procurement | executive, ops, procurement, field | POs, Indents, Quotations, Suppliers, Rate Contracts, Supplier Returns |
| Stock | executive, ops, procurement, field | Materials, Stock Ledger, Add Stock Location, Site Stock, Transfers, Vehicles, Stock Inventory, Scrap, Material Sales, Gate Pass, Equipment |
| Real Estate | executive, ops, sales | Projects, Units, Land, Permissions, Customers, Sales, Rentals, Work Orders, Change Orders, QC, Portal Listings |
| Construction | executive, ops, field | BOQ, WBS, Measurement Book, Budget Variance, Project Control, Standard Consumptions, Material Reconciliation |
| Safety | executive, ops, field | Safety Management |
| Dashboards | all | Executive Dashboard, Field Dashboard |
| Alerts | all | Attention Queue, Approvals |
| Reports & Analysis | executive, ops, procurement, finance | Inventory Valuation, Stock Movement, Issue Register, Purchase Register, Purchase Trends, Purchaser Performance, Dept Consumption, Material Reconciliation, Vehicle Analysis, All Reports |

### HR Module Groups
| Group | Personas | Links |
|-------|----------|-------|
| Attendance | executive, ops, hr, field | Attendance, Mark Attendance |
| DPR | executive, ops, hr, field | Daily Progress Reports, New DPR |
| People | executive, ops, hr | Employees, Leaves, My Profile, My Tasks |
| Reports & Analysis | executive, ops, hr, finance | Payroll Expense, Attendance Summary, DPR Analysis, Standard vs Actual, All Reports |

### Accounts Module Groups
| Group | Personas | Links |
|-------|----------|-------|
| Books | executive, ops, finance | Finance Home, Finance, Receipts, Payroll |
| Ledger & Reports | executive, ops, finance | Trial Balance, Analytics, Reports Hub |
| Reports & Analysis | executive, ops, finance | P&L, Cash Flow, Pending Payments, Sales Revenue, Project Progress, Job Costing, Real Estate Inventory, GST, TDS, Expenses |

### Settings Module Groups
| Group | Personas | Links |
|-------|----------|-------|
| Profile | all | My Profile, Company Portfolio, Offline Queue |
| Administration | executive | Company Details, Team & Permissions, Bulk Export, Notifications |

---

## 10. Procurement Flow

### List Page
**Route:** `/m/procurement`
- PO list with status filters (DRAFT, APPROVED, ORDERED, PARTIAL, RECEIVED, CANCELLED)
- **[+ New PO]** button → `/m/procurement/new`

### New PO Page
**Route:** `/m/procurement/new`
**Source:** `apps/web/src/app/m/procurement/new/MobileNewProcurementClient.tsx`
- Form: supplier, procurement scope (COMPANY/PROJECT), destination location, expected date, line items (material, qty, unit cost), charges, notes
- **[Create PO]** → `POST /api/purchase-orders` → redirect to `/m/procurement/[id]`

### Detail Page
**Route:** `/m/procurement/[id]`
**Source:** `apps/web/src/app/m/procurement/[id]/page.tsx`
- Shows: PO number, supplier, status, lines, charges, totals, receipts history
- **Action buttons** (via `MobilePoActions`):

| Status | Button | Permission | API Call |
|--------|--------|------------|---------|
| DRAFT | Approve | `po.approve` | `PATCH /api/purchase-orders/[id]` `{action: "approve"}` |
| DRAFT | Cancel PO | `procurement.manage` | `PATCH /api/purchase-orders/[id]` `{action: "cancel"}` |
| APPROVED | Mark as Ordered | `procurement.manage` | `PATCH /api/purchase-orders/[id]` `{action: "order"}` |
| ORDERED/PARTIAL | Receive | — | Opens `MobileReceiveDialog` |
| Any | Print | — | Print view link |

- Uses **optimistic updates** — status pill changes instantly, reverts on error
- Haptic feedback on success

### Receive Dialog
**Source:** `apps/web/src/app/m/procurement/[id]/MobileReceiveDialog.tsx`
- Per-line qty received (defaults to ordered, editable for partial receipt)
- Weight-based receiving toggle (bulk materials)
- Lot/batch numbers, inspection status
- Gate pass number OR receiving photo upload
- **Proof of receipt (mandatory):** photos, e-signature, GPS geo-tag
- Geo-fence validation (Haversine distance vs location radius)
- Weighbridge fields (ticket no, gross/tare/net weight)
- Receipt notes
- **[Confirm — update stock]** → `POST /api/purchase-orders/[id]/receive` → creates `GoodsReceipt` + `StockMovement` (IN) + GL entry (`postPurchaseReceipt`)
- **[Reject]** mode → reject delivery with reason

### State Machine
```
DRAFT → (approve) → APPROVED → (order) → ORDERED → (receive) → PARTIAL/RECEIVED
DRAFT → (cancel) → CANCELLED
```

---

## 11. Requisition → Quote → PO Pipeline

### Requisition List
**Route:** `/m/requisitions`
- Requisition list with status filters
- **[+ New Indent]** → `/m/requisitions/new`
- **[Auto-generate]** → `POST /api/requisitions/auto` (generates draft requisitions for materials at/below reorder point)

### New Requisition
**Route:** `/m/requisitions/new`
**Source:** `apps/web/src/app/m/requisitions/new/MobileNewRequisitionClient.tsx`
- Form: project, lines (material, qty, unit, preferred supplier, suggested cost)
- **[Create]** → `POST /api/requisitions` → redirect to `/m/requisitions/[id]`

### Requisition Detail
**Route:** `/m/requisitions/[id]`
**Source:** `apps/web/src/app/m/requisitions/[id]/page.tsx`
- Shows: req number, project, status, lines, approval history
- **Action buttons** (via `MobileRequisitionActions`):

| Status | Button | Permission | API Call |
|--------|--------|------------|---------|
| DRAFT | Submit for approval | `procurement.manage` | `PATCH /api/requisitions/[id]` `{action: "submit"}` |
| SUBMITTED | Approve | `requisition.approve` | `PATCH /api/requisitions/[id]` `{action: "approve"}` |
| SUBMITTED | Reject | `requisition.approve` | `PATCH /api/requisitions/[id]` `{action: "reject"}` |
| APPROVED | Convert to PO | `procurement.manage` | `PATCH /api/requisitions/[id]` `{action: "convert", ...}` |

### Convert to PO Form (expandable)
- Supplier selection (with inline "create new supplier" via `MobileSelectWithCreate`)
- Procurement scope (COMPANY/PROJECT)
- Destination location (with inline "create new location")
- Expected date
- Per-line costs (editable, pre-filled from suggested cost)
- Estimated total (live calculation)
- Notes
- **[Create Purchase Order]** → `PATCH /api/requisitions/[id]` `{action: "convert", supplierId, procurementScope, destinationLocationId, lineCosts, ...}` → redirect to `/m/procurement/[poId]`

### Quote Gate
- Minimum 3 vendor quotes required (configurable via `minQuotesRequired`)
- Approver can waive with reason: `PATCH /api/requisitions/[id]` `{action: "waiveQuotes", reason}`
- Quote gate blocks PO conversion until satisfied or waived

### Quotation Requests
**Route:** `/m/quotations`
- List of quotation requests
- **[+ New]** → `/m/quotations/new`

### New Quotation
**Route:** `/m/quotations/new`
**Source:** `apps/web/src/app/m/quotations/new/MobileNewQuotationClient.tsx`
- Form: requisition link, items, vendor list
- **[Create]** → `POST /api/quotations`

### Quotation Detail
**Route:** `/m/quotations/[id]`
- Shows: quotation items, vendor quotes with comparison
- Upload vendor quotes (file + price) — `POST /api/quotes`
- System flags cheapest by landed total
- **[Select winner]** → `POST /api/quotes/[id]/select` (approver can override cheapest with reason)
- **[Convert to PO]** → `/m/procurement/new` (pre-filled from winning quote)

### State Machine
```
DRAFT → (submit) → SUBMITTED → (approve) → APPROVED → (convert) → PO created
                   → (reject) → REJECTED
APPROVED + quote gate not satisfied → blocked (or waive quotes)
```

---

## 12. Stock Operations Flow

### Stock Ledger
**Route:** `/m/stock`
- Current stock by location
- Tap location → `/m/stock/[id]` (location detail with stock items + movements)

### Materials Catalogue
**Route:** `/m/materials`
- Material list with category, unit, stock levels
- **[+ New]** → `/m/materials/new`

### New Material
**Route:** `/m/materials/new`
**Source:** `apps/web/src/app/m/materials/new/MobileNewMaterialClient.tsx`
- Form: code, name, category (with inline create via `MobileNewCategoryDialog`), unit, HSN code, GST rate, min stock, reorder point, EOQ
- **[Create]** → `POST /api/materials`

### Material Detail
**Route:** `/m/materials/[id]`
- Shows: material info, stock by location, movement history, reorder status
- **[Edit]** → `/m/materials/[id]/edit`

### Stock Counts (Cycle Count)
**Route:** `/m/stock-counts`
- List of stock counts
- **[+ New]** → `/m/stock-counts/new`

### New Stock Count
**Route:** `/m/stock-counts/new`
**Source:** `apps/web/src/app/m/stock-counts/new/MobileNewStockCountClient.tsx`
- Form: location, items to count
- **[Create]** → `POST /api/stock-counts`

### Stock Count Detail
**Route:** `/m/stock-counts/[id]`
- Shows: count items, system vs counted qty, variance
- **[Confirm]** → confirm count
- **[Reconcile]** → reconcile differences (adjusts stock via `StockMovement`)

### Scrap Generations
**Route:** `/m/scrap-generations`
- List of scrap generation slips
- **[+ New]** → `/m/scrap-generations/new`

### New Scrap Generation
**Route:** `/m/scrap-generations/new`
**Source:** `apps/web/src/app/m/scrap-generations/new/MobileNewScrapGenerationClient.tsx`
- Form: location, lines (material, qty, scrap unit cost), reason
- **[Create]** → `POST /api/scrap-generations` → creates `ScrapGeneration` + `StockMovement` (SCRAP_GENERATED, IN) + recalculates MAC

### Scrap Generation Detail
**Route:** `/m/scrap-generations/[id]`
- Shows: slip number (SG-YYMMDD-NNNN), lines, stock impact

### Material Sales
**Route:** `/m/material-sales`
- List of material sales
- **[+ New]** → `/m/material-sales/new`

### New Material Sale
**Route:** `/m/material-sales/new`
**Source:** `apps/web/src/app/m/material-sales/new/MobileNewMaterialSaleClient.tsx`
- Form: customer, lines (material, qty, unit price), project link (optional — for scrap cost recovery)
- **[Create]** → `POST /api/material-sales` → creates sale + `StockMovement` (OUT) + GL entry

### Material Sale Detail
**Route:** `/m/material-sales/[id]`
- Shows: sale info, lines, payment status
- **[Record Payment]** → `POST /api/material-sales/[id]/payment`
- **[Cancel]** → cancel sale

### Gate Pass
**Route:** `/m/gate-pass`
- Approve items leaving the gate
- Shows pending gate passes for verification

### Stock Locations
**Route:** `/m/stock-locations/new`
**Source:** `apps/web/src/app/m/stock-locations/new/MobileNewStockLocationClient.tsx`
- Form: name, type (COMPANY_WAREHOUSE/PROJECT_SITE), company, project (if project site), GPS coordinates, geo-radius
- **[Create]** → `POST /api/stock-locations`

---

## 13. Stock Transfer Flow

### Transfer List
**Route:** `/m/transfers`
- Transfer list with status filters (DRAFT, IN_TRANSIT, RECEIVED, RETURNED)
- **[+ New]** → `/m/transfers/new`

### New Transfer
**Route:** `/m/transfers/new`
**Source:** `apps/web/src/app/m/transfers/new/MobileNewTransferClient.tsx`
- Form: from location, to location, lines (material, qty)
- **[Create]** → `POST /api/transfers` → creates transfer (DRAFT)

### Transfer Detail
**Route:** `/m/transfers/[id]`
- Shows: transfer info, lines, dispatch/receive details, proof
- **Action buttons** (status-dependent):

| Status | Button | Dialog | API Call |
|--------|--------|--------|---------|
| DRAFT | Dispatch | `MobileTransferDispatchDialog` | `PATCH /api/transfers/[id]` `{action: "dispatch", vehicleType, vehicleNumber, ...}` |
| IN_TRANSIT | Receive at destination | `MobileTransferReceiveDialog` | `PATCH /api/transfers/[id]` `{action: "complete", receiverSignature, geo, photos, ...}` |
| IN_TRANSIT | Return to Source | (in receive dialog) | `PATCH /api/transfers/[id]` `{action: "returnToSource", reason}` |

### Dispatch Dialog
**Source:** `MobileTransferDispatchDialog` in `apps/web/src/app/m/transfers/[id]/MobileTransferReceiveDialog.tsx`
- Transport details: delivery mode, vehicle type/number, driver name/phone, transporter name, challan number, package count
- **Dispatch proof (mandatory):** photos, e-signature
- **[Dispatch — mark as in transit]** → creates `StockMovement` (OUT from source)

### Receive Dialog
**Source:** `MobileTransferReceiveDialog`
- Per-line qty received (editable for partial receipt)
- Delivery mode
- **Proof of receipt (mandatory):** photos, e-signature, GPS geo-tag
- Geo-fence validation
- Supervisor co-signature (optional)
- Weighbridge fields (optional)
- Shortage/damage remarks
- **[Confirm — update stock]** → creates `StockMovement` (IN to destination) + updates MAC
- **[Return to Source]** → with reason → reverses stock movement

### State Machine
```
DRAFT → (dispatch) → IN_TRANSIT → (complete) → RECEIVED
                    → (returnToSource) → RETURNED
```

---

## 14. Site Field Actions Flow

### Quick Issue
**Route:** `/m/site/issue`
**Source:** `apps/web/src/app/m/site/issue/MobileIssueForm.tsx`
- Form: from location, project, built unit (optional), lines (material, qty)
- **[Create Issue]** → `POST /api/material-issues` → creates `MaterialIssue` + `StockMovement` (OUT) + GL entry (`postMaterialIssue`)
- If `builtUnitId` set → cost goes directly to that unit's `productionCost`
- If not → cost is area-allocated across all project units via `reallocateProjectCosts()`

### Receive Stock
**Route:** `/m/site/receive`
- Pre-fills PO if `?po=[id]` query param present
- Same receive dialog as procurement detail
- Scan PO / gate entry → confirm receipt

### Submit DPR
**Route:** `/m/site/dpr`
**Source:** `apps/web/src/components/mobile/mobile-dpr-form.tsx`
- Form: project, date, work type, labor headcount, material lines, equipment used, notes
- **[Submit]** → `POST /api/dprs` → creates DPR (status: SUBMITTED)

### Mark Attendance
**Route:** `/m/site/attendance`
**Source:** `apps/web/src/components/mobile/mobile-attendance-form.tsx`
- Bulk check-in with GPS capture
- Per-worker: check-in time, GPS lat/lng, location name
- **[Check In]** → `POST /api/attendance` → creates `WorkerAttendance` records

### My Tasks
**Route:** `/m/site/tasks`
**Source:** `apps/web/src/app/m/site/tasks/page.tsx` + `MobileNewTaskDialog.tsx`
- Task list assigned to current user
- **[+ New Task]** → `MobileNewTaskDialog` → `POST /api/tasks`
- Tap task → update status: PENDING → IN_PROGRESS → BLOCKED → COMPLETED
- `PATCH /api/tasks/[id]` with new status

### Site Stock
**Route:** `/m/site/stock`
- Stock by site + recent movements

### Field Notes
**Route:** `/m/site/field`
- Field observation notes

### My Profile (Site)
**Route:** `/m/site/me`
- Supervisor profile

---

## 15. Sales & CRM Flow

### Leads
**Route:** `/m/leads`
- Lead list with status (NEW, CONTACTED, QUALIFIED, LOST, WON)
- Tap → `/m/leads/[id]` (lead detail with follow-ups)

### Customers
**Route:** `/m/customers`
- Customer list
- **[+ New]** → `/m/customers/new`

### New Customer
**Route:** `/m/customers/new`
**Source:** `apps/web/src/app/m/customers/new/page.tsx` + `MobileNewCustomerDialog` / `mobile-customer-form.tsx`
- Form: name, phone, email, GSTIN, address
- **[Create]** → `POST /api/customers`

### Customer Detail
**Route:** `/m/customers/[id]`
**Source:** `apps/web/src/app/m/customers/[id]/page.tsx` + `MobileCustomerEditForm.tsx`
- Shows: customer info, sales history, payment history
- **[Edit]** → inline form → `PATCH /api/customers/[id]`

### Sales
**Route:** `/m/sales`
- Sales list with tab filters (bookings, collections)
- **[+ New]** → `/m/sales/new`

### New Sale
**Route:** `/m/sales/new`
**Source:** `apps/web/src/app/m/sales/new/page.tsx` + `mobile-new-sale-form.tsx`
- Form: customer, project, built unit, sale price, payment terms, booking amount
- **[Create]** → `POST /api/sales` → creates `AssetSale` + GL entry

### Sale Detail
**Route:** `/m/sales/[id]`
- Shows: sale info, payment schedule, payments received, sale expenses, sale terms
- **[Record Payment]** → `POST /api/sales/[id]/payment` → `postPaymentReceived` GL entry
- **[Cancel]** → cancel sale

### Quotations (Sales)
**Route:** `/m/quotations` (shared with procurement quotations)
- **[+ New]** → `/m/quotations/new`

### Portal Listings
**Route:** `/m/portal-listings`
- List of portal listings (99acres, MagicBricks)
- **[+ New]** → `/m/portal-listings/new`

### New Portal Listing
**Route:** `/m/portal-listings/new`
**Source:** `apps/web/src/app/m/portal-listings/new/MobileNewPortalListingClient.tsx`
- Form: unit, portal, listing ID, price, status
- **[Create]** → `POST /api/portal-listings`

### Portal Listing Detail
**Route:** `/m/portal-listings/[id]`
- Shows: listing info, sync status
- **Action buttons** (via `MobilePortalListingActions`):

| Status | Button | API Call |
|--------|--------|---------|
| Any (not DELISTED) | Sync | `POST /api/portal-listings/[id]?action=sync` |
| LISTED | Delist | `POST /api/portal-listings/[id]?action=delist` (with confirmation) |

### Rentals
**Route:** `/m/rentals`
- Rented units list
- **[+ New Tenancy]** → `MobileNewTenancyDialog` → `POST /api/rentals`
- Tap → `/m/rentals/[id]` (tenancy agreement detail)

---

## 16. Real Estate / Projects Flow

### Projects
**Route:** `/m/projects`
- Project list with status (PLANNED, ACTIVE, COMPLETED)
- **[+ New]** → `MobileNewProjectDialog` → `POST /api/projects`

### Project Detail
**Route:** `/m/projects/[id]`
**Source:** `apps/web/src/app/m/projects/[id]/page.tsx`
- Shows: project info, built units, land parcels, costs, progress
- **[Edit]** → `MobileEditProjectDialog` → `PATCH /api/projects/[id]`

### Built Units
**Route:** `/m/units`
- Unit list with status (AVAILABLE, SOLD, RENTED)
- **[+ New]** → `MobileNewUnitDialog` → `POST /api/units`

### Unit Detail
**Route:** `/m/units/[id]`
- Shows: unit info, production cost, valuation, sales, material issues, tenancies

### Land & Parcels
**Route:** `/m/land`
- Land purchase list
- **[+ New]** → `MobileNewLandDialog` → `POST /api/land-purchases`
- **[New Land Purchase Order]** → `MobileLandPurchaseOrderDialog`
- **[New Seller]** → `MobileSellerDialog`

### Land Detail
**Route:** `/m/land/[id]`
**Source:** `apps/web/src/app/m/land/[id]/page.tsx` + `MobileLandEditForm.tsx`
- Shows: land purchase info, parcels, partitions, valuations
- **[Edit]** → `PATCH /api/land-purchases/[id]`
- **[Partition]** → split parcel (atomic txn: validate Σ child area = parent, create children, set parent PARTITIONED, record `LandPartition`)
- **[Valuation]** → update `currentValuation`

### Work Orders
**Route:** `/m/work-orders`
- Subcontractor work order list
- **[+ New]** → `MobileNewWorkOrderDialog` → `POST /api/work-orders`
- **[+ New Subcontractor]** → `MobileNewSubcontractorDialog` → `POST /api/subcontractors`
- Tap → `/m/work-orders/[id]` (scope + RA bills)

### Change Orders
**Route:** `/m/change-orders`
- Change order list
- **[+ New]** → `MobileNewChangeOrderDialog` → `POST /api/change-orders`
- Tap → `/m/change-orders/[id]` (scope & budget modifications)

### Subcontractors
**Route:** `/m/subcontractors`
- Subcontractor list
- Tap → `/m/subcontractors/[id]`

---

## 17. Construction Management Flow

### Bill of Quantities (BOQ)
**Route:** `/m/boq`
- BOQ list
- **[+ New BOQ Item]** → `MobileNewBoqItemDialog` → `POST /api/boq`
- Tap → `/m/boq/[id]` (BOQ item detail with rates, amounts)

### Work Breakdown Structure (WBS)
**Route:** `/m/wbs`
- WBS tree view (hierarchical)
- **[+ New Node]** → `MobileNewWbsNodeDialog` → `POST /api/wbs/nodes`
- Tap → `/m/wbs/[id]`

### WBS Node Detail
**Route:** `/m/wbs/[id]`
**Source:** `apps/web/src/app/m/wbs/[id]/page.tsx` + `MobileWbsActions.tsx`
- Shows: node info, schedule (planned/actual dates), progress %, critical path flag, children
- **Action buttons** (via `MobileWbsActions`):

| Button | Dialog | API Call |
|--------|--------|---------|
| Edit | `MobileWbsEditDialog` (bottom sheet) | `PATCH /api/wbs/nodes/[id]` |
| Delete | `MobileWbsDeleteConfirm` (confirmation) | `DELETE /api/wbs/nodes/[id]` → redirect to `/m/wbs` |

### Measurement Book (MB)
**Route:** `/m/measurement-book`
- MB entry list
- **[+ New Entry]** → `MobileNewMbEntryDialog` → `POST /api/mb-entries`
- Tap → `/m/measurement-book/[id]`

### MB Entry Detail
**Route:** `/m/measurement-book/[id]`
**Source:** `apps/web/src/app/m/measurement-book/[id]/page.tsx` + `MobileMbActions.tsx`
- Shows: entry info, BOQ items, measured qty, cumulative qty, variance
- **Action buttons** (via `MobileMbActions`):

| Status | Button | Permission | API Call |
|--------|--------|------------|---------|
| DRAFT | Verify | `canVerify` | `PATCH /api/mb-entries/[id]` `{action: "verify"}` |
| DRAFT | Reject | `canVerify` | `PATCH /api/mb-entries/[id]` `{action: "reject", reason}` |
| VERIFIED | Approve | `canApprove` | `PATCH /api/mb-entries/[id]` `{action: "approve"}` |
| VERIFIED | Reject | `canApprove` | `PATCH /api/mb-entries/[id]` `{action: "reject", reason}` |

- Reject shows confirmation modal with reason input
- Uses optimistic updates

### State Machine
```
DRAFT → (verify) → VERIFIED → (approve) → APPROVED
      → (reject) → REJECTED (must create new entry to revise)
```

### Budget Variance
**Route:** `/m/budget-variance`
- Budget variance analysis list
- Tap → `/m/budget-variance/[id]` (budget vs actual analysis)

### Project Control
**Route:** `/m/project-control`
- Earned value management list
- Tap → `/m/project-control/[id]` (CPI, SPI, EAC, EV, PV, AC)

### Standard Consumptions
**Route:** `/m/standard-consumptions`
- Consumption benchmark list (grouped by work type)
- **[+ New]** → `MobileNewStandardConsumptionDialog` → `POST /api/standard-consumptions`
- Tap → `/m/standard-consumptions/[id]` (edit/delete)

### Material Reconciliation
**Route:** `/m/material-reconciliation`
- Required vs issued vs consumed analysis

---

## 18. DPR Multi-Tier Approval Flow

### DPR List
**Route:** `/m/dprs`
- DPR list with approval status filters

### DPR Detail
**Route:** `/m/dprs/[id]`
**Source:** `apps/web/src/app/m/dprs/[id]/page.tsx` + `MobileDprActions.tsx`
- Shows: DPR info, work type, labor, material lines, equipment, variance analysis
- **Action buttons** (via `MobileDprActions`):

| Status | Button | Permission | API Call |
|--------|--------|------------|---------|
| SUBMITTED | Sub-Admin Approve | `dpr.approve_sub_admin` | `PATCH /api/dprs/[id]` `{action: "subAdminApprove"}` |
| SUBMITTED | Reject | `dpr.approve_sub_admin` | `PATCH /api/dprs/[id]` `{action: "reject"}` |
| SUB_ADMIN_APPROVED | Admin Approve | `dpr.approve_admin` | `PATCH /api/dprs/[id]` `{action: "adminApprove"}` |
| SUB_ADMIN_APPROVED | Reject | `dpr.approve_admin` | `PATCH /api/dprs/[id]` `{action: "reject"}` |
| REJECTED | Resubmit | `canResubmit` | `PATCH /api/dprs/[id]` `{action: "resubmit"}` |

- Reject shows confirmation modal
- Uses optimistic updates with haptic feedback

### Variance Analysis
- **[Run Variance]** → `POST /api/dprs/[id]/variance` (with `autoGenerateScrap` + `scrapToLocationId` options)
- Compares actual material lines vs standard consumption benchmarks
- Over-consumption deltas auto-flagged as scrap
- Optionally auto-generates `ScrapGeneration` (with `SCRAP_GENERATED` stock movements at 50% of standard cost)

### State Machine
```
SUBMITTED → (subAdminApprove) → SUB_ADMIN_APPROVED → (adminApprove) → APPROVED
          → (reject) → REJECTED → (resubmit) → SUBMITTED
```

---

## 19. Measurement Book Approval Flow

(See [§17 — Construction Management Flow](#17-construction-management-flow) above)

State machine:
```
DRAFT → (verify) → VERIFIED → (approve) → APPROVED
      → (reject) → REJECTED
```

---

## 20. WBS Node Management Flow

(See [§17 — Construction Management Flow](#17-construction-management-flow) above)

Actions:
- **Edit** → bottom-sheet form → `PATCH /api/wbs/nodes/[id]`
- **Delete** → confirmation modal → `DELETE /api/wbs/nodes/[id]` → redirect to `/m/wbs`

---

## 21. Quality & Safety Flow

### Quality Control
**Route:** `/m/quality-control`
- NCR (Non-Conformance Report) list
- **[+ New NCR]** → `MobileNewNcrDialog` → `POST /api/ncrs`
- Tap NCR → `/m/quality-control/ncr/[id]` (NCR detail with CAPA)

### Safety Management
**Route:** `/m/safety`
- Safety dashboard: hazards, incidents, inspections

### Hazards
**Route:** `/m/safety/hazards`
- Hazard list
- **[+ New]** → `MobileNewHazardDialog` → `POST /api/safety/hazards`
- Tap → `/m/safety/hazards/[id]`

### Incidents
**Route:** `/m/safety/incidents`
- Incident list
- **[+ New]** → `MobileNewIncidentDialog` → `POST /api/safety/incidents`
- Tap → `/m/safety/incidents/[id]`

### Inspections
**Route:** `/m/safety/inspections`
- Inspection list
- **[+ New]** → `MobileNewInspectionDialog` → `POST /api/safety/inspections`
- Tap → `/m/safety/inspections/[id]`

---

## 22. Books / Accounts Flow

### Finance Home
**Route:** `/m/accounts`
- GL overview, receipts summary, payroll summary

### Finance (Expenses & Project Costs)
**Route:** `/m/books/finance`
- Expense list + project cost list
- **[+ New Expense]** → `MobileNewFinanceDialog` → `POST /api/expenses` → `postExpense` GL entry
- **[+ New Project Cost]** → `POST /api/project-costs` → `postProjectCost` GL entry

### Receipts
**Route:** `/m/books/receipts`
- Payment receipt list
- Tap → `/m/books/receipts/[id]` (receipt detail)

### Payroll
**Route:** `/m/books/payroll`
- Payroll processing
- **[Generate Payroll]** → `MobileGeneratePayrollDialog` → `POST /api/payroll`

### Trial Balance (GL)
**Route:** `/m/books/gl`
- Trial balance with drill-down to account ledger
- API: `GET /api/gl/trial-balance`, `GET /api/gl/ledger`, `GET /api/gl/accounts`
- Tally sync panel: sync button, stats, log viewer

### Analytics
**Route:** `/m/books/reports`
- Key financial metrics at a glance

### Expenses
**Route:** `/m/expenses`
- All expenses by category

---

## 23. Reports Hub

**Route:** `/m/reports`
- Central report hub with links to all report pages

### Available Reports
| Report | Route |
|--------|-------|
| Cash Flow Forecast | `/m/reports/cash-flow` |
| Comparative | `/m/reports/comparative` |
| Dept Consumption | `/m/reports/department-consumption` |
| Expenses | `/m/reports/expenses` |
| GST | `/m/reports/gst` |
| Inventory Valuation | `/m/reports/inventory-value` |
| Issue Register | `/m/reports/issue-register` |
| Job Costing | `/m/reports/job-costing` |
| Payroll Expense | `/m/reports/payroll-expense` |
| Pending Payments | `/m/reports/pending-payments` |
| Profit & Loss | `/m/reports/profit` |
| Project Progress | `/m/reports/project-progress` |
| Purchase Register | `/m/reports/purchase-register` |
| Purchase Trends | `/m/reports/purchase-trends` |
| Purchaser Performance | `/m/reports/purchaser-performance` |
| Real Estate Inventory | `/m/reports/real-estate-inventory` |
| Sales Revenue | `/m/reports/sales-revenue` |
| Stock Movement Summary | `/m/reports/stock-movement-summary` |
| TDS Certificates | `/m/reports/tds-certificates` |

Each report page supports date-range filtering, CSV export, and print.

---

## 24. Pulse / Dashboards / Approvals

### Executive Dashboard
**Route:** `/m/pulse`
- Portfolio KPIs, project health, approval counts

### Attention Queue
**Route:** `/m/pulse/attention`
- All alerts in one place (low stock, overdue POs, overdue tasks, expiring permissions, lease expiry)

### Approvals
**Route:** `/m/pulse/approvals`
- POs + requisitions awaiting sign-off
- **[Approve]** / **[Reject]** inline → same API calls as detail pages

### Alerts — Lease Expiry
**Route:** `/m/alerts/lease-expiry`
- Tenancy lease expiry alerts

### Offline Queue
**Route:** `/m/queue`
- Pending sync items & recent actions
- **[Sync Now]** → syncs offline queue

---

## 25. Portal Listings Flow

(See [§15 — Sales & CRM Flow](#15-sales--crm-flow) above)

Actions:
- **Sync** → `POST /api/portal-listings/[id]?action=sync`
- **Delist** → `POST /api/portal-listings/[id]?action=delist` (with confirmation)

---

## 26. Cross-Cutting Behaviors

### RBAC (Role-Based Access Control)
- Server Components call `getUserRole()` + `hasPermission(role, PERM.*)`
- Permission keys in `@/lib/roles.ts` (`PERM.*`)
- Nav items role-gated via `roles` array
- `requirePermission(PERM.X)` in every API route handler → throws `ForbiddenError` → 403

### Soft Deletes
- Master entities (Company, Project, StockLocation, MaterialCategory, Material, Supplier, Customer, LandPurchase, LandParcel, BuiltUnit) have `deletedAt`
- **NEVER hard-delete** — set `deletedAt = now()`
- All queries filter `deletedAt: null` unless explicitly querying archived records

### Audit Logging
- `logAction()` from `@nirman/services` writes immutable `AuditLog` entries
- Wired into EVERY mutation across all services
- Every mutation service function takes optional `userId` and wraps writes in a transaction that includes the `logAction` call

### GL Posting
- `postJournalEntry()` and domain helpers post balanced double-entry `JournalEntry` + `JournalLine` INSIDE the same transaction as the source mutation
- 26 system accounts in `GlAccount`
- Input GST (ITC) debited on purchases; Output GST credited on sales

### Stock Ledger
- **NEVER mutate stock by updating "current stock" column directly**
- Always use `recordMovement()` or `recordTransfer()` — append immutable `StockMovement` AND atomically update `StockLocationItem` (qty + MAC) in one Serializable transaction
- Current stock = `StockLocationItem.qty`; full audit = `StockMovement`

### Moving Average Cost (MAC)
- On receipt: `newMAC = (oldQty×oldMAC + recvQty×recvCost) / (oldQty+recvQty)`
- On issue: MAC unchanged; issue's `unitCost` = current MAC
- Transfers carry source MAC to destination

### Offline Queue
- Mutations queue when offline (`useOfflineQueue` hook)
- Sync badge in header → `/m/queue`
- Auto-syncs when back online

### Optimistic Updates
- `useOptimisticAction` hook — status changes instantly, reverts on error
- Haptic feedback on success/failure
- Used in: PO actions, requisition actions, DPR actions, MB actions, WBS actions

### Company Switching
- Header dropdown (OWNER/ADMIN) or settings switcher
- `POST /api/company/switch` → dispatches `nirman-company-switched` event
- Orbit navigator + inventory tree + all pages refresh

### Proof Capture
- `PhotoCapture` — mandatory photos (camera/upload)
- `SignaturePad` — e-signature
- `GeoTagCapture` — GPS lat/lng + location name
- `GeoFenceStatus` — validates distance vs location geo-radius (Haversine)
- `WeighbridgeFields` — ticket no, gross/tare/net weight
- Used in: PO receive, transfer dispatch/receive, attendance

### Haptic Feedback
- `haptic(ms)` or `haptic([pattern])` on button taps, successes, errors
- Success patterns: `[10, 30, 10]`
- Error patterns: `[50, 20, 50]` or `30`

---

## 27. Complete Page Inventory

### Top-Level Redirects
| Route | Type |
|-------|------|
| `/m` | Redirect → `/m/home` |

### Module Homes (Tab Bar Destinations)
| Route | Tab | Personas |
|-------|-----|----------|
| `/m/home` | Home | executive, ops, sales, finance |
| `/m/inventory` | Inventory | executive, ops, procurement |
| `#search` | Search (overlay) | all (center tab) |
| `/m/hr` | HR | executive, hr |
| `/m/accounts` | Accounts | executive, finance |
| `/m/settings` | More | all |
| `/m/site` | Site | ops, field |
| `/m/dprs` | DPR | field, hr |
| `/m/site/tasks` | Tasks | field |
| `/m/stock` | Stock | procurement, finance |
| `/m/procurement` | POs | procurement |
| `/m/transfers` | Transfers | (not in any persona tab bar — accessible via NavSheet) |
| `/m/sales` | Sales | sales |
| `/m/customers` | Customers | sales |
| `/m/reports` | Reports | finance |
| `/m/attendance` | Attendance | hr |
| `/m/customers` | Customers |
| `/m/reports` | Reports |
| `/m/attendance` | Attendance |

### Dashboards & Attention
| Route | Type |
|-------|------|
| `/m/pulse` | Executive Dashboard |
| `/m/pulse/approvals` | Approvals Queue |
| `/m/pulse/attention` | Attention Queue |
| `/m/queue` | Offline Queue |
| `/m/alerts/lease-expiry` | Lease Expiry Alerts |

### Procurement
| Route | Type |
|-------|------|
| `/m/procurement` | PO List |
| `/m/procurement/new` | New PO Form |
| `/m/procurement/[id]` | PO Detail |
| `/m/requisitions` | Requisition List |
| `/m/requisitions/new` | New Requisition Form |
| `/m/requisitions/[id]` | Requisition Detail |
| `/m/quotations` | Quotation List |
| `/m/quotations/new` | New Quotation Form |
| `/m/quotations/[id]` | Quotation Detail |
| `/m/suppliers` | Supplier List |
| `/m/suppliers/new` | New Supplier Form |
| `/m/suppliers/[id]` | Supplier Detail |
| `/m/rate-contracts` | Rate Contract List |
| `/m/rate-contracts/[id]` | Rate Contract Detail |
| `/m/supplier-returns` | Supplier Return List |
| `/m/supplier-returns/new` | New Supplier Return Form |
| `/m/supplier-returns/[id]` | Supplier Return Detail |

### Stock & Materials
| Route | Type |
|-------|------|
| `/m/materials` | Materials Catalogue |
| `/m/materials/new` | New Material Form |
| `/m/materials/[id]` | Material Detail |
| `/m/materials/[id]/edit` | Edit Material Form |
| `/m/stock` | Stock Ledger |
| `/m/stock/[id]` | Stock Location Detail |
| `/m/stock-locations/new` | New Stock Location Form |
| `/m/stock-counts` | Stock Count List |
| `/m/stock-counts/new` | New Stock Count Form |
| `/m/stock-counts/[id]` | Stock Count Detail |
| `/m/transfers` | Transfer List |
| `/m/transfers/new` | New Transfer Form |
| `/m/transfers/[id]` | Transfer Detail |
| `/m/scrap-generations` | Scrap Generation List |
| `/m/scrap-generations/new` | New Scrap Generation Form |
| `/m/scrap-generations/[id]` | Scrap Generation Detail |
| `/m/material-sales` | Material Sale List |
| `/m/material-sales/new` | New Material Sale Form |
| `/m/material-sales/[id]` | Material Sale Detail |
| `/m/gate-pass` | Gate Pass |
| `/m/vehicles` | Vehicles |
| `/m/equipment` | Equipment List |
| `/m/equipment/new` | New Equipment Form |
| `/m/equipment/[id]` | Equipment Detail |
| `/m/stock-out` | Stock Out (quick issue from stock ledger) |
| `/m/sms` | SMS Ingest (parse vendor SMS into entities) |

### Site / Field
| Route | Type |
|-------|------|
| `/m/site` | Field Dashboard |
| `/m/site/issue` | Quick Issue Form |
| `/m/site/receive` | Receive Stock |
| `/m/site/dpr` | New DPR Form |
| `/m/site/attendance` | Mark Attendance |
| `/m/site/tasks` | My Tasks |
| `/m/site/stock` | Site Stock |
| `/m/site/field` | Field Notes |
| `/m/site/me` | Supervisor Profile |

### HR
| Route | Type |
|-------|------|
| `/m/hr` | HR Home |
| `/m/hr/employees` | Employee List |
| `/m/hr/employees/[id]` | Employee Detail |
| `/m/hr/leaves` | Leaves |
| `/m/attendance` | Attendance Summary |
| `/m/dprs` | DPR List |
| `/m/dprs/[id]` | DPR Detail |

### Real Estate
| Route | Type |
|-------|------|
| `/m/projects` | Project List |
| `/m/projects/[id]` | Project Detail |
| `/m/units` | Built Unit List |
| `/m/units/[id]` | Built Unit Detail |
| `/m/land` | Land & Parcels List |
| `/m/land/[id]` | Land Detail |
| `/m/customers` | Customer List |
| `/m/customers/new` | New Customer Form |
| `/m/customers/[id]` | Customer Detail |
| `/m/leads` | Lead List |
| `/m/leads/[id]` | Lead Detail |
| `/m/sales` | Sales List |
| `/m/sales/new` | New Sale Form |
| `/m/sales/[id]` | Sale Detail |
| `/m/rentals` | Rentals List |
| `/m/rentals/[id]` | Rental Detail |
| `/m/portal-listings` | Portal Listing List |
| `/m/portal-listings/new` | New Portal Listing Form |
| `/m/portal-listings/[id]` | Portal Listing Detail |
| `/m/work-orders` | Work Order List |
| `/m/work-orders/[id]` | Work Order Detail |
| `/m/subcontractors` | Subcontractor List |
| `/m/subcontractors/[id]` | Subcontractor Detail |
| `/m/change-orders` | Change Order List |
| `/m/change-orders/[id]` | Change Order Detail |
| `/m/permissions` | Permissions & Legal |
| `/m/rent` | Rent |

### Construction
| Route | Type |
|-------|------|
| `/m/boq` | BOQ List |
| `/m/boq/[id]` | BOQ Detail |
| `/m/wbs` | WBS Tree |
| `/m/wbs/[id]` | WBS Node Detail |
| `/m/measurement-book` | MB Entry List |
| `/m/measurement-book/[id]` | MB Entry Detail |
| `/m/budget-variance` | Budget Variance List |
| `/m/budget-variance/[id]` | Budget Variance Detail |
| `/m/project-control` | Project Control List |
| `/m/project-control/[id]` | Project Control Detail |
| `/m/standard-consumptions` | Standard Consumption List |
| `/m/standard-consumptions/[id]` | Standard Consumption Detail |
| `/m/material-reconciliation` | Material Reconciliation |

### Quality & Safety
| Route | Type |
|-------|------|
| `/m/quality-control` | Quality Control Home |
| `/m/quality-control/ncr/[id]` | NCR Detail |
| `/m/safety` | Safety Home |
| `/m/safety/hazards/[id]` | Hazard Detail |
| `/m/safety/incidents/[id]` | Incident Detail |
| `/m/safety/inspections/[id]` | Inspection Detail |

### Books / Accounts
| Route | Type |
|-------|------|
| `/m/books` | Books Home |
| `/m/books/finance` | Finance (Expenses & Project Costs) |
| `/m/books/receipts` | Receipts List |
| `/m/books/receipts/[id]` | Receipt Detail |
| `/m/books/payroll` | Payroll |
| `/m/books/gl` | Trial Balance (GL) |
| `/m/books/reports` | Analytics |
| `/m/expenses` | Expenses |

### Reports (19 pages)
| Route | Report |
|-------|--------|
| `/m/reports` | Reports Hub |
| `/m/reports/cash-flow` | Cash Flow Forecast |
| `/m/reports/comparative` | Comparative |
| `/m/reports/department-consumption` | Dept Consumption |
| `/m/reports/expenses` | Expenses |
| `/m/reports/gst` | GST |
| `/m/reports/inventory-value` | Inventory Valuation |
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

### Settings
| Route | Type |
|-------|------|
| `/m/settings` | Settings & Portfolio Hub |
| `/m/settings/company` | Company Details |
| `/m/settings/team` | Team & Permissions |
| `/m/settings/export` | Bulk Export |
| `/m/settings/notifications` | Notifications |
| `/m/me` | My Profile |

---

## Action Component Reference

| Component | Source | Used By |
|-----------|--------|---------|
| `MobilePoActions` | `components/mobile/mobile-po-actions.tsx` | PO Detail |
| `MobileRequisitionActions` | `components/mobile/mobile-requisition-actions.tsx` | Requisition Detail |
| `MobileDetailActions` | `components/mobile/mobile-detail-actions.tsx` | Generic (supplier-returns, stock-counts, material-sales) |
| `MobileDprActions` | `app/m/dprs/[id]/MobileDprActions.tsx` | DPR Detail |
| `MobileMbActions` | `app/m/measurement-book/[id]/MobileMbActions.tsx` | MB Entry Detail |
| `MobileWbsActions` | `app/m/wbs/[id]/MobileWbsActions.tsx` | WBS Node Detail |
| `MobilePortalListingActions` | `app/m/portal-listings/[id]/MobilePortalListingActions.tsx` | Portal Listing Detail |
| `MobileReceiveDialog` | `app/m/procurement/[id]/MobileReceiveDialog.tsx` | PO Detail, Site Receive |
| `MobileTransferDispatchDialog` | `app/m/transfers/[id]/MobileTransferReceiveDialog.tsx` | Transfer Detail |
| `MobileTransferReceiveDialog` | `app/m/transfers/[id]/MobileTransferReceiveDialog.tsx` | Transfer Detail |
| `MobileIssueForm` | `app/m/site/issue/MobileIssueForm.tsx` | Site Quick Issue |
| `MobileDprForm` | `components/mobile/mobile-dpr-form.tsx` | Site Submit DPR |
| `MobileAttendanceForm` | `components/mobile/mobile-attendance-form.tsx` | Site Mark Attendance |
| `MobileNewSaleForm` | `components/mobile/mobile-new-sale-form.tsx` | New Sale |
| `MobileCustomerForm` | `components/mobile/mobile-customer-form.tsx` | New/Edit Customer |

---

*End of document.*
