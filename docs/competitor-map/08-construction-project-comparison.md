# 08 — Construction / Project Management Comparison

> BOQ, WBS, DPR, RA bill, EVM, change order, quality, safety — side by side.

## At a glance

| Dimension | 4QT | Tally | Zoho Projects |
|---|---|---|---|
| **BOQ** | ✅ Built-in (core) | ❌ | ❌ |
| **Rate Analysis** | ✅ Built-in | ❌ | ❌ |
| **Estimation** | ✅ Built-in | ❌ | ❌ |
| **Project Costing** | ✅ Built-in (budget vs actual) | ⚠️ Cost centres only | ⚠️ Via Books projects |
| **WBS/Stages/Tasks** | ✅ Built-in | ❌ | ✅ Tasks + Task Lists + Milestones |
| **Scheduling** | ✅ Gantt + milestones + critical path | ❌ | ✅ Gantt + dependencies |
| **DPR** | ✅ Built-in (core) | ❌ | ❌ (needs Creator) |
| **Contractor/Work Order** | ✅ Built-in | ⚠️ Job Work | ❌ (needs Creator) |
| **Change Order** | ✅ Built-in (impact analysis) | ❌ | ❌ |
| **Resource Mgmt** | ✅ Allocation + scheduling + availability | ❌ | ✅ Resource allocation + utilization |
| **Equipment Mgmt** | ✅ Tracking + scheduling + maintenance + cost | ❌ | ❌ |
| **Time Tracking** | ✅ Labor + equipment + timesheets | ❌ | ✅ Timesheets |
| **Quality Control** | ✅ Checklists + inspections + NCR + CAPA | ❌ | ❌ |
| **Safety Mgmt** | ✅ Checklists + incidents + compliance | ❌ | ❌ |
| **Document Mgmt** | ✅ Repository + versioning + approval + sharing | ❌ | ✅ Documents + Pages (wiki) |
| **EVM** | ✅ PV/EV/AC/SPI/CPI/EAC | ❌ | ❌ |
| **Critical Path** | ✅ ES/EF/LS/LF + slack/float | ❌ | ⚠️ Dependencies only |

**4QT is the only platform with true construction-industry depth.** Tally and Zoho require significant customization (TDL / Creator) to match.

## BOQ + Rate Analysis

| Dimension | 4QT | Tally | Zoho Projects |
|---|---|---|---|
| **Entry** | Project → BOQ | N/A | N/A |
| **Steps** | Import from Excel or manual → line items (description, qty, unit, rate, amount) → rate analysis per item (material + labour + overhead + profit) → budget approval | — | — |
| **Clicks** | ~20 taps for a full BOQ | — | — |
| **Result** | BOQ approved, budget set, basis for procurement and cost control | — | — |

## WBS + Scheduling

| Dimension | 4QT | Tally | Zoho Projects |
|---|---|---|---|
| **Entry** | Project → WBS | N/A | Project → Task Lists → Tasks |
| **Hierarchy** | Project → Phase → Stage → Task | — | Project → Task List → Task → Subtask |
| **Dependencies** | Predecessor/successor | — | FS/FF/SS/SF |
| **Critical path** | Auto-calc ES/EF/LS/LF + slack/float | — | Dependencies only (no CPM) |
| **Gantt** | Yes | — | Yes |
| **Milestones** | Yes | — | Yes |
| **Clicks** | ~15 taps for a small WBS | — | ~12 clicks |

## DPR (Daily Progress Report)

| Dimension | 4QT | Tally | Zoho Projects |
|---|---|---|---|
| **Entry** | Site → New DPR (mobile or desktop) | N/A | N/A (needs Creator) |
| **Fields** | Project, date, work type, planned vs actual qty, material consumption, labour headcount, equipment, photos | — | — |
| **Approval** | Single-tier `[inferred]` | — | — |
| **Variance** | Planned vs actual flagged | — | — |
| **Clicks** | ~12 taps | — | — |
| **Result** | DPR record, progress % updated, variance flagged | — | — |

## Contractor Work Order + RA Bill

| Dimension | 4QT | Tally | Zoho Projects |
|---|---|---|---|
| **Work Order** | Select contractor, scope (from BOQ), agreed rates → approval → issue | Job Work Order (material in/out) | N/A |
| **RA Bill** | Contractor submits → QS verifies against measurement book → cumulative check → deduct advance/retention/TDS → net payable → approval → payment | Job Work bill processing | N/A |
| **Retention** | Yes | — | — |
| **TDS** | Yes (subcontractor TDS) | — | — |
| **Clicks** | ~18 taps end to end | — | — |

## Change Order

| Dimension | 4QT | Tally | Zoho Projects |
|---|---|---|---|
| **Entry** | Project → Change Orders → New | N/A | N/A |
| **Steps** | Description → impact analysis (cost + schedule) → approval → budget revision → BOQ/WBS update | — | — |
| **Clicks** | ~8 taps | — | — |

## Quality Control

| Dimension | 4QT | Tally | Zoho Projects |
|---|---|---|---|
| **Entry** | Project → Quality → New Inspection | N/A | N/A |
| **Steps** | Checklist selection → inspection → pass/fail → NCR if fail → CAPA → closure | — | — |
| **NCR/CAPA** | Yes | — | — |
| **Clicks** | ~7 taps | — | — |

## Safety Management

| Dimension | 4QT | Tally | Zoho Projects |
|---|---|---|---|
| **Entry** | Project → Safety → New Incident | N/A | N/A |
| **Steps** | Incident details → severity → corrective action → compliance report | — | — |
| **Clicks** | ~6 taps | — | — |

## EVM (Earned Value Management)

| Dimension | 4QT | Tally | Zoho Projects |
|---|---|---|---|
| **Metrics** | PV, EV, AC, CPI, SPI, EAC, VAC | N/A | N/A |
| **Display** | Project cockpit overview | — | — |

## Equipment Management

| Dimension | 4QT | Tally | Zoho Projects |
|---|---|---|---|
| **Tracking** | ✅ location, utilization | N/A | N/A |
| **Maintenance** | ✅ scheduling, cost | — | — |
| **Depreciation** | ✅ SLM + WDV | — | — |

## Time Tracking

| Dimension | 4QT | Tally | Zoho Projects |
|---|---|---|---|
| **Model** | Labor + equipment + timesheets | N/A | Timesheets (per task) |
| **Billable** | Cost allocation to project | — | Billable to project/client |

## Document Management

| Dimension | 4QT | Tally | Zoho Projects |
|---|---|---|---|
| **Repository** | ✅ versioning + approval + sharing | TallyDrive | Documents + Pages (wiki) |
| **Drawing mgmt** | ✅ `[inferred]` | — | — |
