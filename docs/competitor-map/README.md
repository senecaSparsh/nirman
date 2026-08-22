# Competitor Platform Map — 4QT / Tally / Zoho

> Exhaustive screen-by-screen, click-by-click, flow-by-flow mapping of the three
> competitor platforms Nirman Inventory OS is benchmarked against.
>
> **Goal:** for every page, every action, every trigger, every field — document the
> entry point, the number of clicks, the logic, and the downstream effect.
>
> **Structure:** split into focused files so each can be read and maintained
> independently. Start here, then drill into the file that matches the question.

## Files in this map

| # | File | What it covers |
|---|---|---|
| 01 | `01-platform-overview.md` | Positioning, architecture, deployment, pricing, customers |
| 02 | `02-4qt-screens-and-flows.md` | Every 4QT module, screen, flow, click count, trigger, logic |
| 03 | `03-tally-screens-and-flows.md` | Every TallyPrime voucher, report, screen, shortcut, click count |
| 04 | `04-zoho-screens-and-flows.md` | Every Zoho CRM/Books/Inventory/Projects screen, flow, click count |
| 05 | `05-sales-lifecycle-comparison.md` | Lead → quote → order → invoice → payment → return, side by side |
| 06 | `06-procurement-inventory-comparison.md` | Indent → RFQ → PO → GRN → issue → return, side by side |
| 07 | `07-accounting-gl-comparison.md` | Vouchers, GL, GST, TDS, bank recon, reports, side by side |
| 08 | `08-construction-project-comparison.md` | BOQ, WBS, DPR, RA bill, EVM, change order, side by side |
| 09 | `09-hr-payroll-comparison.md` | Employee, attendance, leave, payroll, statutory, side by side |
| 10 | `10-reports-comparison.md` | Every report in each platform, grouped by domain |
| 11 | `11-roles-permissions-comparison.md` | Roles, permissions, data access, field security, audit |
| 12 | `12-integrations-api-comparison.md` | API styles, SDKs, webhooks, workflow automation, connectors |
| 13 | `13-mobile-comparison.md` | Mobile apps, offline, hardware, persona tabs, journeys |
| 14 | `14-gap-analysis-vs-nirman.md` | What Nirman has, what it's missing, priority recommendations |

## How to read each flow entry

Every flow in files 02–04 follows this template:

```
FLOW NAME
  Entry point:    where the user starts (URL / menu / shortcut)
  Trigger:        what causes this flow (manual / event / schedule)
  Steps:          numbered, each with the screen name + fields + action
  Clicks:         total taps/keypresses to complete the happy path
  Result:         what the system does (DB writes, GL posts, notifications)
  Variants:       alternate paths, edge cases, error handling
  Roles:          who can perform it
```

## Sources

- Official product sites: 4qt.com, tallysolutions.com, zoho.com
- Official help docs: help.tallysolutions.com, zoho.com/*/help/
- Review platforms: SoftwareSuggest, SaaSworthy, G2, Capterra, SaaSrat
- Integration guides: zolify.agency, zenatta.com, thecrmtrainer.com
- API docs: zoho.com/inventory/api, apis.io/providers/zoho-inventory
- 4QT customer portal app: apps.apple.com (4QT CP)
- LinkedIn profiles of 4QT ERP operators (process detail corroboration)

Some 4QT details (pricing, API docs, exact screen layouts) are not publicly
documented and would require a direct vendor demo to verify. Where this is the
case, the entry is marked `[vendor-verified]` or `[inferred]`.
