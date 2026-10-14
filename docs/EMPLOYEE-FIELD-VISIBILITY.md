# Employee Field-Visibility Policy

The `Employee` model carries four classes of data in one row: **wages**,
**bank + government IDs**, **personal dossier** (addresses, DOB, attachments),
and **contract/offer signing tokens** (bearer credentials for the public
accept endpoints). Serializing it is therefore a policy decision — never
`json(employee)`.

## Where the policy lives

- **Permission flags** — `getEmployeeAccessScope()` in
  `apps/web/src/lib/server.ts` computes `canSeePayroll` /
  `canSeeBankDetails` / `canSeePersonalDocs` / `canSeeSigningTokens` /
  `canSeeAccessInfo` / `canManageEmployee` / `canManageAccess` /
  `canManagePayroll` from the caller's effective permissions (memoized per
  request).
- **Field groups** — `apps/web/src/lib/employee-visibility.ts` owns the
  column lists and the serialization helpers:
  - `pickEmployeeRoster(row)` — deny-by-default allowlist pick. Anything not
    listed is dropped (safe against schema growth).
  - `redactEmployeeRow(row, scope)` — preserves full shape, nulls gated
    groups the scope doesn't permit.
  - `sensitiveWriteKeys(body)` — lists the bank / ID / address keys a write
    body touches. Writes that include any of them require
    `canSeeBankDetails`.
- **Enforcement** — `nirman/no-raw-employee-row-response` (ESLint) flags
  `json(<var>)` of a `prisma.employee.*` result in API routes; combined with
  lint-staged's `--max-warnings=0` it blocks commits.
- **Schema drift gate** — `employee-visibility.test.ts` parses
  `schema.prisma` and fails if any Employee scalar column isn't classified
  into exactly one group. **Adding a column → categorize it or CI fails.**

## Tiers

| Tier            | Gate (effective perms)                            | Columns                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Roster**      | `hr.view`                                         | identity (id, name, trade, designation, dept), contact (phone, email), assignment (crew, activeProject, reportingLocation, hierarchyLevel, reportsToEmployeeId), `wageType` (structure label — Daily/Monthly/Fixed, never the amount), status flags (onboarding/contract/offer/ID-card/verification/onboardingComplete), safety fields (emergency contact, blood group, photo), bookkeeping (version, timestamps, deletedAt, companyId, userId) |
| **Comp**        | `payroll.view` \| `payroll.manage` \| `hr.manage` | dailyRate, monthlySalary, payDay, autoDeposit*, employmentType, probationEndDate, confirmationDate, noticePeriodDays, contractStart/EndDate, contractTerms, offerLetterTerms                                                                                                                                                                                                                                                                    |
| **Docs**        | `hr.sensitive`                                    | bank* (holder/number/IFSC/name/branch), PAN, Aadhaar, PF/ESI/UAN, permanentAddress, currentAddress, dateOfBirth, *AttachmentId                                                                                                                                                                                                                                                                                                                  |
| **Tokens**      | `hr.signing`                                      | contractToken, offerToken — leaking one lets anyone sign documents as that employee                                                                                                                                                                                                                                                                                                                                                             |
| **Access info** | `users.manage` \| `hr.manage`                     | user account metadata (role, lastLoginAt, mustChangePassword, overrides) — the `user` relation, not Employee columns                                                                                                                                                                                                                                                                                                                            |

**Who holds `hr.sensitive`:** HR Manager and Finance Head (and Owner/Admin).
Project Manager keeps `hr.manage` for roster work but not `hr.sensitive`, so
it cannot read or change bank account numbers, IDs, addresses or signing
links. Changing a bank account redirects salary, so that write sits behind
the same permission as the read.

**Who holds `hr.signing`:** HR Manager (and Owner/Admin). Signing links are
bearer credentials, so they are narrower than the docs tier.

**Rationale for `payroll.view` in comp:** its holders already read actual
per-employee net pay via `/api/payroll` lines (employeeName, netPay, pf, esi,
tax). Hiding the wage _rate_ while showing the _payout_ would be backwards.
Bank and ID data do not follow payroll access: a payroll reader does not
need account numbers to audit pay.

## Composition: how onboarding permission patterns inherit this

Effective perms resolve through `getUserPermissions()` →
`resolveRolePermissions()`:

```
baseRole defaults
+ CustomRole.permissions       (role templates, e.g. CUSTOM_FIELD_LEAD)
+ RolePermission overrides     (company-level role adjustments)
+ UserPermission grants        (per-person grants — additive only, no deny)
+ delegated perms              (approval permissions only, while a delegation is live)
```

So a custom role or per-user grant lands in the right tier:
`hr.view` → roster, `payroll.view` → + comp amounts, `hr.sensitive` → +
bank, IDs and addresses, `hr.signing` → + signing links, `users.manage` →

- account metadata. Verified against `CUSTOM_PAYROLL_AUDITOR` (hr.view +
  payroll.view: wages visible, bank and tokens hidden).

Accountants who run payouts need bank read for that job. Grant
`hr.sensitive` to that person with a per-person grant, not a role change.

## Authoring rules

1. Never return a raw `prisma.employee.*` result. Pick explicitly via
   `pickEmployeeRoster`, or run it through `redactEmployeeRow(row, scope)`.
2. Never gate fields ad-hoc with inline `perms.includes(...)` — use
   `getEmployeeAccessScope()` so the tier definition can't drift.
3. Server components are egress too — apply the same policy when building
   props passed to client components (wages have leaked via pages, not just
   JSON).
4. Derived aggregates are comp data: labour-cost totals, org-tree rates,
   CSV export columns.
5. Relations are append-only by the caller — the helpers only touch scalar
   columns. Include relation summaries explicitly (crew/project/user).
6. A write that touches bank, ID or address columns is gated the same way as
   the read: check `sensitiveWriteKeys(body)` and require `canSeeBankDetails`.

## The roster tier's contract

Field staff legitimately need: who the worker is, their trade, which
project/crew they're on, a phone number to coordinate, and safety fields
after an accident. Everything else is gated. A roster response showing
`"Wage —"` (never `₹0`) is correct — `formatCurrency(null)` renders `"—"`;
hidden numeric fields must not render as zero (zero is data).
