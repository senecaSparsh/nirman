# Mobile Flow Map — Brainstorm: Gaps, Improvements & Smarter Things

> Analysis of `docs/MOBILE_FLOW_MAP.md` against the actual codebase.
> Every finding here is verified against real code — no speculation.

---

## A. Real Gaps (Things That Should Exist But Don't)

### A1. Barcode Scanner — Built But Not Wired
**The gap:** `apps/web/src/components/mobile/barcode-scanner.tsx` is a fully implemented cross-platform scanner (native BarcodeDetector → html5-qrcode fallback → manual entry). It supports code_128, ean_13, ean_8, qr_code, data_matrix.

**Where it should be used but isn't:**
- `/m/site/receive` — scan PO number / GRN number to pull up the right PO
- `/m/stock-counts/new` — scan material codes during cycle count
- `/m/materials/[id]` — scan to look up a material
- `/m/gate-pass` — scan gate pass number to verify outbound
- `/m/transfers/[id]` — scan transfer lines during dispatch/receive

**Impact:** Field workers currently type PO numbers and material codes manually on a phone keyboard. This is slow and error-prone. The scanner is already built — it just needs to be wired in.

**Fix complexity:** Low. The component is self-contained. Add a `<BarcodeScanner>` button next to search/lookup inputs on the 5 pages above.

---

### A2. SwipeableListItem — Only Used on 2 of 15+ List Pages
**The gap:** `SwipeableListItem` (swipe-left-to-reveal actions) is wired into:
- `/m/procurement` (MobileProcurementList) — swipe to approve/cancel
- `/m/dprs` (MobileDprsList) — swipe to approve/reject

**Where it should also be:**
- `/m/requisitions` — swipe to submit/approve/reject
- `/m/transfers` — swipe to dispatch/receive
- `/m/stock-counts` — swipe to confirm/reconcile
- `/m/supplier-returns` — swipe to submit/complete/cancel
- `/m/material-sales` — swipe to record payment/cancel
- `/m/tasks` — swipe to mark complete/reassign
- `/m/leads` — swipe to mark qualified/lost
- `/m/safety/hazards` — swipe to resolve
- `/m/safety/incidents` — swipe to close
- `/m/quality-control` (NCRs) — swipe to close

**Impact:** Approvals are the highest-frequency action on mobile. Currently users must tap into each item's detail page to approve. Swipe-to-approve would cut taps in half for the most common workflow.

**Fix complexity:** Medium. Each list page needs to define its swipe actions with the right API calls + permission checks. The pattern is established in MobileProcurementList.

---

### A3. No Pagination / Infinite Scroll on Any List Page
**The gap:** Every list page fetches with a hard `take: N`:
- `/m/procurement` — `take: 60`
- `/m/dprs` — `take: 40`
- `/m/transfers` — `take: 100`
- `/m/materials` — `take: 200`
- `/m/units` — `take: 200`
- `/m/attendance` — `take: 200`
- Most others — `take: 80`

No page has "load more", infinite scroll, or cursor-based pagination. If a company has 500 POs, the user only sees the 60 most recent and has no way to reach older ones (search helps, but only if they know what they're looking for).

**Impact:** Data silently disappears. A storekeeper who needs a PO from 3 months ago can't find it unless they search by number.

**Fix complexity:** Medium. Add a `loadMore` cursor to each list component. Use Prisma's `cursor` + `skip: 1` pagination. The client components already use `useMemo` for filtering — add a "Load more" button at the bottom when `items.length === take`.

---

### A4. No Push Notifications
**The gap:** The notification system (`/m/settings/notifications`) has:
- Templates (WhatsApp, Email, In-App)
- Delivery logs
- Preference toggles
- Event types (LOW_STOCK, TASK_ASSIGNMENT, QUOTE_APPROVAL, PO_APPROVAL, DPR_SUBMITTED, PAYMENT_RECEIVED, SALE_CREATED)

But there's **no web push notification** — no `PushManager`, no `registration.pushManager.subscribe()`, no VAPID keys, no push server. The service worker (`sw.js`) handles offline caching + background sync but not push.

**Impact:** Approvers don't know when a PO is waiting. Site engineers don't know when a task is assigned. They have to open the app and check the attention banner.

**Fix complexity:** High. Requires VAPID key pair, push subscription endpoint, server-side push sending (web-push library), and subscription management UI. But the notification trigger points already exist in `@nirman/services/notifications.ts` — they just need a `WebPushProvider` alongside the existing WhatsApp/Email stubs.

---

### A5. Service Worker Only Precaches One Page
**The gap:** `sw.js` precaches:
```js
const SHELL_URLS = ["/", "/manifest.webmanifest", "/icon.svg", "/field", "/m/site/field"];
```

Only `/m/site/field` is precached. The other 145 mobile pages will show a blank screen when offline (navigation requests fall back to cached shell, but the shell only covers the field page).

**Impact:** If a user is offline and tries to open `/m/procurement` to check a PO, they get the cached shell (which is the field page) — not the procurement page.

**Fix complexity:** Medium. Either precache all tab-bar destinations (`/m/home`, `/m/inventory`, `/m/site`, `/m/hr`, `/m/accounts`, `/m/settings`) or use a more aggressive runtime caching strategy for navigation requests. The current network-first-with-shell-fallback is correct for the strategy, but the shell is too narrow.

---

### A6. Forms Navigate to List, Not to Created Detail
**The gap:** After creating a new entity, most forms show a success screen with "View All" (goes to list) but **don't link to the created item's detail page**.

Example: `/m/procurement/new` creates a PO, shows success with PO number, then offers "View All POs" → `/m/procurement`. But the user likely wants to immediately approve/review the PO they just created.

**Where this happens:**
- `/m/procurement/new` — success screen → "View All POs" (no "View This PO" button)
- `/m/transfers/new` — same pattern
- `/m/scrap-generations/new` — same
- `/m/material-sales/new` — same
- `/m/stock-counts/new` — same
- `/m/supplier-returns/new` — same

**Exception:** `/m/requisitions/new` correctly does `router.push("/m/requisitions")` (but still goes to list, not detail).

**Impact:** Extra tap to get to the thing you just made. For POs, the user almost always wants to submit for approval immediately after creating.

**Fix complexity:** Low. The API returns the created entity's ID. Add a "View [PO Number]" button that does `router.push("/m/procurement/" + data.id)` alongside the existing "View All" button.

---

### A7. No "Recent Items" / "Continue Where You Left Off"
**The gap:** There's no quick way to jump back to the last 5 entities you were looking at. The home tab shows the orbit navigator (company hierarchy), not your recent activity.

**Impact:** A supervisor who was reviewing 3 DPRs, got interrupted, and comes back has to navigate back to `/m/dprs` and find them again.

**Fix complexity:** Low. The audit log already records every view action (or could). Add a "Recent" section to the home page or a "Recent" tab in the NavSheet. Store last-visited IDs in `localStorage` (client-side, no API needed).

---

## B. Smarter Things (Features That Would Make the App Feel Intelligent)

### B1. Voice Agent Is Powerful But Underutilized
**Current state:** The voice agent (`voice-agent-button.tsx`) is genuinely sophisticated:
- 50+ intents (STOCK_QUERY, LOW_STOCK, APPROVE_PO, CREATE_PO, SALE_CREATE, etc.)
- Hindi + Hinglish + English NLU (rule-based, offline, instant)
- Multi-step conversations with context
- Action cards with confirmation popups
- TTS responses in Hindi
- Silence detection, deduplication, auto-submit

**What's missing:**
1. **No voice shortcut from list pages** — you can say "approve PO-0011" from anywhere via the header mic, but there's no mic button on the PO list to say "approve the first one" (ordinal support exists in the NLU but isn't surfaced)
2. **No voice-driven navigation to specific entities** — you can say "stock dikhao" but not "PO-0011 kya status hai" and land on the detail page
3. **No voice from the lock screen** — would need push notification integration
4. **No proactive voice suggestions** — when the assistant sees 5 pending approvals, it doesn't say "You have 5 approvals pending, want me to list them?"

**Smarter ideas:**
- Add a floating mic button on list pages (not just the header) for context-aware voice ("approve the second one")
- After creating an entity, offer a voice shortcut: "Say 'approve' to submit this PO"
- Add a "morning briefing" voice command: "Subah ka summary" → reads out pending approvals, low stock, overdue tasks, today's attendance
- Add voice-driven search: "Cement ka stock kahan hai" → navigates to materials page filtered to cement

---

### B2. Attention Banners Are Static — Could Be Smart
**Current state:** The attention banner carousel on `/m/inventory` shows:
- Out-of-stock materials (red)
- Low-stock materials (amber)
- Pending approvals (amber)
- "All caught up" (green)

**What's missing:**
1. **No priority scoring** — 5 low-stock items are shown in arbitrary order, not by criticality (how soon will they run out? which ones are on critical path projects?)
2. **No suggested action** — "Cement is low" but doesn't say "Reorder from Supplier X (last price ₹350/bag, 3-day delivery)"
3. **No snooze** — can't dismiss an alert you've handled or decided to ignore
4. **No escalation** — if low stock has been ignored for 3 days, it should turn red and notify the manager

**Smarter ideas:**
- Rank attention items by business impact (project on critical path > project not started)
- Add "Quick action" buttons directly in the banner: [Reorder Now] [Create Indent] [Auto-generate]
- Add "Snooze 24h" and "Assign to" actions
- Show days-since-alert as a severity indicator
- Auto-generate indents from the banner (the `generateAutoRequisition()` service already exists)

---

### B3. Offline Queue Has No Conflict UI
**Current state:** The offline queue (`/m/queue`) shows pending/completed/failed items. When a queued operation fails (server rejects it — e.g. PO was already received by someone else), it's marked FAILED with the error message.

**What's missing:**
1. **No retry button** on failed items — user has to recreate the operation from scratch
2. **No conflict resolution UI** — when the server says "PO already received", the user can't see what was received and decide whether to merge, override, or discard
3. **No "view original" link** — can't see the full payload that was submitted
4. **No partial success** — if a 5-line receipt has 4 lines succeed and 1 fail, the whole thing is marked failed

**Smarter ideas:**
- Add [Retry] and [Discard] buttons on failed items
- Show a diff view: "You queued: receive 100 cement. Server says: already received 80 cement on 2024-01-15. Receive remaining 20?"
- Add a "Conflict" status (distinct from "Failed") with a resolution flow
- Allow editing the queued payload before retry (e.g. reduce qty to match remaining)

---

### B4. No "Quick Approve" Batch Action
**Current state:** Approvals happen one at a time — tap into each PO/requisition/DPR, then approve. The `/m/pulse/approvals` page lists all pending approvals but still requires tapping into each one.

**What's missing:**
- No multi-select / batch approve
- No "Approve all" for low-risk items (e.g. all POs under ₹10,000)
- No bulk reject with a single reason

**Smarter ideas:**
- Add checkbox multi-select on the approvals page
- "Approve All Under ₹10K" button (configurable threshold)
- "Approve Selected" with a single confirmation
- Risk-based grouping: show high-value approvals separately from low-value
- The voice agent already has an `APPROVE_ALL` intent — wire it to a UI button too

---

### B5. No Smart Defaults / Learning
**Current state:** Every form starts blank. When creating a PO, the user must select supplier, scope, location, etc. from scratch every time.

**What's missing:**
1. **No "last used" defaults** — if you always order from Supplier X for Project Y, the form doesn't remember
2. **No "duplicate last PO"** — can't clone a previous PO and just change the quantities
3. **No material suggestions** — when adding a line, no autocomplete based on what this project commonly orders
4. **No quantity suggestions** — doesn't suggest "last time you ordered 500 cement, reorder point is 50, current stock is 30, suggest 500"

**Smarter ideas:**
- Pre-fill form fields from `localStorage` (last supplier, last project, last location)
- Add "Duplicate last PO" button on `/m/procurement/new`
- Add a "Frequently ordered" material chip row (based on this project's history)
- Show "Suggested qty" based on reorder point + EOQ + consumption rate
- The `generateAutoRequisition()` service already computes suggested quantities — surface it in the UI

---

### B6. No Cross-Entity "Mentions" / Linking
**Current state:** Detail pages link to related entities (PO→supplier, project→DPRs, etc.), but there's no way to link arbitrary entities together.

**What's missing:**
- Can't link a DPR to a specific BOQ item it's progressing
- Can't link a material issue to a specific WBS node
- Can't link a quality NCR to the specific PO line that supplied the defective material
- Can't link a safety incident to the specific task/equipment involved

**Smarter ideas:**
- Add an optional "Related to" field on entities (polymorphic link)
- Show a "Linked items" section on detail pages
- When approving a DPR, show linked BOQ items for context
- When viewing an NCR, show the linked PO and supplier for traceability

---

### B7. No Field-First QR Codes for Entities
**Current state:** There's no QR code generation for any entity. The barcode scanner can read QR codes but there's nothing to read.

**Smarter ideas:**
- Generate QR codes for: stock locations (warehouse shelves), materials, equipment, built units
- Print QR stickers and place them on physical items
- Scan a shelf QR → see what's there + recent movements
- Scan an equipment QR → see maintenance history, current assignment
- Scan a unit QR → see production cost, sale status, tenant info
- This bridges the physical-digital gap on construction sites

---

## C. Flow Dead-Ends & Navigation Gaps

### C1. Land Detail Doesn't Link to Project
**Gap:** `/m/land/[id]` shows land parcel info but doesn't link to the associated project (`/m/projects/[projectId]`). The data is there (land purchases have `projectId`) but the link is missing.

**Fix:** Add a "Project" row in the detail card with `href={`/m/projects/${land.projectId}`}`.

---

### C2. Material Issue Form Doesn't Link to Project After Creation
**Gap:** `/m/site/issue` (MobileIssueForm) creates a material issue and shows a toast, but doesn't link to the created issue's detail page or the project's cost impact. The user is left on the form.

**Fix:** After successful creation, show a success state with "View Issue" and "Project Costs" links.

---

### C3. No Way to Get from a Stock Movement to Its Source
**Gap:** The stock ledger (`/m/stock/[id]`) shows stock movements (IN/OUT/TRANSFER) but each movement is just a row with type + qty + date. There's no link to the source entity (the PO that caused the receipt, the material issue that caused the OUT, the transfer that caused the IN).

**Fix:** Each `StockMovement` has a `sourceType` and `sourceId`. Add a link: "Source: PO-0011" → `/m/procurement/[id]`.

---

### C4. DPR Variance Analysis Is a Dead-End
**Gap:** Running variance analysis on a DPR (`POST /api/dprs/[id]/variance`) returns a table of actual vs standard vs variance %, but the result is only shown in the DPR detail dialog. There's no link from an over-consumed material line to:
- The material's detail page (to check current stock)
- The standard consumption benchmark (to review if the standard is wrong)
- The auto-generated scrap slip (if `autoGenerateScrap` was used)

**Fix:** Add links from variance table rows to material + standard + scrap pages.

---

### C5. Quotation Comparison Doesn't Link to Suppliers
**Gap:** The quotation detail page (`/m/quotations/[id]`) shows vendor quotes with prices, but the vendor names aren't linked to the supplier detail pages.

**Fix:** Wrap vendor names in `<Link href={`/m/suppliers/${quote.supplierId}`}>`.

---

### C6. No "Back to Search" After Drilling Deep
**Gap:** When you drill down Company → Project → Unit → Sale → Customer, the back button goes one level at a time. There's no way to jump back to the search results you started from.

**Fix:** The edge-swipe-back goes to `router.back()` which is correct. But add a "Home" breadcrumb or a long-press on back to show the navigation history stack.

---

## D. Architectural Improvements

### D1. List Pages Do Too Much Server-Side Work
**Current state:** Every list page's `page.tsx` fetches 40-200 items with joins (supplier, lines, project, etc.) on the server, serializes them, and passes to the client component for filtering.

**Problem:** The server fetches 200 items but the user might only look at 10. The joins are expensive (PO + lines + supplier for 200 POs = 600+ DB rows).

**Fix:** Move filtering to the server. Use `searchParams` to pass the query + filter to the server component, which adds `WHERE` clauses to the Prisma query. Keep client-side filtering as a progressive enhancement for instant feedback, but reduce the initial `take` to 30 and add server-side "load more" via cursor pagination.

---

### D2. No Skeleton Matching for Detail Pages
**Current state:** Detail pages use `<MobileSkeletonDetail sections={6} />` — a generic skeleton with 6 sections. But different detail pages have different layouts (a PO detail looks nothing like a project detail).

**Fix:** Create page-specific skeletons that match the actual layout. This reduces the "flash of wrong content" on slow connections.

---

### D3. Optimistic Updates Are Inconsistent
**Current state:**
- `MobilePoActions` — uses `useOptimisticAction` (optimistic status change, reverts on error)
- `MobileDprActions` — uses `useOptimisticAction`
- `MobileMbActions` — uses `useOptimisticAction`
- `MobileWbsActions` — uses `useOptimisticAction` for delete
- `MobileRequisitionActions` — uses plain `fetch` + `router.refresh()` (NO optimistic update)
- `MobileDetailActions` (generic) — uses plain `fetch` + `router.refresh()` (NO optimistic update)
- `MobilePortalListingActions` — uses plain `fetch` + `router.refresh()` (NO optimistic update)

**Problem:** Some action bars feel instant (PO, DPR) while others have a visible delay (requisition, supplier returns, portal listings). The UX is inconsistent.

**Fix:** Migrate `MobileRequisitionActions`, `MobileDetailActions`, and `MobilePortalListingActions` to use `useOptimisticAction`. The hook already exists — it's just not used everywhere.

---

### D4. No Error Boundary Per Module
**Current state:** If a single page throws an error, the entire mobile shell shows an error page. There's no module-level error boundary.

**Fix:** Add `error.tsx` files per module directory (`/m/procurement/error.tsx`, `/m/site/error.tsx`, etc.) that show a friendly "Something went wrong" with a retry button, keeping the shell (header + tab bar) intact.

---

## E. Quick Wins (Low Effort, High Impact)

| # | Improvement | Effort | Impact |
|---|------------|--------|--------|
| 1 | Wire barcode scanner into `/m/site/receive` | Low | High — field workers stop typing PO numbers |
| 2 | Add "View This [Entity]" button to all "new" form success screens | Low | Medium — saves a tap after every creation |
| 3 | Add swipe-to-approve on `/m/requisitions` list | Low | High — approvers' #1 workflow |
| 4 | Add swipe-to-approve on `/m/stock-counts` list | Low | Medium |
| 5 | Migrate `MobileRequisitionActions` to optimistic updates | Low | Medium — feels instant like PO actions |
| 6 | Add "Load more" button to list pages when `items.length === take` | Low | High — no more silent data loss |
| 7 | Link land detail → project | Trivial | Low — but fixes a dead-end |
| 8 | Link quotation vendors → supplier detail | Trivial | Low |
| 9 | Add "Recent items" section to home page (localStorage) | Low | Medium — saves navigation after interruptions |
| 10 | Precache all 6 tab-bar destinations in sw.js | Trivial | Medium — all tabs work offline, not just field |
| 11 | Add "Duplicate last PO" button on new PO form | Low | Medium — common procurement pattern |
| 12 | Add "Quick approve all under ₹10K" on approvals page | Medium | High — batch approval for low-risk items |

---

## F. Strategic Bets (Higher Effort, Transformative)

| # | Improvement | Effort | Impact |
|---|------------|--------|--------|
| 1 | Web push notifications for approvals + low stock + task assignment | High | Transformative — app becomes proactive, not reactive |
| 2 | QR code generation for stock locations, materials, equipment, units | Medium | High — bridges physical-digital gap on sites |
| 3 | Offline conflict resolution UI for the queue | Medium | High — makes offline-first actually usable at scale |
| 4 | Voice-driven "morning briefing" command | Medium | High — owners start the day with a spoken summary |
| 5 | Smart attention ranking (business impact scoring) | Medium | High — surfaces what matters, hides what doesn't |
| 6 | Server-side filtering + cursor pagination on all list pages | Medium | High — scales to 10,000+ entities without perf degradation |
| 7 | Cross-entity linking ("Related to" polymorphic field) | High | Medium — enables full traceability |
| 8 | Field-first photo capture with AI material recognition | Very High | Transformative — point camera at a pile, app says "≈500 bags cement" |

---

## G. Documentation Gaps in the Flow Map

The flow map (`docs/MOBILE_FLOW_MAP.md`) is structurally complete (all 146 pages covered) but is missing these behavioral details that would help anyone using it as a reference:

1. **Voice agent section** — the doc mentions "voice agent button" in the header but doesn't document the 50+ intents, the conversation model, or the action card system. This is a major feature that's invisible in the doc.

2. **Offline queue details** — the doc mentions "mutations queue when offline" but doesn't list which 8 mutation types are supported, the conflict resolution strategy (server-wins), or the IndexedDB storage mechanism.

3. **Service worker caching strategy** — not documented. The network-first + shell-fallback + SWR strategy is important for understanding offline behavior.

4. **Notification system** — not documented. The template/preference/log system with WhatsApp/Email/In-App channels is a whole subsystem.

5. **Swipe actions** — the doc doesn't mention that PO and DPR lists support swipe-to-act.

6. **Barcode scanner** — not mentioned (because it's not wired in, but its existence is relevant for future work).

7. **Drafts system** — `useDrafts` (IndexedDB auto-save) is used on 7+ forms but not documented. This is a key UX feature — forms auto-save as you type and can be restored after interruptions.

---

*End of brainstorm. Every finding is verified against actual code in `apps/web/src/`.*
