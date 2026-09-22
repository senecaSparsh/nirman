# Testing Findings

> Append-only ledger for the parallel deep-audit agents. Format:
> `| module | severity | file | summary |`
> Mark FIXED when a commit on the agent's branch resolves it; mark OPEN for
> bugs the agent could not safely fix in-module.

## Module F — RBAC, tenancy & admin surfaces

All findings below were reproduced end-to-end (real API calls with real
Better-Auth sessions, `AUTH_BYPASS=false`), then fixed and re-verified.
Commits on `test/f-rbac`.

| module | severity                      | file                                                                                                           | summary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------ | ----------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F      | HIGH (FIXED)                  | `apps/web/src/app/api/companies/[id]/members/route.ts`, `.../members/[memberId]/route.ts`                      | Cross-tenant member APIs. Any `users.view`/`users.manage` holder could GET another company's full member list, POST a member into it, PATCH a foreign member's role/scope, DELETE a foreign membership, and read the foreign reporting chain — the handlers checked permission but never that `[id]` was accessible to the actor. Reproduced: OWNER of "My Company" created a membership inside "SRG REALCON" (201). Fixed via `getManageableCompanyIds()` gate (own memberships + descendants) on every handler → foreign requests now 404.                                                                  |
| F      | HIGH (FIXED)                  | `apps/web/src/app/api/companies/[id]/audit/route.ts`, `.../backups/route.ts`                                   | Cross-tenant audit + backup reads — company id was used straight from the URL with only a permission check, leaking other tenants' audit logs and backup records. Fixed with the same manageable-set gate → 404.                                                                                                                                                                                                                                                                                                                                                                                              |
| F      | HIGH (FIXED)                  | `apps/web/src/app/api/delegation/route.ts`                                                                     | Cross-tenant delegation clear. `DELETE` accepted an arbitrary `membershipId` and nulled its delegation columns without checking the row's `companyId` — an admin could rewrite foreign tenants' delegation state (reproduced: 200 on an SRG membership). Fixed: the target membership must belong to the active company → 404.                                                                                                                                                                                                                                                                                |
| F      | HIGH (FIXED)                  | `apps/web/src/app/api/users/[id]/scope/route.ts`                                                               | Cross-tenant membership minting. `PATCH .../scope` called `assignScopedMembership` (which upserts `UserCompany`) with no check that the target user was a member of the actor's company — reproduced: admin of "My Company" pulled an SRG-only user into "My Company" (200, membership created). Fixed: target must already be a member (or carry the company as legacy global `companyId`) → 404.                                                                                                                                                                                                            |
| F      | HIGH (FIXED)                  | `apps/web/src/app/api/role-permissions/route.ts` + `settings-view.tsx`                                         | Global role-permission overrides writable by ordinary OWNER. `RolePermission` rows are **global** (no companyId) — an OWNER could grant e.g. `users.manage` to SUPERVISOR for _every tenant_, and invalid/`CUSTOM_*` role keys silently normalized to SUPERVISOR. The route's own comment said developer-only. Fixed: PUT now requires `User.role === DEVELOPER`, strict role-key validation (only built-in keys, `CUSTOM_*` rejected with a pointer to the custom-roles API), UI entry hidden for non-developers.                                                                                            |
| F      | HIGH (FIXED)                  | `apps/web/src/app/api/users/[id]/route.ts`, `.../members/[memberId]/route.ts`, `packages/services/src/rbac.ts` | **ADMIN could seize the company.** The tier-1 "peer assignment" rule let an ADMIN demote the OWNER to a low tier (reproduced: anita demoted amit OWNER→PM, 200), deactivate them, or delete their membership — the demoted owner then cannot restore themselves (PM lacks `users.manage`) → permanent takeover. Fixed: stripping a member's last tier-1 hat, deactivating, or removing a tier-1 member requires the actor's _own_ role to be OWNER — mirrors the reset-password policy in DECISIONS.md:240. Applied to users PATCH, members PATCH (both paths), members DELETE, and `assignScopedMembership`. |
| F      | MEDIUM (FIXED)                | `apps/web/src/app/api/users/[id]/route.ts`                                                                     | Last-owner guard counted global `User.role='OWNER'` across tenants and ignored ADMIN + secondary hats — could orphan a company or wrongly refuse. Fixed: counts active OWNER/ADMIN-holding memberships (primary + secondary) in _this_ company.                                                                                                                                                                                                                                                                                                                                                               |
| F      | MEDIUM (FIXED)                | `apps/web/src/app/api/companies/switch/route.ts`, `.../api/company/switch/route.ts`                            | Company switching read the global `User.role`, not memberships — a user who OWNED a child company but had global role SUPERVISOR got 403 and could never enter their own company (reproduced with the seeded SRG Infra owner). Fixed: switch allowed iff the user holds an active tier-1 membership somewhere AND holds an active membership in the target company → 200/404/403 verified.                                                                                                                                                                                                                    |
| F      | MEDIUM (FIXED)                | `packages/services/src/rbac.ts`                                                                                | `RBAC_ASSIGN_SCOPE` audit rows were written without `companyId` → scope mutations invisible in the company audit feed. Fixed; rows now carry `companyId` (verified in AuditLog).                                                                                                                                                                                                                                                                                                                                                                                                                              |
| F      | LOW (OPEN — schema hardening) | `packages/db/prisma/schema.prisma` (`UserCompany.delegationEndsAt`)                                            | `timestamp without time zone` + UTC-app-writes convention: expiry checks compare against `new Date()` (UTC instant). Any non-app writer (manual psql, migration) inserting local-time values silently breaks expiry _fail-open_ (an "expired" local-time value can still satisfy `> now`). App writes are consistent; recommend migrating the column to `timestamptz`.                                                                                                                                                                                                                                        |
| F      | LOW (OPEN — UX)               | `apps/web/src/app/api/companies/[id]` PATCH                                                                    | No single-company profile-edit path for an admin who can't see the Companies tab (`/api/company` is GET-only → 405 on PATCH). The Companies tab only renders for multi-company managers, so a single-company OWNER has no UI to edit company profile fields (name/GSTIN/PAN). Confirm intended surface before building.                                                                                                                                                                                                                                                                                       |

## Verified-clean surfaces (negative results, no findings)

- **Custom roles**: scratch + inherit creation (API _and_ real UI dialog), all rejections (no-tier, no-perms, dup key, bad key, bad perm, Developer base, tier≥actor, unheld perms), edit, delete-while-assigned (409), delete unassigned, tier-floor on create/delete. Holders get exactly the granted set — denied surfaces 403 on API and gate on page.
- **Multi-role hats**: secondary-role editing via real UI (desktop hats dialog + mobile AccessSection), hat switcher in nav, `POST /api/me/active-role` rejects unheld/DEVELOPER roles, permissions follow the _worn_ hat only (finance gated as SUPERVISOR, open as ACCOUNTANT), scope does not widen on switch, stale hat falls back to primary.
- **Scope enforcement**: COMPANY/DEPARTMENT/PROJECT all enforced — lists filtered, out-of-scope ids 404, foreign project/department ids rejected, empty scoped entries rejected, foreign reporting manager rejected, cycles rejected, actor can't grant beyond own scope ceiling, scoped members can't mint wider memberships.
- **Delegation**: full chain verified — create → delegatee performs delegated action with `onBehalfOfId` audit → expiry auto-revokes → self-delegation/loops/tier-floor/cross-company/field-tier delegates all rejected → admin clear restricted to own company.
- **Tenant isolation**: members/audit/backups/users/companies all reject foreign ids (404); `GET /api/users/[id]/activity` is tenant-filtered; companies list shows only memberships + descendants; group admin (SRG) can manage child but nothing outside.
- **Member lifecycle**: password reset (hierarchy: HR can't reset ADMIN, ADMIN can't reset OWNER, owner-only for tier-1), mustChangePassword forced-change flow (sign-in → forced /change-password → cleared), deactivate blocks sign-in outright, reactivate restores, self-demotion/removal blocked, last-tier1 demote blocked, unlock/verify-phone/reset all tenant-checked.
- **Per-user permission overrides**: grant → surface opens, revoke → closes, can't grant unheld perms, can't edit peers, bad keys 400, cross-tenant 404.
- **DEVELOPER role**: absent from every picker (desktop selects, hats dialog, mobile), rejected by users/members/bulk/custom-role APIs, `active-role` switch rejects it.
- **Audit**: every mutation writes an `AuditLog` row with `companyId` + `onBehalfOfId` where delegated (USER_ROLE_CHANGE, USER_PERMISSIONS_UPDATE, CUSTOM_ROLE_*, USER_CREATE, USER_PASSWORD_RESET, RBAC_ASSIGN_SCOPE all observed).
- **Data hygiene**: no rendered `@nirman.internal` emails on desktop or mobile (displayEmail masking works); no DEVELOPER text visible; dead-button spot-checks on settings tabs all opened working dialogs (custom role, hats, scope, permissions, reset, delegation, bulk import).
- **Console**: no app errors on visited pages; only expected 403/404 network denials from role-gated widget probes and a benign Next.js CSS preload dev warning.

## Notes for other agents

- `POST /api/users/bulk` rejects OWNER/DEVELOPER rows — intentional.
- `delegationEndsAt` UI writes UTC; expiry checks are consistent within the app.
- Company switching: non-tier-1 members get 403 (can't switch at all); tier-1 members get 404 for non-member companies.
- Several seed users have global `User.role` ≠ membership role — per-company membership is authoritative everywhere.

## Module D — Sales, land, collections & customer portal

All findings reproduced end-to-end with real Better-Auth sessions
(`AUTH_BYPASS=false`, cross-tenant attacker `karan@nirman.in` SALES_MANAGER in
"My Company" vs "SRG REALCON" victims), then fixed on `test/d-sales` and
re-verified against the live dev server. Commits `cf9befb2`, `8648d1fe`.

| module | severity                 | file                                                             | summary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------ | ------------------------ | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D      | HIGH (FIXED)             | `apps/web/src/app/api/sales/[id]/print/route.ts`                 | Cross-tenant printable-sale IDOR. Route called `getPrintableSaleData(id)` without a companyId — the service's company filter is optional, so any `sales.view` holder could read another tenant's full sale record: customer PII, pricing, every payment, and all document URLs. Reproduced: My Company SALES_MANAGER pulled SRG REALCON sale `SAL-SRG-20260915-0001` incl. ATS/registry/allotment upload links. Fixed: route now resolves `getCompany()` and passes `company.id` → foreign ids 404, own ids 200.                                                                                                                                                                                                                                                                                           |
| D      | HIGH (FIXED)             | `apps/web/src/app/api/land-parcels/route.ts` (POST)              | Guard-bypass cross-tenant write. The ownership gate checked `body.parentParcelId ?? body.parcelId` — a caller could pass an OWNED parentParcelId as decoy plus a FOREIGN parcelId; the check validated the decoy while `updateParcelDetails`/status/valuation mutated the victim. Reproduced: My Company user renamed an SRG parcel (`PLOT-1` → `D-HACKED`, 200). Fixed: every parcel id present in the body must pass the company+scope check → 404.                                                                                                                                                                                                                                                                                                                                                      |
| D      | HIGH (FIXED)             | `apps/web/src/app/api/payment-schedules/route.ts` (POST)         | Cross-tenant receivable rewrite + broken create path. POST had no ownership check on `assetSaleId` and `createSalePaymentSchedule` DELETES any existing schedule before inserting — an attacker could wipe/replace another tenant's installment plan (foreign attempt only failed by accident on the GST bug below). Separately, `generatePaymentSchedule` recomputed a hypothetical GST (5%×2/3 residential / 18% commercial) and validated items against `salePrice + recomputedGST`, while the canonical validator requires `salePrice + sale.gstAmount` — so the route 400'd on ~every real sale (reproduced on a ₹1.5Cr zero-GST sale: expected 15,000,000 got 15,500,000). Fixed: company+scope check → 404 foreign; generator now distributes `salePrice + sale.gstAmount` → 201 verified own-sale. |
| D      | MEDIUM (FIXED)           | `apps/web/src/app/api/milestone-payments/check/route.ts`         | Unchecked `projectId` — `checkMilestonePayments(projectId)` sweeps a project's CLP schedule items and marks them DUE (customer-facing state + reminders). Only `sales.view` was required, so any tenant could trigger the sweep on another tenant's project. Fixed: project must belong to caller's company → 404 foreign, 200 own.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| D      | MEDIUM (FIXED)           | `packages/services/src/sale.ts` (`sellAsset`)                    | Cross-tenant broker attach — `brokerId` was persisted verbatim. Reproduced: My Company user created a sale carrying SRG's broker row (`D-SRG Broker` + ₹60k commission) → the victim's broker record now references a foreign sale. Fixed: broker must belong to input.companyId → "Broker not found".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| D      | MEDIUM (FIXED)           | `apps/web/src/lib/portal-auth.ts`                                | Portal session cookie was `customerId.hmac` with NO embedded expiry — the 7-day `maxAge` is enforced only by the browser, so a captured cookie replayed forever. Fixed: signed payload is now `customerId.expiresAt.hmac`; `verifyPortalCookie` rejects expired/tampered values server-side (old-format cookies fail closed). Unit tests updated + fake-timer expiry test.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| D      | MEDIUM (FIXED)           | `packages/services/src/gl-posting.ts`, `crm.ts`, `built-unit.ts` | Audit `companyId` gaps (same class F fixed for RBAC rows): `JOURNAL_ENTRY_POST`, `SCHEDULE_PAYMENT_RECORD`, `BUILT_UNIT_STATUS_CHANGE` rows carried `companyId: null` → invisible in the per-company audit feed. Fixed at all three call sites.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| D      | LOW (FIXED)              | `packages/services/src/sale.ts`                                  | `AssetSale.createdById` (+ `@@index`) existed but `sellAsset` never wrote it — salesperson attribution / "my deals" views had nothing to key on. Fixed: `createdById: input.userId`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| D      | LOW (OPEN — design note) | `apps/web/src/lib/portal-auth.ts` (`signPortalPreauthToken`)     | Pre-auth token (OTP-verified phone proof) claims "single-use" in comments but is replayable within its 5-min TTL — replay mints another portal session for a DIFFERENT customer on the same verified phone. Impact is bounded (token is phone-bound and short-lived; can't cross phones), but the single-use contract isn't enforced — would need a usedAt marker or nonce store to fix honestly.                                                                                                                                                                                                                                                                                                                                                                                                          |
| D      | LOW (OPEN — UX)          | `apps/web/src/app/sign-in` flow                                  | Desktop sign-in lands on `/login` which renders the app shell around a "Page not found" panel instead of routing to `/today` (mobile correctly lands on `/m/home`). Cosmetic dead-end after every password login.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| D      | LOW (OPEN — UX)          | `apps/web/src/app/api/sales/route.ts`                            | `?mine=1` is silently ignored (returns all company sales) and no UI ever used it — dead parameter; harmless but dishonest. Consider implementing or removing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

## Verified-clean surfaces (negative results, no findings)

- **Lead→booking→collection→GL chain** (real API, then mobile UI): lead create
  → activity → stage machine (NEW→CONTACTED→SITE_VISIT enforced; NEW→NEGOTIATION
  rejected 409) → convert (customer created, lead→BOOKED) → unit HOLD → sale →
  deposit ₹5L → unit RESERVED → schedule (25/25/50 of ₹47.25L) → installment
  collect → completion (final payment + registry doc gated — 400 without it) →
  unit SOLD, sale COMPLETED/PAID, saleDeedNo stored.
- **Deposit-as-liability accounting**: deposit posts Dr Cash / Cr Customer
  Deposits–Unearned (2500); installments pre-completion same; on completion
  Dr AR / Cr Revenue+OutputGST, Dr COGS / Cr Unsold Assets, and
  Dr Customer Deposits / Cr AR settlement — every JE balanced, reconciles to
  4,725,000 collected = price+GST.
- **Unit status machine**: AVAILABLE→HOLD→(RESERVED on deposit)→SOLD enforced;
  SOLD→AVAILABLE rejected; PENDING-sale cancel releases unit (saleId cleared);
  HOLD release works on parcels; completed-sale cancel rejected ("process a refund").
- **Material sale**: qty issued via ledger (230→220), MAC COGS 1,345.70,
  revenue 4,000 + GST 720 posted, grossProfit computed, both JEs balanced.
- **Broker chain**: broker list tenant-isolated; commission accrual +
  BROKER_COMMISSION_PAID JE; double-pay rejected.
- **Parcel chain**: partition 5000→2500+2500 (parent PARTITIONED, PRO_RATA),
  valuation update, booking against child parcel (locked via saleId).
- **TDS**: auto 1% ≥₹50L verified on seed sales (65L→65,000; 50L→50,000); <50L
  sales get null.
- **Tenant gates re-verified**: sales GET/PATCH, sale document POST,
  cheque POST, schedule GET/POST, schedule-item pay, pay-commission,
  leads GET/POST/PATCH/DELETE/convert, customers detail, built-units PATCH,
  e-invoice generate/cancel, uploads GET (uploader/company/membership/portal-
  own-doc) — all 404/403 on foreign ids.
- **sales.view boundary**: ACCOUNTANT reads list+detail (200) but every mutation
  403 — sale create, sale payment, lead create, parcel status.
- **Customer portal**: OTP send (3/10min cap → 429), 5-attempt cap → 429,
  one-time codes (reuse → "Invalid or expired"), tampered/unsigned cookies →
  401, shared-phone multi-customer select requires pre-auth (401 without, 403
  on mismatched phone), portal cookie rejected on staff APIs (401) and staff
  cookie rejected on portal APIs (401), `/portal/sales` strictly customerId-
  scoped (Alice sees only D-SALE-PORTAL-1), uploads limited to own-sale docs
  (403 foreign), dashboard shows honest empty state for no-booking customers.
- **Audit**: every mutation writes AuditLog with companyId (LEAD__,
  ASSET_SALE__, SALE_SCHEDULE_CREATE, SCHEDULE_PAYMENT_RECORD,
  LAND_PARCEL_UPDATE — which even captured the parcel exploit before/after).
- **Console**: no app errors; only expected 401 on `/api/me` pre-login SWR
  (both surfaces) — benign.

## Data notes for other agents

- D-tagged fixtures left in DB: customers `D-Portal Alice/Bob`, `D-Shared MyCo`,
  `D-Shared SRG` (shared phone +91 9800010003); brokers `D-SRG Broker` (SRG),
  `D-MyCo Broker`; sale `D-SALE-PORTAL-1` (S-01); completed sale
  `SAL-20260922-0001` (S-02 SOLD); `SAL-20260922-0002..4`; parcels `D-C1/D-C2`
  under MyCo `PLOT-1` (cmu1d37m5); sale `SAL-20260914-0001` CANCELLED during
  release-test; SRG parcel renamed during exploit was restored to `PLOT-1`.
- Dev server note: it serves the CHECKED-OUT branch — concurrent agent branch
  flips will serve unfixed main; verified on `test/d-sales`.

## Custom roles — scratch/inherit builder + bounded delegation (verified 2026-09-22)

- **Mobile builder added** (commit 2a37f9e3): `/m/settings/company` → Members & Access
  → "Custom Roles" block — list (extends/tier + perm counts), edit, delete, and a
  bottom-sheet builder with the same two modes as desktop ("Start from a role" /
  "Build from scratch"). `/m/settings/team` redirects to `/m/hr/employees` — this
  block is the only mobile create path.
- **Loader widened**: `loadCompanyProfileData` now selects
  id/baseRole/description/permissions on customRoleRows (additive — narrower
  consumer prop types unchanged).
- **Entry gate**: POST /api/custom-roles requires `users.manage` — `hr.manage`
  alone cannot create roles (HR_MANAGER carries users.manage natively, t3).
- **Bounded delegation verified LIVE** — created CUSTOM_DEPT_ADMIN (t3 scratch,
  {users.view, users.manage, hr.view, hr.manage}), hatted on Test Worker Sharma,
  switched his active hat: /api/me resolved exactly those 4 perms (31 supervisor
  perms fully dropped). As that actor:
  - t4 scratch {hr.view} → 200 (Site Clerk)
  - t4 + finance.manage → 403 "can't grant permissions you don't have"
  - t3 peer / t2 above → 403 tier guard
  - inherit PROJECT_DIRECTOR (t2 base) → 403 base-authority guard
  - inherit SITE_ENGINEER (t4) + extra → 200 (InhSE)
  - t4 {users.manage,...} → 200 (MiniAdmin — chain delegation, further bounded)
  - self-member PATCH → 403 (can't manage a member holding a t3 hat — peers)
- **Tier/H-level/parent model**: `tier` = authority ladder (stored on role, DB-
  resolved both actor+target sides); `hierarchyLevel` = org-tree depth, clamped
  ≥ tier on create; roles have no parent — reporting lines are per-member.
- **Resolution**: scratch (baseRole null) → effective set is exactly the granted
  list; inherit → base matrix + extras. Actor side resolves CUSTOM_* via
  getActingRole → resolveCustomAuthorityRole (declared tier → authority built-in).

## Module A — Procurement → Inventory → Stock lifecycle

All findings reproduced end-to-end with real Better-Auth sessions
(`AUTH_BYPASS=false`, `amit@nirman.in` OWNER / `anita@nirman.in` ADMIN /
`a-store@test.in` STORE_KEEPER·PROJECT-scope→Greenfield / `a-proc@test.in`
PROCUREMENT_MANAGER·PROJECT-scope→Greenfield in "My Company" vs "SRG REALCON"
victims), then fixed on `test/a-procurement` and re-verified live.

| module | severity           | file                                                                                                         | summary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------ | ------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A      | HIGH (FIXED)       | `apps/web/src/app/api/stock-counts/[id]/route.ts` (PATCH)                                                    | **Cross-tenant stock-count mutation.** Confirm+reconcile had only a permission check — a My Company user confirmed and reconciled an SRG DRAFT count, adjusting SRG steel stock 40→39 with a stock movement + GL journal posted under the foreign company (the My Company user recorded as actor). Fixed: findFirst requires `companyId` + `location.companyId` anchor → 404; create/list/detail also scoped (POST location company+scope, GET list/detail via location company + `assertScopeAllows`-equivalent checks). Re-verified: foreign confirm/reconcile → 404, stock + status unchanged. |
| A      | HIGH (FIXED)       | `apps/web/src/app/api/scrap-generations/[id]/route.ts` (PATCH)                                               | **Cross-tenant scrap cancellation.** Cancel called `cancelScrapGeneration(id)` with no ownership check — reproduced: My Company user cancelled an SRG COMPLETED scrap, posting reversal movements + journal entries in the victim tenant. Fixed: company + `scopeWhere("ScrapGeneration")` check → 404.                                                                                                                                                                                                                                                                                           |
| A      | HIGH (FIXED)       | `packages/services/src/procurement.ts` (`receiveGoods`)                                                      | **Decoy `materialId` in GRN lines.** Route authorized the PO, but the receipt line carried an arbitrary `materialId` — reproduced: a My Company PO line for A-Steel accepted SRG `STL-001`, planting foreign-material stock + cost change at a My Company warehouse, incrementing `qtyReceived`, and posting GL against the foreign material. Fixed: `line.materialId === poLine.materialId` enforced → 400. Also added the same mismatch guard implicitly through poLine lookup — foreign poLineId decoys can't resolve.                                                                         |
| A      | HIGH (FIXED)       | `apps/web/src/app/api/issue-materials/route.ts` (POST)                                                       | **Scoped issue drains out-of-scope stores.** The route scoped only the consumption TARGET (project/department) — a Greenfield-scoped STORE_KEEPER issued 5 units FROM Hillview (stock 600→595), bypassing the transfer+gate-pass control path. Fixed: `assertScopeAllows` on the source location's project/department → 403. Re-verified: 403 + stock unchanged.                                                                                                                                                                                                                                  |
| A      | HIGH (FIXED)       | `apps/web/src/app/api/purchase-orders/[id]/receive/route.ts`                                                 | **Scoped receiver could accept any PO.** Receive checked company but not project scope — reproduced: Greenfield-scoped PROCUREMENT_MANAGER received on a PROJECT-scope PO destined for Hillview (201, GRN created + stock posted). Fixed: receive gate now requires the PO visible under `scopeWhere("PurchaseOrder")` → out-of-scope 404; reject path same. Intentional carve-out preserved: fully company-level POs (no project, warehouse destination) remain receivable by scoped receivers at shared warehouses — verified.                                                                  |
| A      | HIGH (FIXED)       | `apps/web/src/app/api/transfers/route.ts`, `.../transfers/[id]/route.ts`                                     | **Scoped users saw/mutated out-of-scope transfers.** Transfers have no direct projectId — the list returned all in-company transfers, and a Greenfield-scoped user could GET/dispatch a Hillview↔Tower-A transfer. Fixed: scope filter resolves each transfer's location pair (either endpoint in-scope = visible for inter-site flows; mutations require source-side scope) → list filtered, detail/dispatch/cancel → 404/403. Re-verified end-to-end.                                                                                                                                           |
| A      | MEDIUM (FIXED)     | `apps/web/src/app/api/site-stock-valuation`, `project-commitments`, `vendor-ratings/[id]`, `gate-entry/next` | **Four cross-tenant read leaks.** All took id params with no company check — reproduced from My Company against SRG ids: site-stock-valuation (per-location qty+value), project-commitments (PO pipeline exposure), vendor-ratings (supplier scorecards), gate-entry/next (next sequence number — sequence enumeration). Fixed: every anchor (project/supplier/location) must belong to the active company + pass scope → 404 ×4 verified.                                                                                                                                                        |
| A      | MEDIUM (FIXED)     | `apps/web/src/app/api/stock-counts/route.ts` (GET list + POST), `.../[id]` (GET/DELETE)                      | **Scoped stock-count visibility.** List showed all company counts; a scoped user could create/see/confirm counts at out-of-scope locations. Fixed: location-anchored scope checks on create (403 out-of-scope verified), list filtered to in-scope locations, detail/confirm/reconcile/delete all require scope → out-of-scope 403/404 verified.                                                                                                                                                                                                                                                  |
| A      | MEDIUM (FIXED)     | `apps/web/src/app/api/stock/available/route.ts` + `stock/route.ts` + `stock-locations/route.ts`              | **Out-of-scope stock reads.** `?locationId=` of an out-of-scope site returned its stock rows; stock-location list showed every site. Fixed: location filters now require in-scope location → 200 `[]` (safe empty denial) for out-of-scope; list scoped to assigned projects/departments (verified: Hillview hidden).                                                                                                                                                                                                                                                                             |
| A      | MEDIUM (FIXED)     | `apps/web/src/app/api/supplier-returns/route.ts` (POST) + `.../[id]` (GET/PATCH/DELETE)                      | **Scoped supplier-return writes/reads.** POST accepted any in-company location (stock + GL write at out-of-scope stores); `[id]` mutations had no scope. Fixed: POST asserts scope on the location → 403 verified; `[id]` requires `scopeWhere("SupplierReturn")` → 404 verified.                                                                                                                                                                                                                                                                                                                 |
| A      | MEDIUM (FIXED)     | `apps/web/src/app/api/scrap-generations/route.ts` (GET + POST)                                               | Scrap list showed all company scraps to scoped users; POST allowed generating INTO an out-of-scope location (plants stock where the caller can't audit). Fixed: list filtered by `scopeWhere("ScrapGeneration")` (projectId); POST asserts scope on projectId AND destination location → 403 verified.                                                                                                                                                                                                                                                                                            |
| A      | MEDIUM (FIXED)     | `apps/web/src/app/api/direct-purchases/route.ts` (GET + POST) + `.../[id]`                                   | Same class — list/detail/cancel now apply `scopeWhere("DirectPurchase")` (via `location.projectId`/`departmentId`); POST asserts scope on the receive location → 403 out-of-scope verified.                                                                                                                                                                                                                                                                                                                                                                                                       |
| A      | MEDIUM (FIXED)     | `apps/web/src/app/api/gate-passes/route.ts` (POST)                                                           | Manual gate passes checked `projectId` scope but not the gate LOCATION — a scoped user could cut a pass at another project's site (stock exits unaudited there). Fixed: location's project/department must be in scope → 404/403 verified (Greenfield pass 201 still works).                                                                                                                                                                                                                                                                                                                      |
| A      | MEDIUM (FIXED)     | `apps/web/src/app/api/quotes/[id]/route.ts` (GET/PATCH/DELETE) + `.../select/route.ts`                       | **Quote scope gap.** Quotes anchored company-only via requisition/quotationRequest — a scoped user could read/edit/delete/SELECT a quote on an out-of-scope indent (select auto-converts to PO → mutation on the out-of-scope indent). Fixed: `assertScopeAllows` on the linked requisition's project/department (or quotationRequest project) → 403 verified on all four handlers.                                                                                                                                                                                                               |
| A      | MEDIUM (FIXED)     | `apps/web/src/app/api/stock-locations/[id]/route.ts` (PATCH)                                                 | **`projectId` wiped on partial update.** PATCH of only an address nulled an existing site-store's `projectId` (omitted field treated as explicit clear) — silently breaking scope enforcement on that location afterward. Fixed: distinguish omitted vs explicit-null; project linkage preserved on partial PATCH → verified.                                                                                                                                                                                                                                                                     |
| A      | MEDIUM (FIXED)     | `packages/services/src/stock-count.ts`, `scrap.ts`                                                           | **Audit `companyId` gaps** (same class as D/F findings): `STOCK_COUNT_*` and `SCRAP_*` log rows carried `companyId: null` → invisible in per-company feed + cross-tenant readable via the audit route's `OR companyId null`. Fixed: explicit `companyId` at all Module A call sites (issue/transfer/procurement already had it).                                                                                                                                                                                                                                                                  |
| A      | MEDIUM (FIXED)     | `apps/web/src/app/api/audit/route.ts`                                                                        | **`companyId: null` rows visible to EVERY company admin** — the `OR: [{companyId: mine}, {companyId: null}]` clause leaked unattributed audit metadata (entityIds, actor names, before/after payloads) across tenants. Fixed: null-company rows now require the actor to hold a membership in the caller's company (`user.memberships.companyId`) — cross-tenant leak closed, own-company legacy rows still visible.                                                                                                                                                                              |
| A      | LOW (FIXED)        | `apps/web/src/lib/server.ts` (`assertScopeAllows`)                                                           | Scope violations threw plain `Error` → 500 where callers didn't wrap it (observed: scoped scrap POST → 500). Now throws `ForbiddenError` → apiHandler maps 403 everywhere — wrapped callers unchanged (still `instanceof Error`).                                                                                                                                                                                                                                                                                                                                                                 |
| A      | INFO (design note) | `packages/services/src/requisition.ts` quote gate                                                            | Selecting a winning quote bypasses `minQuotesRequired` (a SELECTED quote IS the buy decision — documented intent in code comments). Verified live: 2/3 quotes + select → PO created. This is an authorized approver override, not a bug — flagging for product review.                                                                                                                                                                                                                                                                                                                            |
| A      | INFO (verified)    | `packages/services/src/procurement.ts`                                                                       | 10-second same-user same-PO GRN dedupe correctly rejects double-submit ("Wait a few seconds") — kept; second receipt succeeds after window.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| A      | INFO (verified)    | `apps/web/src/app/api/...`                                                                                   | Scoped-reader empty-result semantics: `/api/stock/available` + `/api/stock?locationId=` return `200 []` for out-of-scope locations (safe denial — no data). Deliberately kept over 404/403 to match existing list-filter UX.                                                                                                                                                                                                                                                                                                                                                                      |

### E2E business chains verified live (My Company, real sessions)

- **Indent→quotes→select→PO→GRN→stock+GL**: requisition (Greenfield, 50×A-Steel) → auto-submit+approve → 2 quotes → select winner → **auto-converted to ORDERED PO** (58/unit, 18% GST) → GRN 20 (PARTIAL) → GRN 30 (RECEIVED) → `StockLocationItem` 50 @ MAC 58 → GL **Dr Inventory 2900 + Dr Input GST/ITC 522 / Cr AP 3422**; over-receipt → 400; decoy-material GRN → 400.
- **Issue→gate-pass→execute→cancel**: requireGatePass issue → PENDING (stock untouched) → execute pre-approval → 403 → GP approve → **auto-executes** (stock 50→40, movement + GL) → cancel → **stock restored + reversal JE**.
- **Transfer**: create WH→Greenfield → GP auto-created PENDING → dispatch pre-approval → 400 → approve → dispatch (IN_TRANSIT, source debited 30→20) → complete (COMPLETED, dest credited 10) → TRANSFER_OUT+TRANSFER_IN movements; insufficient-stock dispatch correctly blocked.
- **Supplier invoice→approve→payment**: invoice vs received PO → PENDING (payment blocked until APPROVED — correct gate) → approve → pay 1000 (Dr AP 1000 / Cr Cash 1000, supplier balanceOwed 4142→3142) → overpayment 99999 → 400 → remaining 2422 paid.
- **Stock count**: create(47/50)→confirm→reconcile → stock 50→47 + adjustment JE.
- **Scrap**: create(+2 into WH) → cancel → stock reversed 22→20 + reversal JE.
- **Supplier return**: draft→submit→complete blocked by PENDING GP → approve GP → complete → stock 20→15 + GL.
- **Audit**: Module A mutations now write `companyId` — verify in `/api/audit` feed.

### UI verified (Playwright, real session cookie, zero pageerrors)

- **Desktop 1280×900**: /stock, /stock-movements, /stock-counts, /transfers, /procurement, /requisitions, /suppliers, /gate-passes, /scrap-generations, /materials, /supplier-returns, /direct-purchases, /vendor-ratings, /quotes — all 200 with content.
- **Mobile 390×844**: /m/stock, /m/procurement, /m/requisitions(→?tab=indents), /m/suppliers, /m/gate-pass, /m/materials, /m/material-issues, /m/stock-counts(→tab=counts), /m/transfers(→tab=transfers), /m/scrap-generations(→tab=scrap), /m/supplier-returns(→tab=returns), /m/stock-out — all render real data (redirects are intentional tab consolidation).
- Note: `/material-issues` is mobile-only (no desktop page — 404 by design; `/m/material-issues` renders on desktop too).

### Data notes for other agents

- A-tagged fixtures used throughout (A-Steel `cmud1finf0005vlxuwyoyutfy`, A-TestAgg `cmud1fiog0009vlxu8wtf6l3m`, A-Vendor `cmud1fjda000dvlxuway3cjfm`, A-Vendor2 `cmud2967o006svls8w7m5t8a1`).
- Test pollution left: chain-1 PO `PO-20260923-0003` fully received (50×A-Steel @ Greenfield Site, ₹3422, invoice `A-INV-001` PAID 3422); `PO-20260923-0004/0005` (Hillview fixtures cancelled/cleaned); company-PO `cmud1i57p001avlxu9t55ow76` has an extra 1-unit GRN from the carve-out verification.
- Scoped test users: `a-store@test.in` (STORE_KEEPER→Greenfield), `a-proc@test.in` (PROCUREMENT_MANAGER→Greenfield), `f-hat@test.in` (SUPERVISOR→Hillview) — all password `Crawl123!`.

## HR audit round 2 — lifecycle + self-service (verified 2026-09-22/23)

- **Leave self-service chain** (verified live): worker filed SICK leave via
  /m/me → owner saw it in /api/leaves?status=PENDING → approved → PAID_LEAVE
  rows minted for both days → "Leave Approved" InAppNotification to requester.
- **scopeWhere 500 fix** (3af7ba6a): LeaveRequest mapped projectId (column
  doesn't exist) — every scoped caller got PrismaClientValidationError → 500.
  Audited all 58 SCOPE_FIELDS mappings — only invalid one.
- **PAID_LEAVE overwrite hole** (b799a1f4): PATCH blocked PAID_LEAVE edits but
  recordAttendance's upsert + bulkRecordAttendance clobbered the row — leave
  balance consumed while the paid day silently became PRESENT/ABSENT. Both
  paths now refuse (single → 409, bulk → loud SKIPPED_PAID_LEAVE in results).
- **Offboarding** (verified live): POST /api/employees/[id]/terminate →
  active:false + EmployeeExit (F&F ₹12.5k COMPLETED, 4-day encashment, assets
  returned, exit interview, PF/ESI exit filed) + history preserved.
- **Mobile Departments** (2cc03928): create + activate/deactivate — needed for
  dept-scoped custom roles; desktop-only before.
- **Worker attendance strip** (6f387c2c): last-14-day status cells on /m/me —
  "did they mark me right?" the day-count couldn't answer.
- **Login/OTP** (64ec7be4): OTP link hidden when provider unconfigured, send
  503s honestly, added password escape on the verify screen.
- **Bounded delegation** (verified live): CUSTOM_DEPT_ADMIN t3 {users.manage,
  hr.*} could only mint t4-t5 roles with subsets of his own 4 perms — every
  guard (scope/tier/base) fired; can't even edit a member holding a t3 hat.
- **Noted gap (not built)**: no compliance-doc expiry — Employee documents are
  generated artifacts (offer/agreement/ID); there's no licence/medical-fitness
  expiry field or reminder. Worth a schema feature if drivers/operators need
  it — drivingLicenceExpiry on Employee + integrity-cron reminder.

## Owner cockpit sweep (verified 2026-09-23)

- **Assistant** (text + mobile voice): real data across stock/approvals/
  payroll/attendance; Hindi + Hinglish parse; per-intent permission gates
  deny naming the missing perm; UNKNOWN → graceful help. One NLU misfire
  noted ("who is working" → WORK_ORDER_LIST instead of ATTENDANCE_TODAY) —
  gate still fails closed.
- **Global search** (mobile header): cross-entity — "cement" hits pages,
  3 material SKUs, 3 suppliers.
- **Approvals queue** (/m/approvals): 13-item radar — POs with age badges,
  gate passes, expenses, RA bill; expand → Approve verified live (13→12,
  auto-orders + queue advance). Reject carries reason, batch approve exists.
- **Alerts**: /m/alerts → lease-expiry only surface; severity buckets
  EXPIRED/CRITICAL/WARNING/INFO at ≤30/60/90d, worst-first, digest-deduped.
- **Integrity cron**: 15 drift checks (H1/tier-1, stale hats, reportsTo
  cycles+inversions, phantom roles, dept orphans, stale offsite reviews)
  → tier-1 digest; refuses to run without CRON_SECRET (fail-closed).
- **Reports hub** (/m/reports): exec P&L — inventory ₹28.23L, revenue
  ₹65.25L received vs ₹3.02Cr booked (honest methodology note), net profit
  ₹4.17L; GST report ITC vs output → net payable ₹1.43L with monthly +
  per-PO taxable detail.
- **Notification links**: /m/ paths resolve per-surface — desktop viewers
  land on desktop routes.
- **Auto-Deposit**: setup-deposit validates IFSC (400 on bad) →
  onboardingComplete auto-flips (12/12 promotion verified on test worker).
- **Notification bell**: 30s poll, unread dots, mark-read, deep links.

## Mobile surface + security sweep (verified 2026-09-23)

- **Full mobile route sweep**: all 72 /m/* routes → 200 as OWNER. Only
  miss: bare /m/dev had no index → now redirects to /m/dev/errors
  (de621289, same convention as /m/alerts).
- **/m/me profile-save bug** (69c8596f): the edit sheet always sent
  `phone` in PATCH /api/me/profile — the API loudly 400s (phone is the
  OTP login identity; changes go through HR's conflict-checked assign).
  Every profile save failed. Phone now read-only + dropped from body.
  Verified: name-only → 200, phone-in-body → 400 (guard preserved).
- **Cross-tenant**: as My Company OWNER, SRG employee + PO → 404,
  employee list shows only own 8 — zero leakage.
- **Attachments**: magic-byte MIME sniffing, 25MB cap, auth+company-gated
  retrieval, upload→attach→list→serve→delete verified end-to-end.
- **Upload surface**: storage outside public/, UPLOAD_DIR persistence
  mount, no executable types.
- **Deactivation**: full teardown — sessions killed, pending approvals
  reassigned, tasks cancelled, assignments + phone numbers released.
- **HR phone-assign**: login moves with the company number, conflict-
  checked against other users' login (409), audit-logged.
- **Accounts hub**: Tally radar (53 pending + Snooze), payables ₹8.75L,
  live activity feed, GL/petty-cash/claims tabs.
- **Stock counts**: draft/reconciled + mismatch deltas; desktop
  /stock-counts/[id] deep-link stub (d6fcaf38 — detail is a dialog).
- **Dev-server note**: two memory-threshold self-heal restarts observed
  during a 49-route cold-compile sweep — wrapper recovered cleanly each
  time (health 200). Dev-only; prod has the start-wrapper monitor.

## Module B — Finance, payroll-adjacent & accounting sweep (verified 2026-09-23)

### Cross-tenant holes reproduced → fixed

All reproduced live as `priya@nirman.in` (My Company ACCOUNTANT) against
SRG REALCON, and as `a-proc@test.in` (project-scoped) against out-of-scope
own-company projects. Every one now fails closed.

- **Project financial reports (5 routes)**: `/api/budget-variance`,
  `/api/job-costing`, `/api/profit-center`, `/api/cash-flow`,
  `/api/cost-overrun` took a bare `projectId` and the services looked the
  project up by id only — a foreign tenant's project returned its full
  P&L / budget variance / cash forecast / overrun data. Both layers now
  gate: routes run `getCompany` + `assertScopeAllows`; services take a
  required `companyId` and `findFirst({ id, companyId })` → 404.
  (finance-advanced.ts, scheduling.ts + the 5 routes; mobile report
  callers updated.)
- **Project-cost create/delete**: `addProjectCost` trusted `projectId`
  (`findFirst({id, deletedAt})` — no company) → a ₹7,777 cost + balanced
  WIP/Cash journal landed inside SRG's books. `deleteProjectCost`
  deleted by id only → removed SRG's seeded ₹72,000 RA-bill cost
  (restored afterwards). Both now take `companyId`; delete also requires
  the row's project to be in-scope. Subcontractor ref is company-checked
  too. PATCH re-anchor validated: own ₹2.5L cost was moved onto the SRG
  project — the [id] route now 404s when the target project isn't ours,
  and a missing/foreign id 404s instead of the old bare-Error 500.
- **Expense claims**: foreign `projectId` (header) and `categoryId`
  (lines) stored verbatim → claim approved into an APPROVED expense on
  SRG's project. `createExpenseClaim`/`addClaimLine` now validate both.
- **Recurring expenses**: foreign project/category/supplier ids accepted
  and inherited by every auto-generated draft expense.
  `createRecurringExpense` validates all three.
- **Expense budgets**: `setExpenseBudget` stored foreign project/category
  ids. Validated now; [id] DELETE returns 404 instead of `{ok:true}` on
  foreign/missing ids (same for recurring-expenses [id] PATCH/DELETE).
- **Petty cash scope**: project-scoped FINANCE user could spend/top-up a
  float whose project was outside their scope (list hid it, mutations
  didn't). Spend + topups routes apply `scopeWhere("PettyCashFloat")` →
  404 out-of-scope.

### Workflow / accounting defects reproduced → fixed

- **Supplier-invoice double-approve**: PATCH {action:"approve"} had no
  status guard — re-approving re-posted the full JE (Dr expense / Cr AP)
  and re-incremented `Supplier.balanceOwed`; a PAID invoice regressed to
  APPROVED. Now PENDING/DISPUTED → approve, PENDING → reject only; else 409. Verified: second approve → `Invoice is already approved`.
- **Supplier-payment double-submit**: identical repeat POSTs within
  seconds each created a payment + JE. 15s same-(supplier, amount, mode,
  user) window → 409 (`SP-… already recorded`). ReferenceNo dedupe stays.
- **Employee advances posted no GL**: issuing an advance created a ledger
  row with no journal (cash left silently); payroll recovery credited
  `recoveredAmount` but left the deduction inside 2200 Salaries Payable
  forever. Added `1650 Advances to Employees` (+`ensureGlAccount` for
  already-seeded tenants). Issue → Dr 1650/Cr 1000; payroll recovery →
  Dr 2200/Cr 1650 (clears the phantom payable, nets the receivable);
  manual SETTLED → Dr 1000/Cr 1650; CANCELLED → Dr 6000/Cr 1650 write-off.
  Verified live end-to-end: ₹1,200 issue JE + ₹1,400 recovery JE from a
  July payroll covering two advances.
- **Expense overflow**: `amount=1e18` crashed Prisma → 500. `createExpense`
  now 400s above numeric(14,2) max.
- **Audit trail gaps**: `logAction` calls in supplier-payment/invoice,
  project-cost routes carried no `companyId` — cross-tenant mutations were
  invisible to the victim's audit feed. companyId added everywhere touched.
- **/finance scope leaks**: the project picker + P&L tiles listed every
  company project for project-scoped viewers, and the audit feed was
  company-wide. Projects now `scopeWhere("Project")`-filtered; audit feed
  hidden for PROJECT scope (mirrors /audit dept-gating).

### Verified-clean / reconciled surfaces

- GSTR-1 / GSTR-3B vs GL for Sep 1–23 agree: outward ₹45.46L taxable /
  ₹2.33L GST; inward ₹11.57L / ₹0.90L ITC; ₹56 reversal; net ₹1.43L.
- Supplier chain: receipt JE (Dr inventory + Dr ITC / Cr AP), payments,
  invoice outstanding — all balanced; A/D fixtures reconciled post-cleanup.
- Foreign asset-sale/material-sale e-invoice ids → 404; foreign
  subcontractor TDS certificate → 404.
- Karan (SALES_MANAGER, no finance perms) → 403 on every finance API
  tested; /finance page renders `<NoAccess>` correctly.
- UI (Playwright, real sessions): /finance, /gl, /reports/*, /m/expenses,
  /m/budget-variance, /m/reports/{job-costing,cash-flow}, /m/petty-cash —
  all 200 with real data, zero page errors; a-proc sees only Greenfield
  on /finance (was leaking all projects). Only console noise: the
  telephony missed-calls badge 403s for non-telephony users (pre-existing,
  out of Module B scope).
- Regression coverage: `packages/services/src/test/finance-tenancy.test.ts`
  (12 DB-backed tests: foreign-id 404s, double-approve 409, double-submit
  409, overflow 400, own-company round-trip) + GL assertions added to
  `employee-advance.test.ts`; route test asserts companyId forwarding +
  404 passthrough on budget-variance.

### Data notes for other agents

- SRG REALCON was repaired after repro: planted ₹7,777 cost + its JE
  removed, seeded ₹72,000 RA-bill cost re-created
  (`cmud4fix10001vlfixrestore01`), `reallocateProjectCosts` re-run.
  The original JE for that cost was deleted during repro — the ledger
  side could not be byte-restored; the ProjectCost row is back.
- My Company GL repaired for the pre-fix advance (`cmud3pz03007svl5pp7jhfnrl`):
  posted the missing issue JE (Dr 1650/Cr 1000 ₹2,400) and Aug recovery JE
  (Dr 2200/Cr 1650 ₹800). 1650 now holds ₹1,400 = live outstanding
  (₹800 + ₹600 across the two B- advances) — consistent.
- A-Vendor `balanceOwed` restored to ₹1,504 (pre-B value); B-SVC-001
  invoice, its 2 JEs, B payments SP-…-0003/0004/0005/0006 + JEs deleted.
- Kept: B- tagged advances, July/Aug/Sep-2026 payroll periods + attendance,
  `b-acct@test.in` project-scoped ACCOUNTANT (useful for scope tests).
- Pre-existing test failures outside Module B (not caused by this work):
  `route-manifest.test.ts` wants `/stock-counts/[id]` registered (module G
  page) and 6 `companies/[id]/members/[memberId]` assertions (module F
  route) — verified unrelated to the files changed here.
