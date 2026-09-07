# Mobile Consistency Plan

> Goal: make every `/m/*` page look and feel like one product — same structure,
> same components, same UX patterns. Based on the page audit
> (`MOBILE_PAGE_AUDIT.md`) and a review of the existing shared component library.

## The Problem in One Sentence

You already have excellent shared primitives (`primitives.tsx`, `scaffold.tsx`,
`form-primitives.tsx`, `fab-modal.tsx`, `new-entity-page.tsx`) — but **adoption
is inconsistent**: the scaffolding that was built for exactly this purpose
(`MobileNewEntityPage`) is used **zero times**, `MobilePageHeader` is used
**twice**, and every page hand-rolls the same Suspense → connection → permission
→ fetch → serialize boilerplate with slightly different dimensions and ordering.

---

## What Already Exists (and adoption)

| Component | File | Used by | Status |
|-----------|------|---------|--------|
| `MobileRow`, `MobileStatCard`, `MobileEmptyState`, `Badge`, `MobileCta`, `MobileNoAccess`, `MobileStatusBadge` | `primitives.tsx` | ~all pages | ✅ Excellent |
| `MobileSearchHeader`, `MobileFab`, `MobileFilterChips`, `MobileCardGrid`, `MobileSummaryStrip`, `MobileNoResults` | `scaffold.tsx` | 78 files | ✅ Good |
| `SectionCard`, `SelectorCard`, `SelectorRow`, `SelectorModal`, `UnderlineInput`, `StickyActionBar` | `form-primitives.tsx` | 57 files | ✅ Good |
| `MobileFabModal` | `fab-modal.tsx` | ~all FAB dialogs | ✅ Good |
| `PageContextProvider` | `page-context.tsx` | 41 detail pages | ✅ Good |
| `AttentionBannerCarousel` | `attention-banner-carousel.tsx` | 6 dashboards | ✅ Good |
| `ExportShareBar` | `export-share-bar.tsx` | most list pages | ✅ Good |
| `MobileSkeletonList/Home/Detail/Form` | `mobile-skeleton.tsx` | ~all pages | ✅ Good |
| **`MobileNewEntityPage`** | `new-entity-page.tsx` | **0 pages** | ❌ **Built but never adopted** |
| **`MobilePageHeader`** | `primitives.tsx` | **2 pages** | ❌ **Almost never used** |
| **`RecordRecentItem`** | `record-recent-item.tsx` | **11 of 41 detail pages** | ⚠️ Partial |
| `MobileReportHeader` | `report-ui.tsx` | report pages only | ✅ Fine (scoped) |
| `MobilePipelineStepper` | `primitives.tsx` | few detail pages | ⚠️ Underused |

---

## The Plan: 5 Shared Wrappers + Adoption Fixes

The core insight: **you don't need new primitives — you need page-level
wrappers** that encode the structural pattern for each page type. The list
page, detail page, new-page, hub page, and project-scoped page all repeat the
same 5-line boilerplate. Wrap that once, use everywhere.

### 1. `MobileListPage` — for all list/index pages (Patterns B, C, D, E)

**Today:** every list page hand-rolls this:
```tsx
export default function Page() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <Content />
    </Suspense>
  );
}
async function Content() {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  if (!hasPermission(role, PERM.X)) return <MobileNoAccess what="X" />;
  const data = await prisma.x.findMany({ where: { companyId: company.id, deletedAt: null }, ... });
  const rows = data.map(...);
  return <MobileXList items={rows} ... />;
}
```

**Proposed:** one wrapper that handles Suspense + connection + permission + the
standard page structure (header + stats band + list area + FAB slot):

```tsx
// components/mobile/v2/list-page.tsx
export async function MobileListPage({
  perm,           // permission to gate on
  what,           // "suppliers" etc for NoAccess
  skeletonRows,   // default 6
  children,       // async render function: (ctx) => ReactNode
}: {
  perm?: Permission;
  what?: string;
  skeletonRows?: number;
  children: (ctx: { company: Company; role: string; canManage: boolean }) => Promise<ReactNode>;
})
```

**Pages to migrate:** ~40 list pages across Patterns B, C, D, E.

**What this standardizes:**
- Same Suspense boundary + skeleton on every list page
- Same permission gate (no page forgets it)
- Same `connection()` call (no page forgets it)
- Consistent loading state dimensions

---

### 2. `MobileDetailPage` — for all `[id]` detail pages (Patterns B, C, F)

**Today:** 41 detail pages all repeat:
```tsx
<Suspense fallback={<MobileSkeletonDetail />}>
  <Content />
</Suspense>
// → connection() → getCompany() → findFirst({ id, companyId }) → notFound → serialize → PageContextProvider → RecordRecentItem → client component
```

**Proposed:**
```tsx
export async function MobileDetailPage({
  entityType,     // "supplier" | "project" | etc
  notFoundIcon,   // icon for the "not found" empty state
  children,       // (ctx) => { record, ... } — only called if record exists
}: {
  entityType: string;
  notFoundIcon?: LucideIcon;
  children: (ctx: { company: Company; role: string; id: string }) => Promise<ReactNode>;
})
```

This wrapper would:
- Handle Suspense + skeleton
- Call `connection()` + `getCompany()` + `getUserRole()`
- Provide `id` from params
- Wrap in `PageContextProvider` (always — currently 41 pages do this manually)
- Call `RecordRecentItem` (always — currently only 11 of 41 do this)
- Render `<MobileEmptyState>` if the child returns null (not found)

**Pages to migrate:** ~41 `[id]` pages.

**What this fixes:**
- 30 detail pages that are missing `RecordRecentItem` get it automatically
- Every detail page gets `PageContextProvider` without thinking about it
- Consistent not-found state

---

### 3. Adopt `MobileNewEntityPage` for all `/new` pages (Pattern B, D)

**Today:** `MobileNewEntityPage` exists and does exactly the right thing —
Suspense + connection + permission gate. But **zero pages use it**. 22 `/new`
pages hand-roll the same pattern with varying levels of completeness:

| Issue | Pages affected |
|-------|---------------|
| No Suspense boundary | 11 of 22 pages |
| No `connection()` | 11 of 22 pages |
| No permission check at page level | 2 pages (quotations, transfers) |
| No `loading.tsx` | 3 pages (expense-claims, petty-cash, supplier-payments) |

**Action:** migrate all 22 `/new` pages to use `MobileNewEntityPage`. This is
the single highest-impact change — the component already exists, just needs
adoption. Each migration is ~5 lines:

```tsx
// Before (18 lines):
export default function Page() {
  return (
    <Suspense fallback={<MobileSkeletonForm />}>
      <Content />
    </Suspense>
  );
}
async function Content() {
  await connection();
  const role = await getUserRole();
  if (!hasPermission(role, PERM.X)) return <MobileNoAccess what="X" />;
  return <MobileNewXClient />;
}

// After (5 lines):
export default function Page() {
  return (
    <MobileNewEntityPage perm={PERM.X} what="create X">
      {() => <MobileNewXClient />}
    </MobileNewEntityPage>
  );
}
```

Also add `loading.tsx` to the 3 missing ones.

---

### 4. `MobileHubPage` — for all tabbed hub pages (Pattern A)

**Today:** 9 hub pages each hand-roll the `?tab=` parsing + tab validation +
content switching. The pattern is identical but the tab names, validation
arrays, and content-switching if/else chains are all bespoke.

**Proposed:**
```tsx
export async function MobileHubPage({
  tabs,           // [{ id, label, badge? }]
  defaultTab,     // "overview"
  perm,           // permission gate
  children,       // (activeTab, ctx) => ReactNode
}: { ... })
```

This handles:
- `searchParams` parsing + tab validation
- Permission gate
- The `*HubTabs` wrapper rendering (pass `activeTab` + `tabs` config)
- Content switching via the children render function

**Pages to migrate:** 9 hub pages (accounts, stock, procurement, construction,
real-estate, hr, reports, crm, sales).

---

### 5. `MobileProjectScopedPage` — for project-selector pages (Pattern F)

**Today:** 6 pages (boq, wbs, budget-variance, measurement-book, project-control,
material-reconciliation) each repeat:
- Parse `?project=` from searchParams
- Fetch project list
- Render `Mobile*ProjectSelector`
- If no project: show "Select a project" empty state
- If project: fetch scoped data

**Proposed:**
```tsx
export async function MobileProjectScopedPage({
  perm,
  children,       // (ctx: { project, projects, role }) => ReactNode
}: { ... })
```

Handles the selector + empty state + project fetch. The child only renders
when a project is selected.

**Pages to migrate:** 6 pages.

---

## Adoption Fixes (no new components needed)

### A. Add `RecordRecentItem` to all 30 missing detail pages

**Today:** only 11 of 41 detail pages record recently-viewed items. The other
30 don't show up in the "recently viewed" section of the home page.

**Fix:** `MobileDetailPage` wrapper (item #2 above) handles this automatically.

### B. Add `error.tsx` to ~30 modules missing one

**Today:** ~30 modules rely on the parent `/m/error.tsx` boundary. This works
but means a bug in one page shows a generic error with no context about which
module failed.

**Fix:** Add a standard `error.tsx` to each module root. It's 5 lines:
```tsx
"use client";
import { MobileModuleError } from "@/components/mobile/v2/primitives";
export default function Error() { return <MobileModuleError />; }
```
Create a `MobileModuleError` component that shows the error + a "Go back"
button + the module name (inferred from the route segment).

### C. Add `loading.tsx` to 3 missing `/new` routes

`expense-claims/new`, `petty-cash/new`, `supplier-payments/new` — each needs
a `loading.tsx` with `<MobileSkeletonForm />`.

### D. Standardize stat card grids

**Today:** some pages use `grid grid-cols-3 gap-1.5`, others use
`grid grid-cols-2 gap-2`, others use `grid grid-cols-4 gap-1.5`. The
`MobileCardGrid` component in scaffold.tsx standardizes this but many pages
don't use it.

**Fix:** Replace hand-rolled grid divs with `<MobileCardGrid cols={N}>`.

### E. Standardize page headers

**Today:** `MobilePageHeader` exists but only 2 pages use it. Most pages have
no explicit header — the title comes from the mobile shell's nav bar. This is
fine for simple list pages, but hub pages and dashboards would benefit from a
consistent header with title + subtitle + stats band.

**Fix:** Use `MobilePageHeader` on all hub pages (Pattern A) and dashboard
pages (Pattern G) where a subtitle/context line adds value. Don't force it on
simple list pages where the nav bar title is sufficient.

---

## Visual Consistency Checklist (apply to every page)

Every mobile page should pass this checklist:

- [ ] **Suspense boundary** with the correct skeleton type (List/Home/Detail/Form)
- [ ] **`connection()`** called at the top of the async content
- [ ] **Permission gate** — `hasPermission()` check, `MobileNoAccess` if denied
- [ ] **`deletedAt: null`** filter on all master-entity queries
- [ ] **`take: 50-80`** limit on list queries (prevent unbounded fetches)
- [ ] **Serialize Decimals** with `toNum()` before passing to client components
- [ ] **`PageContextProvider`** wrapping detail page content
- [ ] **`RecordRecentItem`** on detail pages (so they appear in "recently viewed")
- [ ] **`ExportShareBar`** on list pages that have exportable data
- [ ] **`MobileFab`** (from scaffold) for create actions — not hand-rolled
- [ ] **`MobileFabModal`** for FAB-triggered dialogs — not hand-rolled
- [ ] **`MobileEmptyState`** when list is empty (not just a blank div)
- [ ] **`MobileNoResults`** when filter returns nothing (distinct from empty)
- [ ] **`error.tsx`** at the module root
- [ ] **`loading.tsx`** at `/new` routes

---

## Migration Priority (by impact)

| Priority | Task | Pages | Effort | Impact |
|----------|------|-------|--------|--------|
| **P0** | Adopt `MobileNewEntityPage` on all `/new` pages | 22 | Low (component exists) | High — fixes 11 missing Suspense, 2 missing perm checks |
| **P0** | Add `loading.tsx` to 3 missing `/new` routes | 3 | Trivial | Medium |
| **P1** | Create `MobileListPage` wrapper + migrate list pages | ~40 | Medium | High — standardizes the most common pattern |
| **P1** | Create `MobileDetailPage` wrapper + migrate detail pages | ~41 | Medium | High — fixes 30 missing RecordRecentItem |
| **P1** | Add `error.tsx` to ~30 missing modules | ~30 | Low | Medium — better error context |
| **P2** | Create `MobileHubPage` wrapper + migrate hubs | 9 | Medium | Medium — standardizes 9 complex pages |
| **P2** | Create `MobileProjectScopedPage` + migrate | 6 | Low-Medium | Low — only 6 pages |
| **P3** | Replace hand-rolled grid divs with `MobileCardGrid` | ~20 | Low | Low — visual polish |
| **P3** | Add `MobilePageHeader` to hub/dashboard pages | ~15 | Low | Low — visual polish |

---

## What NOT to Change

- **`primitives.tsx`** — the warm palette, touch targets, border-over-shadow
  design language is correct and consistent. Don't redesign the primitives.
- **`scaffold.tsx`** — the search header, FAB, filter chips are well-adopted
  (78 files). Don't break the API.
- **`form-primitives.tsx`** — the SectionCard/SelectorCard/UnderlineInput
  pattern is the "holy grail" reference. Don't refactor it.
- **`fab-modal.tsx`** — the spring animation + FAB-anchored origin is correct.
  Don't change the animation.
- **The `?tab=` query-param pattern** for hubs — this is shareable + back-button
  friendly. Don't switch to client-side state.
- **Server-component data fetching** — every page fetches on the server and
  serializes to a client component. This is the correct architecture (no
  client-side waterfall). Don't switch to client-side fetching.

---

## Summary

The component library is 90% there. The problem is **adoption, not design**.
The fix is:

1. **Use the wrappers that already exist** (`MobileNewEntityPage` — 0% adopted)
2. **Create 3 new page-level wrappers** (`MobileListPage`, `MobileDetailPage`,
   `MobileHubPage`) that encode the structural pattern so no page can drift
3. **Add the missing `error.tsx` + `loading.tsx`** files
4. **Standardize via a checklist** that every page must pass

The result: every page looks the same, behaves the same, and a new page can be
created by composing existing wrappers instead of copy-pasting boilerplate.
