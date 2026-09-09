# Persona Audit: Yash Saxena — SITE_ENGINEER (SRG REALCON)

**Role:** SITE_ENGINEER · **Persona:** `field` · **Phone:** 7302920205 · **Reports to:** Anurag (PROJECT_DIRECTOR)  
**Platform:** Mobile app (`/m/*` routes)  
**Date of audit:** 2025

---

## Journey Narrative

I'm Yash, a site engineer at SRG REALCON. I open the Nirman Inventory OS app on my phone. My role (`SITE_ENGINEER`) maps to the **`field`** persona (`apps/web/src/lib/mobile-nav-v2.ts:68-71`). I need to check in attendance, submit a DPR, raise a material requisition, issue materials, record an MB entry, create a gate pass, report a safety incident, update task status, and check my home page. Here's my step-by-step journey through the actual codebase.

---

## Step 1 — Mobile Home Page (`/m/home`)

### What I see

**File:** `apps/web/src/app/m/home/page.tsx` → `adaptive-home.tsx` → `home-tree.tsx` + `persona-dashboard.tsx`

1. `/m` redirects to `/m/home` (`apps/web/src/app/m/page.tsx:14`).
2. The home page is **adaptive**: on high-tier devices it skips SSR and fetches `/api/mobile/home` client-side; on low/mid-tier it does full SSR (`page.tsx:42-49`).
3. **HomeTree** (`home-tree.tsx`): A file-system tree at the top with:
   - A greeting ("Good morning, Yash") with today's date (hydration-safe via `useHydratedDate`).
   - A **Briefing** folder (expandable) showing: Approvals count, Low stock, Deliveries today, Payments overdue — fetched from `/api/briefing` (`home-tree.tsx:107-123`). Each leaf links to the relevant page (e.g. `/m/pulse/approvals`, `/m/inventory`).
   - A **Recent** folder showing recently viewed entities (DPRs, projects, materials, etc.) from `useRecentItems()` — tap to navigate back.
   - A refresh button to re-fetch the briefing.
   - If nothing is pending: "All caught up!" message.
4. **Self-check-in widget** (`adaptive-home.tsx:73-85`): Only shown if I have an Employee record linked to my user (`page.tsx:148-154`). Shows a big "Check In" button (see Step 2).
5. **PersonaHomeDashboard** (`persona-dashboard.tsx`): Since I'm `field` persona (not `executive`), I see:
   - A persona header card: "Site · SRG REALCON · Field operations & reporting" (`persona-dashboard.tsx:115-127`).
   - **QuickActionsBar** with the `SITE_QUICK_ACTIONS` catalog (`quick-action-catalogs.ts:151-180`): two tabs — "Daily" (Quick Issue, Receive Stock, Submit DPR, Attendance, Tasks, Scrap Log, Site Stock, Field) and "Site Ops" (Projects, Work Orders, Safety, MB, Stock Out, All DPRs). These are drag-to-reorder and persisted via `/api/me/quick-actions-context?module=site`.
   - **Cross-module links** (`persona-dashboard.tsx:121-127`): Gate Pass (`/m/gate-pass`), HR / Leaves (`/m/hr/leaves`), Procurement (`/m/procurement`), Expenses (`/m/accounts?tab=expenses`).

### What works

- The home page is well-structured for a field engineer: briefing → check-in → quick actions → cross-module links.
- Quick actions cover all my primary tasks (DPR, attendance, tasks, safety, receive, issue, MB).
- The briefing auto-retries once after 2s if the first fetch fails (`home-tree.tsx:131-136`).
- Recent items carousel lets me jump back to what I was working on.
- The self-check-in widget is gated by `roleTier(role) >= 4` — SITE_ENGINEER is tier 4+, so I get it (`page.tsx:148`).

### What's broken / missing

- **No "My Tasks" count on home**: The briefing shows approvals/low-stock/deliveries/payments but NOT my open task count. A site engineer's #1 daily priority is often their task list, but it's not surfaced on the home briefing. The `/api/briefing` endpoint doesn't include task counts.
- **No "Today's DPR status" on home**: I can't see at a glance whether I've already submitted today's DPR without navigating to the DPR list. The self-check-in widget shows attendance status but there's no equivalent DPR status indicator.
- **No "Pending indents from me" on home**: If I raised indents that are pending approval, I don't see that on the home briefing.

### What's confusing

- The **HomeTree** file-system tree metaphor (`home-tree.tsx`) with connector lines and chevrons is visually dense for a mobile screen. The tree rows are only 24px tall (`home-tree.tsx:446`), which is below the 44px minimum touch target guideline. Tapping the tiny chevron or the narrow name link could be difficult with a thumb.
- The briefing sub-text (e.g. "3 PO · 2 indent · 1 DPR") is truncated with `max-w-[35%]` (`home-tree.tsx:536`), so on narrow screens the detail is cut off.
- There are **two greeting headers**: one in `HomeTree` (`home-tree.tsx:204-223`) and one in `HomeTopSection`/`GreetingHeader` (`home-client.tsx:109-150`). But `HomeTopSection` is not actually rendered in the current `adaptive-home.tsx` — only `HomeTree` is used. The `HomeTopSection` and `GreetingHeader` components appear to be dead code.

### India-specific gaps

- **No weather auto-fill from Indian weather API**: The DPR form has a weather field but it's manual. Indian construction sites would benefit from auto-populating weather (monsoon season affects work).
- **No Hindi/local language toggle**: The entire UI is English-only. Many site workers in India prefer Hindi or regional languages.

---

## Step 2 — Attendance Check-in (GPS Geofence)

### What I see

**Files:** `apps/web/src/components/mobile/mobile-self-check-in.tsx` (widget on home) · `apps/web/src/app/m/attendance/page.tsx` (list) · `apps/web/src/app/m/site/attendance/page.tsx` (manager form)

1. On the home page, the **MobileSelfCheckIn** widget (`mobile-self-check-in.tsx`) shows:
   - **Not checked in:** A full-width "Check In" button (min-height 56px, primary color).
   - **Checked in:** A green card "Checked in · 09:15 · Yash Saxena" with geofence status ("At site" or "Outside site geofence (Xm away)") + a "Check Out" button (red-tinted).
   - **Checked out:** A green "Day complete" card showing check-in → check-out time + hours worked.
2. Tapping "Check In" calls `navigator.geolocation.getCurrentPosition()` with `enableHighAccuracy: true, timeout: 10000` (`mobile-self-check-in.tsx:42-47`), then POSTs to `/api/attendance/self-check-in` with `employeeId`, `date`, `checkInLat`, `checkInLng`.
3. The API (`apps/web/src/app/api/attendance/self-check-in/route.ts`) validates the employee belongs to the company, checks if the user is the employee themselves (or a manager), then does **geofence validation**: looks up `employee.reportingLocation.lat/lng/geoRadius`, computes haversine distance, and returns `geoFenceOk` + `geoFenceDistance` + `reportingLocation` name (`route.ts:70-83`). Default radius is 500m if not configured (`route.ts:80`).
4. The **attendance list** page (`/m/attendance`) shows the last 30 days of attendance with traffic-light tiers (RED = absent, YELLOW = present + DPR pending, GREEN = present + DPR approved). It has search, status filter chips (Present, Late, Absent, Half Day, Leave, PL, NPL), date filter, and project filter. The "Check in now" CTA links to `/m/site/attendance` but **only shows for users with HR_MANAGE permission** (`attendance/page.tsx:70-76`) — as a SITE_ENGINEER I won't see it.
5. The **site attendance form** (`/m/site/attendance`) requires `HR_MANAGE` permission (`site/attendance/page.tsx:38-40`) — so as a SITE_ENGINEER I get a "No Access" screen. This is the manager form for logging worker attendance.

### What works

- **Self-check-in is fully wired end-to-end**: GPS capture → API → geofence validation → `recordAttendance()` service → response with geofence status. The UI shows clear feedback (green card, distance warning).
- Check-out also captures GPS and posts to `/api/attendance/self-check-out`.
- The geofence uses haversine distance — mathematically correct.
- The attendance list has excellent filtering (status chips, date, project) and the traffic-light tier system is a smart India-specific feature (ties attendance to DPR submission).
- Error handling: if GPS fails, shows "Could not get your location. Please enable GPS and try again." (`mobile-self-check-in.tsx:81`).

### What's broken / missing

- **No GPS accuracy display**: The check-in captures GPS but doesn't show the accuracy radius (`position.coords.accuracy`). On Indian sites with poor GPS (dense buildings, no open sky), accuracy could be 50-100m+, which could cause false geofence violations. The user has no way to see if their GPS fix is reliable.
- **No fallback for GPS denial**: If the user denies location permission, the only feedback is the generic error message. There's no manual check-in fallback (e.g., "Check in without GPS — manager will verify").
- **No offline check-in**: If the site has no network (common in rural Indian sites), the check-in POST will fail. There's no offline queue for attendance (unlike requisitions which use `useOfflineQueue`). The check-in widget doesn't use the offline queue pattern.
- **No check-in time window enforcement**: Indian construction sites typically have a check-in window (e.g., 8:00-10:00 AM). There's no late check-in warning or auto-marking as "Late" based on check-in time. The status is hardcoded to "PRESENT" (`route.ts:91`).
- **Self-check-in widget doesn't refresh after check-in**: After a successful check-in, the widget updates local state (`setCheckedIn(true)`) but doesn't trigger a home page data refresh. If I navigate away and come back, the SSR data might be stale (though the adaptive fetcher caches for 30s).

### What's confusing

- **Two attendance pages with different purposes**: `/m/attendance` (list, view-only for me) vs `/m/site/attendance` (manager form, no access for me). The "Check in now" CTA on the list page links to the manager form, but it's hidden from me. So as a SITE_ENGINEER, the list page has no check-in action — I can only check in via the home widget. This is documented in the code (`attendance/page.tsx:18-22`) but not obvious to the user.
- The attendance list records are **not tappable** (`MobileAttendanceList.tsx:66-69` — "Attendance records are not tappable — there is no mobile attendance detail page"). So if I want to see details of a specific attendance record, I can't.

### India-specific gaps

- **No geo-tagged photo for check-in**: Indian labour compliance often requires a selfie/photo at check-in. The widget captures GPS but no photo.
- **No biometric/Aadhaar integration**: Not expected for MVP, but many Indian construction apps use Aadhaar-based attendance for workers.
- **No shift/crew-based attendance**: The self-check-in is individual. Indian sites often have crew-based (gang) attendance where a supervisor marks 20 workers present at once — that's the `/m/site/attendance` form, but it requires HR_MANAGE.

---

## Step 3 — Submit Daily Progress Report (DPR)

### What I see

**Files:** `apps/web/src/app/m/dprs/page.tsx` (list) · `apps/web/src/app/m/dprs/[id]/page.tsx` (detail) · `apps/web/src/app/m/site/dpr/page.tsx` (form) · `apps/web/src/components/mobile/mobile-dpr-form.tsx` (form component)

1. **DPR list** (`/m/dprs`): Shows last 40 DPRs, date-grouped (Today, Yesterday, date). Each DPR strip has a colored left edge (by status), project name, submitter, work type, progress bar, 3-dot approval stepper (Submit → Sub-Admin → Admin), and a circular progress ring. Swipe left on submitted DPRs to approve/reject (if I have permission). Has search + status filter chips + export/share. A FAB (+) opens the DPR form inline if I have `DPR_SUBMIT` permission.
2. **DPR form** (`/m/site/dpr` or FAB modal): A comprehensive form with:
   - **Project selector** with GPS auto-select: uses `useNearestProject()` to find the nearest project and auto-select it with a toast ("Auto-selected Hillview (120m away)").
   - **Smart defaults**: pre-fills last-used project, work type, weather via `useSmartDefaults("dpr")`.
   - **Draft auto-save**: form state is auto-saved to localStorage via `useDrafts("dpr", "dpr:{date}")` with a draft restore banner.
   - **Work details**: date, work type (enum), work qty + unit, weather, work summary (required), progress %, blockers, tomorrow's plan, notes.
   - **Material lines**: searchable material picker (`SearchableMaterialPicker`), qty, unit cost. Can add/remove lines.
   - **Labor lines**: employee or crew selector, hours worked, task description. Can add/remove lines.
   - **"Repeat yesterday"** button: copies material + labor lines from yesterday's DPR for the same project.
   - **"Pull today's attendance"** button: fetches `/api/attendance?date={date}&projectId={project}` and auto-creates labor lines from checked-in workers.
   - **OCR scan** button: takes the first photo, sends to `/api/ocr/dpr`, and auto-fills work type, qty, notes, progress, material lines, labor lines from the OCR result.
   - **Photo uploader**: `PhotoUploader` for site photos.
   - **Submit**: POSTs to `/api/dprs` with all fields. On success, haptic feedback + toast + redirect.
3. **DPR detail** (`/m/dprs/[id]`): Shows the full report — header banner with date/project/status/progress ring, work summary, blockers (alert banner), tomorrow's plan, site photos grid, materials + labor two-column tables with totals, variance analysis button, approval trail stepper, and action buttons (approve/reject/resubmit based on permissions). Has a print button (`/api/dprs/{id}/print`).

### What works

- **The DPR form is the most feature-rich form in the app**. It's fully wired: GPS auto-select, smart defaults, draft auto-save, repeat yesterday, pull attendance, OCR scan, photo upload — all functional.
- The API (`/api/dprs` POST) validates with `dprSchema`, calls `submitDPR()` service, and revalidates paths (`route.ts:117-119`).
- The list has cursor pagination (40 per batch) with "Load More".
- The detail page shows a beautiful approval trail with a horizontal stepper.
- Swipe-to-approve on the list is a nice mobile-native touch.
- The "Pull today's attendance" feature is excellent for Indian sites — auto-fills labor lines from checked-in workers, auto-fills task description with the worker's trade (`mobile-dpr-form.tsx:463-470`).

### What's broken / missing

- **OCR requires a photo first**: The OCR button is disabled until at least one photo is added, but the button placement isn't near the photo uploader — it's a separate "Scan" action. The UX flow is: add photo → tap Scan → wait → review auto-filled data. If OCR fails, the user falls back to manual entry. The OCR endpoint (`/api/ocr/dpr`) is called but I didn't verify its implementation — if it's a stub, the button would fail with a confusing error.
- **No "Save as Draft" on the DPR itself**: The form auto-saves to localStorage, but there's no server-side draft state. The DPR is either submitted (POST) or not. If I close the app, the localStorage draft persists, but there's no way to save a partial DPR to the server and finish later from another device.
- **No photo geo-tagging**: The `PhotoUploader` captures photos but doesn't embed GPS coordinates in the EXIF or attach location metadata. For Indian construction compliance, photos should be geo-tagged to prove they were taken on-site.
- **No voice notes**: The DPR form has text fields for work summary, blockers, tomorrow's plan, notes — but no voice-to-text option. On a noisy construction site, typing is hard; voice input would be valuable.
- **Progress % is manual**: There's no auto-calculation of progress from MB entries or BOQ completion. The user enters a number manually, which could be inconsistent.

### What's confusing

- **Two ways to access the DPR form**: `/m/site/dpr` (standalone page) and the FAB on `/m/dprs` (inline modal). Both render the same `MobileDprForm` component. The standalone page has a "Submit Daily Progress Report" header with a "Site" badge; the FAB modal doesn't. This is fine but could confuse users who see slightly different chrome.
- **The form is very long**: Project, date, work type, qty, unit, weather, summary, progress, blockers, tomorrow, notes, material lines, labor lines, photos — all on one scrollable page. On a phone, this is a lot of scrolling. There's no wizard/step progression. The `SectionCard` components help visually, but it's still a long form.
- **"Repeat yesterday" and "Pull attendance" are both labor-related but in different sections**: Repeat yesterday is a button at the top of the form area, pull attendance is a separate button. Their relationship (both fill labor/material lines) isn't visually grouped.

### India-specific gaps

- **No IS 1200 measurement standard integration**: The DPR's work type + qty + unit is freeform. Indian construction measurement standards (IS 1200) define standard measurement methods for each type of work. The form doesn't reference IS 1200 item codes or standard units.
- **No weather auto-fill**: Weather is manual. Could auto-populate from an Indian weather API based on site GPS location.
- **No Hindi voice input**: Voice notes (if added) would need Hindi/regional language support for Indian site workers.

---

## Step 4 — Raise Material Requisition (Indent)

### What I see

**Files:** `apps/web/src/app/m/requisitions/page.tsx` (redirects) · `apps/web/src/app/m/requisitions/new/page.tsx` (form) · `apps/web/src/app/m/requisitions/new/MobileNewRequisitionClient.tsx` (form client) · `apps/web/src/app/m/procurement/page.tsx` (unified hub)

1. `/m/requisitions` **redirects to `/m/procurement?tab=indents`** (`requisitions/page.tsx:8`). Requisitions are now a tab within the unified procurement hub.
2. The **procurement hub** (`/m/procurement`) is a tabbed page with: Indents, Quotations, POs, Returns. The Indents tab shows a list of requisitions with status, project, line count, quote count, and a FAB to create a new indent.
3. The **new requisition form** (`/m/requisitions/new`) is a standalone page with:
   - **Project selector** (required) with create-on-the-fly (`MobileSelectWithCreate` — can create a new project inline).
   - **Needed by date** (date picker).
   - **Material lines**: material selector (with create-on-the-fly), qty, preferred supplier, line notes. Can add/remove lines.
   - **Indent notes** (textarea).
   - **Smart defaults**: pre-fills last-used project.
   - **Draft auto-save**: via `useDrafts("requisition", "requisition-new")` with draft restore banner.
   - **Offline queue**: if offline, enqueues the requisition for later sync via `useOfflineQueue` (`MobileNewRequisitionClient.tsx:147-160`).
   - **Submit**: POSTs to `/api/requisitions`. On success, redirects to the requisition detail or the indents list.
4. The submit button has a **long-press gesture**: long-press navigates to the indents list instead of submitting (`useLongPressNav`).

### What works

- **Fully wired end-to-end**: form → `/api/requisitions` POST → redirect. Offline queue works for no-network scenarios.
- Smart defaults + draft auto-save + offline queue = excellent for field use.
- Create-on-the-fly for projects and materials means I'm never blocked by missing master data.
- The form validates: project required, at least one material with qty > 0.

### What's broken / missing

- **No "needed by" urgency indicator**: The form has a date field but no urgency level (urgent/normal/low). Indian site engineers often need to flag urgency for procurement priority.
- **No material stock check**: When selecting a material, the form doesn't show current stock at the site store. I might request material that's already in stock. The material list comes from `prisma.material.findMany` without stock info (`requisitions/new/page.tsx:19-23`).
- **No quantity unit display in the line**: The material selector shows `${m.name} (${m.code})` but not the unit. The unit only appears next to the qty input after selection (`MobileNewRequisitionClient.tsx:320-322`). If I'm requesting cement, I need to know if the unit is "bags" or "kg" before entering qty.
- **No preferred supplier stock/price info**: The preferred supplier selector is just a name dropdown — no lead time, no last price, no rating.

### What's confusing

- **The redirect from `/m/requisitions` to `/m/procurement?tab=indents`**: If I bookmark or remember `/m/requisitions`, I get redirected. The URL changes, which could be disorienting. There's no "you've been redirected" message.
- **The long-press submit gesture** (`MobileNewRequisitionClient.tsx:396-398`): Long-pressing the submit button navigates to the indents list instead of submitting. This is a non-standard pattern that could confuse users who accidentally long-press and wonder why their form didn't submit. There's no visual indication that long-press does something different.

### India-specific gaps

- **No HSN/GST display**: The material selector doesn't show HSN codes or GST rates, which matter for procurement in India (input tax credit).
- **No supplier GSTIN check**: When selecting a preferred supplier, there's no indication of whether the supplier has a valid GSTIN.

---

## Step 5 — Issue Materials from Site Stock

### What I see

**Files:** `apps/web/src/app/m/material-issues/page.tsx` (list) · `apps/web/src/app/m/material-issues/[id]/page.tsx` (detail) · `apps/web/src/app/m/material-issues/[id]/MobileMaterialIssueDetailClient.tsx` (detail client) · `apps/web/src/app/m/stock-out/page.tsx` (unified form) · `apps/web/src/app/m/site/issue/page.tsx` (redirects)

1. `/m/site/issue` **redirects to `/m/stock-out?mode=issue`** (`site/issue/page.tsx:8`). The separate issue form has been merged into the unified stock-out page.
2. **Stock-out page** (`/m/stock-out`): A segmented control switches between "Transfer to Location" and "Issue to Project". Permission-gated: needs `STOCK_TRANSFER` or `STOCK_ISSUE`. The form has source location, material lines, and destination (project for issue mode, location for transfer mode).
3. **Material issues list** (`/m/material-issues`): Shows last 40 issues with issue number, target (project/department), date, status, total value. Has a summary card (total issued value + pending count). Cursor pagination with "Load More".
4. **Material issue detail** (`/m/material-issues/[id]`): Shows a hero card with issue number/date/status, a pipeline stepper (Pending → Completed → Cancelled), line items with material code/qty/unit cost/line total, details (from location, project, department, built unit, subcontractor, phase, issued by), receiver & transport info, notes, and action buttons:
   - **Print Slip** (opens `/print/issue/{id}` in new tab).
   - **Execute Issue** (if status is PENDING and I have `STOCK_ISSUE` permission) — POSTs to `/api/issue-materials` with `action: "execute"`. This moves stock.
   - **Cancel Issue** (if status is COMPLETED and I have `STOCK_ISSUE`) — POSTs to `/api/issue-materials/{id}` with `action: "cancel"`. Reverses stock + GL entries.
5. The detail page also shows an `AttachmentList` for the material issue.

### What works

- **Execute Issue is fully wired**: `handleExecute()` POSTs to `/api/issue-materials` PATCH with `action: "execute"` → moves stock via `recordMovement()` → toast "Material issue executed — stock moved" → `router.refresh()` (`MobileMaterialIssueDetailClient.tsx:113-130`).
- **Cancel Issue is fully wired**: confirmation dialog → PATCH with `action: "cancel"` → reverses stock + GL.
- The pipeline stepper clearly shows the lifecycle (Pending → Completed → Cancelled).
- Print slip opens in a new tab for physical printing.
- The list has a summary card with total issued value — useful for tracking consumption.

### What's broken / missing

- **No "Create Issue" button on the list page**: The material issues list (`/m/material-issues`) has no FAB or CTA to create a new issue. To create one, I need to go to `/m/stock-out?mode=issue`. There's no visible link from the list to the creation form. This is a dead end for a user who lands on the list and wants to create a new issue.
- **No stock availability check in the form**: The stock-out form doesn't show available stock at the source location before issuing. I could try to issue 100 bags of cement when only 50 are in stock, and the API would reject it with an error — but I wouldn't know until submit.
- **No receiver signature capture**: Indian construction sites often require a receiver signature on material issue slips. The form has `receiverName` and `receiverMobile` fields but no signature capture.

### What's confusing

- **Three routes for the same concept**: `/m/site/issue` (redirect), `/m/stock-out?mode=issue` (form), `/m/material-issues` (list). A user might not know which one to use. The quick action "Quick Issue" links to `/m/stock-out?mode=issue`, which is correct, but the list page has no creation link.
- **The "Execute Issue" terminology**: The button says "Execute Issue" but the action is really "Confirm and move stock". "Execute" could be confused with "execute a task" or "execute a person". "Confirm Issue" or "Process Issue" might be clearer.

### India-specific gaps

- **No GST-inclusive/exclusive display**: The line items show unit cost and line total but don't indicate whether the cost includes GST. For Indian construction accounting, this distinction matters.
- **No e-way bill integration**: Material movement out of the gate may require an e-way bill (for GST compliance if value > ₹50,000). There's no link between material issues and e-way bill generation.

---

## Step 6 — Record Measurement Book (MB) Entry

### What I see

**Files:** `apps/web/src/app/m/measurement-book/page.tsx` (list) · `apps/web/src/app/m/measurement-book/MobileNewMbEntryDialog.tsx` (form) · `apps/web/src/app/m/measurement-book/[id]/` (detail)

1. The MB page is **project-scoped**: I must select a project first (`MobileProjectScopedPage`). If no project is selected, I see a project selector + "Select a project" empty state.
2. After selecting a project, I see:
   - **4 stat cards**: Entries count, Total Measured qty, Earned Value (₹), BOQ Items count.
   - **Entry list**: Each entry card shows MB number, BOQ serial no, BOQ description, measured qty + unit, rate, amount, date, description, measured-by name, status. Tappable → detail page.
   - **FAB (+)**: Opens the new MB entry dialog (only if I have `MB_VERIFY` permission AND the project has BOQ items).
3. **New MB entry form** (`MobileNewMbEntryDialog`): A bottom-sheet dialog with:
   - **BOQ Line Item** selector (required) — shows `${serialNo} — ${description} (${unit})`.
   - **WBS Activity** selector (optional) — auto-suggests the WBS node linked to the selected BOQ item (`onBoqItemChange` auto-fills). Shows a hint: "Auto-linked from BOQ item. Progress will update on approval."
   - **Measured Qty** (required, number) + **Unit** (read-only, from BOQ item).
   - **Description** (required) — e.g. "PCC for foundation, 1st floor slab casting".
   - **Location Reference** (optional) — e.g. "Grid A-3, Wing B, Plot 7".
   - **Submit**: POSTs to `/api/mb-entries` with projectId, boqItemId, wbsNodeId, measuredQty, description, locationRef.
4. If the project has no BOQ items, the empty state says "Add BOQ line items first, then measure work against them" with a CTA to `/m/boq?project={id}`.

### What works

- **Fully wired**: form → `/api/mb-entries` POST → toast → `router.refresh()`. The API exists (`apps/web/src/app/api/mb-entries/route.ts`).
- **BOQ → WBS auto-linking**: When I select a BOQ item, the form auto-suggests the linked WBS node. If no WBS node is linked, it warns: "This BOQ item isn't linked to any WBS activity."
- **Project-scoped**: Forces project selection first, which prevents cross-project data entry errors.
- **Earned value calculation**: The list shows total measured qty × BOQ rate = earned value, which is the core of MB accounting.
- The unit is auto-displayed from the BOQ item — no manual unit entry needed.

### What's broken / missing

- **No measurement detail/dimensions**: The form only captures a single "measuredQty" number. Indian MB entries (per IS 1200) typically record detailed dimensions: length × breadth × height/depth = quantity. For example, a concrete slab would be L=5.0m × B=3.0m × D=0.15m = 2.25 cum. The form has no dimension fields — just the final quantity. This is a significant gap for proper MB accounting.
- **No cumulative/previous measurement display**: When recording a new measurement, the form doesn't show the previous cumulative measurement for the same BOQ item. Indian MB books always show "previous measurement" and "this measurement" to calculate the incremental quantity. Without this, I could double-count work.
- **No MB entry detail page content**: The `/m/measurement-book/[id]/` directory exists but I didn't read its page.tsx — it may or may not be fully implemented.
- **No approval workflow on mobile**: The MB entry has a `status` field (shown in the list), but the mobile form doesn't show or interact with the approval workflow (DRAFT → SUBMITTED → VERIFIED → APPROVED). The FAB only shows if I have `MB_VERIFY` permission, but the form doesn't have a "Submit for Verification" action.

### What's confusing

- **Permission gating is `MB_VERIFY` for creation**: The FAB shows only if I have `MB_VERIFY` permission (`page.tsx:69, 128`). As a SITE_ENGINEER, I might have `MB_CREATE` but not `MB_VERIFY` — in which case I can't create MB entries from this page. The permission check uses `MB_VERIFY` for both creating and verifying, which conflates two different roles.
- **"Location Reference" is free-text**: No GPS capture or map pin. For Indian sites, location references like "Grid A-3" are standard, but a GPS-tagged location would add verification value.

### India-specific gaps

- **No IS 1200 compliance**: As noted above, the form doesn't follow IS 1200 measurement patterns (dimension-based quantity calculation, standard units per work type, deduction rules for openings/voids).
- **No MB serial number format**: Indian MB books have a specific serial number format (MB-001, page 1, item 3). The `mbNumber` field exists but its format isn't validated or auto-generated per Indian conventions.
- **No joint measurement signature**: Indian MB entries require joint measurement by the contractor and consultant/client. The form has `measuredBy` but no second-party verification field.

---

## Step 7 — Create Gate Pass

### What I see

**Files:** `apps/web/src/app/m/gate-pass/page.tsx` (list) · `apps/web/src/app/m/gate-pass/MobileGatePassList.tsx` (list + form dialog)

1. The gate pass page shows:
   - A title "Gate Pass" with subtitle "Items cannot leave the gate until approved".
   - **4 stat cards**: Pending, Approved, Exited, Rejected counts.
   - **Create button** (if I have `GATE_PASS_CREATE`): Opens `MobileGatePassFormDialog`.
   - **Gate pass list**: Each pass is an expandable card showing GP number, status badge, item count, location, vehicle number + driver. Expanded view shows: category badge, item list (material name + qty + unit), rejection reason (if rejected), approval notes, exit notes, transport details (destination, purpose, vehicle type, transporter, driver phone with `tel:` link), timeline (created/submitted/approved/exited by + date), and action buttons:
     - **Print** (opens `/print/gate-pass/{id}`).
     - **Submit** (DRAFT → PENDING).
     - **Approve / Reject** (PENDING → APPROVED/REJECTED, reject requires reason dialog).
     - **Confirm Exit** (APPROVED → EXITED, with exit notes + exit photos dialog — photograph the loaded vehicle).
     - **Resubmit** (REJECTED → PENDING).
     - **Cancel** (DRAFT/PENDING → CANCELLED, with confirmation dialog).
   - Search by GP number, vehicle, driver, destination.
   - Cursor pagination with "Load More".
2. **Create form** (`MobileGatePassFormDialog`): Fields for location, project, destination, purpose, vehicle number, vehicle type (PICKUP/TRUCK/TRACTOR/MINI_TRUCK/AUTO/OTHER), driver name, driver phone, transporter name, notes, material lines (description + qty + unit), and an "auto-submit" toggle.

### What works

- **Full lifecycle wired**: DRAFT → PENDING → APPROVED → EXITED, plus REJECTED and CANCELLED. All actions POST to `/api/gate-passes/{id}` PATCH with optimistic updates (`MobileGatePassList.tsx:175-212`).
- **Exit photo capture**: The "Confirm Exit" dialog includes a `PhotoUploader` for photographing the loaded vehicle (`MobileGatePassList.tsx:563-566`) — excellent for audit trails.
- **Optimistic updates**: Status changes are immediately reflected in the UI, then reverted on error.
- **Reject requires reason**: Good audit practice.
- **Driver phone is a `tel:` link**: Tap to call the driver directly.
- **Vehicle types are India-appropriate**: PICKUP, TRUCK, TRACTOR, MINI_TRUCK, AUTO, OTHER — covers Indian transport modes.
- **Categories**: MATERIAL_ISSUE, STOCK_TRANSFER, MATERIAL_SALE, SUPPLIER_RETURN, MANUAL — covers all gate movement scenarios.

### What's broken / missing

- **No QR code on gate pass**: The print view (`/print/gate-pass/{id}`) likely doesn't include a QR code for gate security to scan. Indian construction gates often use QR-based verification.
- **No OTP-based exit verification**: When confirming exit, there's no OTP sent to the driver's phone or the approver's phone for verification. This would add a security layer.
- **No weight/quantity reconciliation**: The gate pass lists items with qty, but there's no reconciliation with the actual weighed/measured quantity at the gate. Indian gates often have weighbridges.

### What's confusing

- **The create form has free-text material lines**: Unlike the material issue form which uses a material selector, the gate pass form uses free-text `description` + `qty` + `unit` for each line (`MobileGatePassList.tsx:639-641`). This means I could type "Cement" instead of selecting the actual material master record. This could cause data inconsistency — the gate pass item won't link to the material master.
- **"Auto-submit" toggle**: The form has an `autoSubmit` toggle (`MobileGatePassList.tsx:638`) that determines whether the gate pass is created as DRAFT or directly as PENDING. The label isn't shown in the visible code — the user might not understand what it does.

### India-specific gaps

- **No e-way bill link**: For material movement exceeding ₹50,000 in value, an e-way bill is mandatory in India. The gate pass doesn't generate or link to an e-way bill.
- **No vehicle RC verification**: The vehicle number is free-text — no validation against RTO records.
- **No driver license capture**: Driver license number is not captured, which is required for gate compliance.

---

## Step 8 — Report Safety Incident

### What I see

**Files:** `apps/web/src/app/m/safety/page.tsx` (tabbed hub) · `apps/web/src/app/m/safety/MobileSafetyContent.tsx` (tabs) · `apps/web/src/app/m/safety/MobileNewIncidentDialog.tsx` (form)

1. The safety page is a **tabbed view**: Incidents | Hazards | Inspections. Each tab shows a count badge.
2. **Incidents tab**: List of incidents with incident number, title, type, severity, status, project, location, injured count, fatalities, date.
3. **FAB (+)**: Opens the new incident form (if I have `SAFETY_MANAGE` permission AND there are projects).
4. **New incident form** (`MobileNewIncidentForm`): A comprehensive form with:
   - **Details**: Project selector, Title, Type (ACCIDENT/NEAR_MISS/INJURY/FATALITY/PROPERTY_DAMAGE/ENVIRONMENTAL/FIRE/STRUCTURAL/OTHER), Severity (FIRST_AID/LOST_TIME/SERIOUS/FATAL/PROPERTY_ONLY).
   - **Description**: "What happened?" textarea.
   - **When & Where**: Date, Time, Location (free-text), WBS Activity (optional, auto-loaded from project).
   - **People & Damage**: People involved, Injured count, Fatalities count, Property damage estimate (₹).
   - **Photo Evidence**: `PhotoUploader` (max 8 photos).
   - **Submit**: POSTs to `/api/safety/incidents` with all fields + attachments.
5. The form uses `SectionCard` components for visual grouping and a sticky bottom action bar with the "Report" button.

### What works

- **Fully wired**: form → `/api/safety/incidents` POST → `createIncident()` service → toast "Incident reported" → `router.refresh()` (`MobileNewIncidentDialog.tsx:71-82`).
- **Photo evidence capture**: Up to 8 photos with `PhotoUploader`.
- **WBS activity linking**: Incidents can be linked to a specific WBS node for root cause analysis.
- **Property damage estimate in ₹**: India-appropriate currency symbol.
- **Severity levels match Indian construction safety norms**: First Aid, Lost Time, Serious, Fatal, Property Only.
- **Incident types are comprehensive**: Covers all common Indian construction incidents including structural and environmental.

### What's broken / missing

- **No GPS capture for incident location**: The form has a free-text "Location" field but doesn't capture GPS coordinates. For serious incidents, the exact GPS location is critical for reporting and investigation.
- **No immediate notification to PROJECT_DIRECTOR**: When a serious/fatal incident is reported, there's no automatic notification (SMS/push) to Anurag (the PROJECT_DIRECTOR). The incident is saved to the DB but no alert is triggered.
- **No "near miss" anonymous reporting**: Near misses should ideally have an anonymous reporting option to encourage reporting without fear of blame. The current form always records the reporter.
- **No corrective action / CAPA workflow**: The form captures the incident but there's no corrective and preventive action (CAPA) workflow on mobile. The incident detail page might have it, but the creation form doesn't.
- **No regulatory reporting trigger**: Indian construction incidents (especially fatalities/serious injuries) must be reported to the Labour Commissioner under the Building and Other Construction Workers (BOCW) Act. The form doesn't flag or trigger this.

### What's confusing

- **`SAFETY_MANAGE` permission required to report**: The FAB only shows if I have `SAFETY_MANAGE` (`MobileSafetyContent.tsx:90`). As a SITE_ENGINEER, I might have `SAFETY_REPORT` but not `SAFETY_MANAGE` — in which case I can't report incidents from this page. This is a significant gap: the people most likely to witness incidents (site engineers) might not be able to report them.
- **The form is long**: 5 sections (Details, Description, When & Where, People & Damage, Photo Evidence) on one scrollable page. In an emergency, this is too much friction. There should be a "Quick Report" mode with just title + type + severity + photo.

### India-specific gaps

- **No BOCW Act compliance**: As noted, no regulatory reporting trigger for the Building and Other Construction Workers Act.
- **No safety training record link**: The form doesn't check whether the involved workers had completed required safety training.
- **No PPE compliance check**: The form doesn't capture whether PPE (helmet, safety harness, etc.) was being used at the time of the incident.

---

## Step 9 — Update Task Status

### What I see

**Files:** `apps/web/src/app/m/site/tasks/page.tsx` (page) · `apps/web/src/components/mobile/mobile-task-list.tsx` (list component)

1. The tasks page shows **my assigned tasks** (where `assignedToId = my user ID`) with status PENDING, IN_PROGRESS, or BLOCKED (`site/tasks/page.tsx:30`).
2. **3 stat cards**: Pending, In Progress, Blocked counts.
3. **Task list**: Grouped by status (In Progress, Pending, Blocked). Each task row is expandable:
   - Header: icon, title, priority, due date (red if overdue), status badge, chevron.
   - Expanded: description (in a box), step-by-step guidance (in a `<pre>` block), and action buttons:
     - **Start** (PENDING → IN_PROGRESS).
     - **Complete** (IN_PROGRESS → COMPLETED).
     - **Resume** (BLOCKED → IN_PROGRESS).
     - **Cancel** (PENDING/IN_PROGRESS → CANCELLED).
4. Search by title + filter chips (All, Pending, In Progress, Blocked).
5. If I have `TASKS_ASSIGN` permission, a FAB (+) lets me assign tasks to team members.
6. If there are no tasks: "No open tasks" with a "Refresh Tasks" CTA.

### What works

- **Fully wired**: status updates POST to `/api/tasks/{id}` PATCH → toast → `router.refresh()` (`mobile-task-list.tsx:74-93`).
- **Optimistic UI**: completed/cancelled tasks are immediately hidden from the list.
- **Step-by-step guidance**: Tasks can include `instructions` shown in a `<pre>` block — useful for SOPs.
- **Overdue highlighting**: Due dates in the past are shown in red.
- **Haptic feedback**: Different haptic patterns for different actions (complete = 30ms, others = 10ms, error = [50,20,50]).

### What's broken / missing

- **No "Block" action**: I can Start, Complete, Resume, and Cancel — but there's no "Mark as Blocked" button. If I'm blocked, I have to leave the task as IN_PROGRESS or cancel it. There should be a "Report Blocker" action that sets status to BLOCKED with a reason.
- **No task comments/notes**: I can't add a comment or note to a task (e.g., "Material didn't arrive, waiting for cement"). The task has `description` and `instructions` but no comment thread.
- **No task attachment**: I can't attach a photo to a task update (e.g., "completed — here's the photo proof").
- **No "completed today" view**: Once I complete a task, it disappears. I can't see what I've accomplished today. There's no "Completed" tab or section — only open tasks are shown.
- **Only 30 tasks fetched**: `take: 30` (`site/tasks/page.tsx:32`). If I have more than 30 open tasks, the rest aren't visible. There's no pagination or "Load More" on this page.

### What's confusing

- **The "Refresh Tasks" CTA links to the same page** (`/m/site/tasks`) (`mobile-task-list.tsx:223`). Tapping it just navigates to the current page, which might not actually refresh the data (Next.js client-side navigation to the same URL doesn't always re-fetch).
- **Priority is shown as raw text**: The priority field is displayed as-is (e.g., "HIGH", "MEDIUM") without color coding or visual hierarchy. A high-priority task should be visually distinct.

### India-specific gaps

- **No Hindi task instructions**: Task instructions are in English. Indian site workers might need Hindi/regional language instructions.
- **No voice-based task update**: On a noisy site, typing a status update is hard. Voice-to-text for task comments would help.

---

## Step 9b — Mobile Home Page Quick Actions (Summary)

As a `field` persona, my home page quick actions come from `SITE_QUICK_ACTIONS` (`quick-action-catalogs.ts:151-180`):

### "Daily" tab

| Action        | Link                      | Relevance                                    |
| ------------- | ------------------------- | -------------------------------------------- |
| Quick Issue   | `/m/stock-out?mode=issue` | ✅ Issue materials                           |
| Receive Stock | `/m/site/receive`         | ✅ Receive GRN                               |
| Submit DPR    | `/m/site/dpr`             | ✅ Daily DPR                                 |
| Attendance    | `/m/site/attendance`      | ⚠️ Requires HR_MANAGE — I'll get "No Access" |
| Tasks         | `/m/site/tasks`           | ✅ My tasks                                  |
| Scrap Log     | `/m/stock?tab=scrap`      | ✅ Scrap recording                           |
| Site Stock    | `/m/site/stock`           | ✅ View site stock                           |
| Field         | `/m/site/field`           | ✅ Field reporting                           |

### "Site Ops" tab

| Action      | Link                  | Relevance           |
| ----------- | --------------------- | ------------------- |
| Projects    | `/m/projects`         | ✅ View projects    |
| Work Orders | `/m/work-orders`      | ✅ Work orders      |
| Safety      | `/m/safety`           | ✅ Report incidents |
| MB          | `/m/measurement-book` | ✅ Measurement book |
| Stock Out   | `/m/stock-out`        | ✅ Transfer/issue   |
| All DPRs    | `/m/dprs`             | ✅ DPR list         |

### Cross-module links (below quick actions)

| Link        | Destination                |
| ----------- | -------------------------- |
| Gate Pass   | `/m/gate-pass`             |
| HR / Leaves | `/m/hr/leaves`             |
| Procurement | `/m/procurement`           |
| Expenses    | `/m/accounts?tab=expenses` |

### Issue: Attendance quick action leads to "No Access"

The "Attendance" quick action links to `/m/site/attendance`, which requires `HR_MANAGE` permission (`site/attendance/page.tsx:38-40`). As a SITE_ENGINEER, I'll see a "No Access" screen. The self-check-in widget on the home page is my actual attendance entry point, but the quick action leads to the manager form. This is a confusing dead end. The quick action should either link to `/m/attendance` (the list, which is view-only) or be removed for field personas.

---

## Summary of Issues

### 🔴 Broken

1. **Attendance quick action dead end**: `/m/site/attendance` requires HR_MANAGE — SITE_ENGINEER gets "No Access" (`site/attendance/page.tsx:38-40`, `quick-action-catalogs.ts:160`).
2. **No "Create Issue" button on material issues list**: `/m/material-issues` list has no FAB/CTA to create a new issue — dead end for creation (`material-issues/page.tsx`).
3. **MB entry permission gating**: FAB requires `MB_VERIFY` to create entries — SITE_ENGINEER with only `MB_CREATE` can't create MB entries (`measurement-book/page.tsx:69,128`).
4. **Safety incident reporting permission**: FAB requires `SAFETY_MANAGE` — site engineers who witness incidents may not be able to report them (`MobileSafetyContent.tsx:90`).
5. **"Refresh Tasks" CTA is a no-op**: Links to the same page (`/m/site/tasks`), may not actually refresh data (`mobile-task-list.tsx:223`).
6. **Only 30 tasks fetched with no pagination**: `take: 30` with no "Load More" — tasks beyond 30 are invisible (`site/tasks/page.tsx:32`).

### 🟡 Missing

1. **No task count on home briefing**: `/api/briefing` doesn't include open task count for the user.
2. **No "today's DPR submitted" indicator on home**: Can't see DPR status at a glance.
3. **No GPS accuracy display on check-in**: Can't tell if GPS fix is reliable.
4. **No offline check-in**: Attendance check-in doesn't use the offline queue (unlike requisitions).
5. **No photo geo-tagging**: DPR photos and check-in photos don't embed GPS coordinates.
6. **No voice notes**: DPR form has no voice-to-text for work summary/blockers/notes.
7. **No MB dimension-based measurement**: Only a single qty field — no L×B×H dimension entry per IS 1200.
8. **No cumulative/previous MB measurement display**: Can't see previous measurements to avoid double-counting.
9. **No "Mark as Blocked" task action**: Can start/complete/cancel but not block a task.
10. **No task comments or attachments**: Can't add notes or photos to task updates.
11. **No "completed today" task view**: Completed tasks disappear with no summary.
12. **No stock availability check in requisition or issue forms**: Could request/issue more than available.
13. **No receiver signature capture on material issue**: Indian sites require signatures.
14. **No automatic safety incident notification**: Serious/fatal incidents don't alert the PROJECT_DIRECTOR.
15. **No QR code on gate pass print**: No scannable verification at the gate.
16. **No "Save as Draft" for DPR on server**: Only localStorage draft, not cross-device.
17. **Gate pass material lines are free-text**: Not linked to material master records.

### 🔵 Confusing

1. **Two attendance pages**: `/m/attendance` (list, view-only) vs `/m/site/attendance` (manager form, no access) — purpose not obvious.
2. **Three routes for material issue**: `/m/site/issue` (redirect), `/m/stock-out?mode=issue` (form), `/m/material-issues` (list) — unclear which to use.
3. **Long-press submit on requisition**: Non-standard gesture — long-press navigates away instead of submitting (`MobileNewRequisitionClient.tsx:396-398`).
4. **"Execute Issue" terminology**: Could be confused with task execution — "Confirm Issue" would be clearer.
5. **HomeTree touch targets**: 24px row height is below 44px minimum — hard to tap with thumb (`home-tree.tsx:446`).
6. **DPR form is very long**: All fields on one scrollable page — no wizard progression.
7. **Auto-submit toggle on gate pass**: Label not visible in code — user may not understand what it does.
8. **`/m/requisitions` redirect**: URL changes silently to `/m/procurement?tab=indents` with no message.
9. **Dead code**: `HomeTopSection` and `GreetingHeader` in `home-client.tsx:109-150` are not rendered (only `HomeTree` is used in `adaptive-home.tsx`).

### 🇮🇳 India-Specific Gaps

1. **No IS 1200 measurement standard integration**: MB entries don't follow dimension-based quantity calculation per IS 1200.
2. **No MB serial number format**: Indian MB books have specific serial number conventions.
3. **No joint measurement signature**: MB entries require contractor + consultant signatures per Indian practice.
4. **No BOCW Act compliance trigger**: Safety incidents don't trigger regulatory reporting to the Labour Commissioner.
5. **No e-way bill integration**: Gate passes and material movements don't generate/link e-way bills for GST compliance.
6. **No weather auto-fill from Indian weather API**: DPR weather is manual.
7. **No Hindi/regional language support**: Entire UI is English-only.
8. **No PPE compliance check in safety incidents**: Doesn't capture whether PPE was used.
9. **No safety training record link**: Incidents don't check worker training status.
10. **No Aadhaar/biometric attendance**: Only GPS-based, no biometric worker identification.
11. **No vehicle RC/driver license verification**: Gate pass vehicle/driver details are free-text.
12. **No weighbridge integration**: Gate pass quantities aren't reconciled with weighed quantities.
13. **No check-in time window enforcement**: No late check-in detection (e.g., after 10 AM = Late).
14. **No geo-tagged photo for check-in**: Indian labour compliance often requires selfie at check-in.
15. **No HSN/GST display in requisition form**: Material selector doesn't show HSN codes or GST rates.

---

## Architecture Notes

### Persona Mapping

- `SITE_ENGINEER` → `field` persona (`mobile-nav-v2.ts:68-71`)
- Field persona gets: `SITE_QUICK_ACTIONS` catalog, self-check-in widget (tier 4+), cross-module links to Gate Pass / HR / Procurement / Expenses

### Key API Endpoints Used

| Action                 | Endpoint                                    | Method |
| ---------------------- | ------------------------------------------- | ------ |
| Self check-in          | `/api/attendance/self-check-in`             | POST   |
| Self check-out         | `/api/attendance/self-check-out`            | POST   |
| Submit DPR             | `/api/dprs`                                 | POST   |
| Approve/reject DPR     | `/api/dprs/{id}`                            | PATCH  |
| Create requisition     | `/api/requisitions`                         | POST   |
| Execute material issue | `/api/issue-materials`                      | PATCH  |
| Cancel material issue  | `/api/issue-materials/{id}`                 | PATCH  |
| Create MB entry        | `/api/mb-entries`                           | POST   |
| Gate pass actions      | `/api/gate-passes/{id}`                     | PATCH  |
| Report incident        | `/api/safety/incidents`                     | POST   |
| Update task            | `/api/tasks/{id}`                           | PATCH  |
| OCR DPR                | `/api/ocr/dpr`                              | POST   |
| Home data              | `/api/mobile/home`                          | GET    |
| Briefing               | `/api/briefing`                             | GET    |
| Quick actions context  | `/api/me/quick-actions-context?module=site` | GET    |

### Offline Support

- **Requisitions**: Full offline queue support (`useOfflineQueue`) ✅
- **DPRs**: localStorage draft auto-save (`useDrafts`) but no offline submit ⚠️
- **Attendance**: No offline support ❌
- **Material issues**: No offline support ❌
- **Gate passes**: No offline support ❌
- **Safety incidents**: No offline support ❌
- **Tasks**: No offline support ❌

### Mobile Shell

- All `/m/*` routes render inside `MobileShellV2` (`layout.tsx`) with a bottom tab bar.
- `ChunkErrorRecovery` and `NavigationTracker` are included.
- Nav identity is resolved server-side via `getNavBootstrap()` to avoid client-side waterfalls.
