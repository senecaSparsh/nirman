# 14 — Gap Analysis vs Nirman

> What Nirman has, what it's missing, and priority recommendations based on the
> competitor mapping. This is the actionable output of the whole exercise.

## How to read this

For each capability:
- **HAVE** = Nirman already does this (per AGENTS.md + codebase)
- **GAP** = Nirman doesn't have it; competitor does
- **Priority** = P0 (blocker) / P1 (high) / P2 (medium) / P3 (nice-to-have)

## Sales / CRM

| Capability | Nirman | 4QT | Tally | Zoho | Priority |
|---|---|---|---|---|---|
| Lead capture (manual) | HAVE | HAVE | — | HAVE | — |
| Lead capture (portal sync: Magicbricks/99Acres) | GAP | HAVE | — | — | P1 |
| Lead capture (IVR/virtual number) | GAP | HAVE | — | — | P2 |
| Lead capture (social: FB/Insta) | GAP | HAVE | — | HAVE | P2 |
| Lead scoring (Hot/Warm/Cold) | GAP | HAVE | — | HAVE | P1 |
| Lead nurturing + follow-up scheduling | GAP | HAVE | — | HAVE | P1 |
| Site visit booking + GPS-tagged attendance | GAP | HAVE | — | — | P1 |
| Lead → Customer conversion | HAVE | HAVE | — | HAVE | — |
| Blueprint (gated stage transitions) | GAP | — | — | HAVE | P2 |
| Quote → Sales Order → Invoice chain | HAVE | HAVE | HAVE | HAVE | — |
| Campaign ROI tracking | GAP | HAVE | — | HAVE | P3 |

## Booking / Post-Sales (Real Estate specific)

| Capability | Nirman | 4QT | Tally | Zoho | Priority |
|---|---|---|---|---|---|
| Allotment letter generation | GAP | HAVE | — | — | P0 |
| Welcome letter generation | GAP | HAVE | — | — | P1 |
| Builder-Buyer Agreement generation | GAP | HAVE | — | — | P1 |
| Construction-linked payment schedule (auto) | GAP | HAVE | — | — | P0 |
| Auto demand notice on milestone | GAP | HAVE | — | — | P0 |
| Payment reminders (pre-due/due/post-due) | GAP | HAVE | — | HAVE | P1 |
| Interest on overdue (configurable) | GAP | HAVE | HAVE | — | P1 |
| Cancellation + refund + fee workflow | GAP | HAVE | — | — | P1 |
| Transfer (with family vs third-party rules) | GAP | HAVE | — | — | P1 |
| Surrender workflow | GAP | HAVE | — | — | P2 |
| Registration (sale deed, stamp duty, NOC) | GAP | HAVE | — | — | P1 |
| Possession (handover checklist, certificate) | GAP | HAVE | — | — | P1 |
| Broker/channel partner portal | GAP | HAVE | — | HAVE | P1 |
| Broker commission (slab-based, scheduled) | GAP | HAVE | — | — | P1 |

## Procurement

| Capability | Nirman | 4QT | Tally | Zoho | Priority |
|---|---|---|---|---|---|
| Material requisition (indent) + approval | HAVE | HAVE | — | — | — |
| RFQ + quote comparison (≥3 quotes) | HAVE | HAVE | — | — | — |
| Comparative statement (landed cost) | HAVE | HAVE | — | — | — |
| PO approval workflow | HAVE | HAVE | — | HAVE | — |
| 3-way match (PO vs GRN vs invoice) | GAP | HAVE | — | — | P1 |
| Vendor evaluation (rating) | GAP | HAVE | HAVE | — | P2 |
| Auto-requisition (reorder point + EOQ) | HAVE | HAVE | HAVE | HAVE | — |
| QC on receipt | GAP | HAVE | — | — | P1 |

## Inventory / Stock

| Capability | Nirman | 4QT | Tally | Zoho | Priority |
|---|---|---|---|---|---|
| Multi-location (project/site/warehouse) | HAVE | HAVE | HAVE | HAVE | — |
| Stock movement ledger (immutable) | HAVE | HAVE | HAVE | HAVE | — |
| Moving Average Cost (MAC) | HAVE | `[inferred]` | HAVE | HAVE | — |
| Batch/serial tracking | GAP | — | HAVE | HAVE | P2 |
| Stock transfer (inter-location) | HAVE | HAVE | HAVE | HAVE | — |
| Stock count / physical verification | HAVE | HAVE | HAVE | HAVE | — |
| Scrap generation (auto from DPR variance) | HAVE | HAVE | — | — | — |
| Stock ageing | GAP | HAVE | HAVE | HAVE | P2 |
| Reorder alerts | HAVE | HAVE | HAVE | HAVE | — |
| Picklist / pack / ship workflow | GAP | — | — | HAVE | P3 (not construction-focused) |

## Construction / Project

| Capability | Nirman | 4QT | Tally | Zoho | Priority |
|---|---|---|---|---|---|
| BOQ + rate analysis | GAP | HAVE | — | — | P0 |
| WBS + scheduling + Gantt | GAP | HAVE | — | HAVE | P1 |
| Critical path (CPM) | GAP | HAVE | — | — | P2 |
| DPR (multi-tier approval) | HAVE | HAVE | — | — | — |
| Standard consumption benchmarks | HAVE | HAVE | — | — | — |
| Auto-scrap from DPR variance | HAVE | HAVE | — | — | — |
| Contractor work order | GAP | HAVE | ⚠️ | — | P1 |
| RA bill (with retention/TDS) | HAVE | HAVE | — | — | — |
| Change order (with impact analysis) | GAP | HAVE | — | — | P1 |
| EVM (PV/EV/AC/CPI/SPI/EAC) | GAP | HAVE | — | — | P2 |
| Quality control (NCR/CAPA) | GAP | HAVE | — | — | P1 |
| Safety management (incidents) | GAP | HAVE | — | — | P1 |
| Equipment management (tracking + maintenance) | HAVE | HAVE | — | — | — |
| Document management (versioning + approval) | GAP | HAVE | — | HAVE | P2 |

## Accounting / GL

| Capability | Nirman | 4QT | Tally | Zoho | Priority |
|---|---|---|---|---|---|
| Double-entry GL (balanced) | HAVE | HAVE | HAVE | HAVE | — |
| 26 system accounts | HAVE | HAVE | HAVE | HAVE | — |
| Project cost allocation | HAVE | HAVE | HAVE | HAVE | — |
| Cost-per-sqft reallocation | HAVE | HAVE | — | — | — |
| Tally XML sync | HAVE | HAVE | — | — | — |
| GST (CGST/SGST/IGST auto) | GAP | HAVE | HAVE | HAVE | P0 |
| e-Invoicing (IRN + QR) | GAP | HAVE | HAVE | HAVE | P0 |
| e-Way Bill | GAP | HAVE | HAVE | HAVE | P1 |
| GSTR-1/2B/3B filing | GAP | HAVE | HAVE | HAVE | P0 |
| GST reconciliation (books vs portal) | GAP | HAVE | HAVE | HAVE | P1 |
| TDS (section-wise, threshold, challan) | GAP | HAVE | HAVE | HAVE | P1 |
| TCS (Section 206C(1H)) | GAP | HAVE | HAVE | HAVE | P2 |
| Bank reconciliation (auto import) | GAP | HAVE | HAVE | HAVE | P1 |
| Multi-currency | GAP | — | HAVE | HAVE | P3 |
| Multi-company consolidation | GAP | HAVE | HAVE | — | P3 |
| Bill-wise allocation (Agst/New/Advance) | GAP | HAVE | HAVE | HAVE | P1 |
| Interest calculation (receivables) | GAP | HAVE | HAVE | — | P2 |
| Voucher classes / optional vouchers | GAP | — | HAVE | — | P3 |
| Audit log (immutable) | HAVE | HAVE | HAVE | HAVE | — |

## HR / Payroll

| Capability | Nirman | 4QT | Tally | Zoho | Priority |
|---|---|---|---|---|---|
| Employee master | HAVE | HAVE | HAVE | HAVE | — |
| GPS-tagged attendance | HAVE | HAVE | — | HAVE | — |
| Leave management | HAVE | HAVE | — | HAVE | — |
| Payroll processing | HAVE | HAVE | HAVE | HAVE | — |
| PF/ESI/PT/TDS | HAVE | HAVE | HAVE | HAVE | — |
| Performance reviews | GAP | HAVE | — | HAVE | P3 |
| Recruitment / ATS | GAP | HAVE | — | HAVE | P3 |

## Portals

| Capability | Nirman | 4QT | Tally | Zoho | Priority |
|---|---|---|---|---|---|
| Customer portal (payments, docs, progress, queries) | GAP | HAVE | — | HAVE | P0 |
| Channel partner / broker portal | GAP | HAVE | — | HAVE | P1 |
| Supplier portal (PO, dispatch, invoice, payment) | GAP | HAVE | — | — | P2 |

## Notifications / Comms

| Capability | Nirman | 4QT | Tally | Zoho | Priority |
|---|---|---|---|---|---|
| WhatsApp alerts (pluggable provider) | HAVE | HAVE | — | HAVE | — |
| Email alerts (pluggable provider) | HAVE | HAVE | — | HAVE | — |
| Template management | HAVE | HAVE | — | HAVE | — |
| Notification log | HAVE | HAVE | — | HAVE | — |

## Integrations

| Capability | Nirman | 4QT | Tally | Zoho | Priority |
|---|---|---|---|---|---|
| Tally XML sync | HAVE | HAVE | — | — | — |
| Property portal sync (Magicbricks etc.) | GAP | HAVE | — | — | P1 |
| Stripe / payment gateway | GAP | HAVE | — | HAVE | P2 |
| Zapier / workflow automation | GAP | HAVE | — | HAVE | P3 |
| REST API (public, documented) | GAP | HAVE | HAVE | HAVE | P2 |
| Webhooks (out) | GAP | HAVE | HAVE | HAVE | P2 |

## Mobile

| Capability | Nirman | 4QT | Tally | Zoho | Priority |
|---|---|---|---|---|---|
| Mobile shell (V2, offline queue) | HAVE | HAVE | — | HAVE | — |
| Camera/GPS/signature/scan | HAVE | HAVE | — | HAVE | — |
| Role-based tabs (persona) | HAVE | HAVE | — | HAVE | — |
| Customer portal mobile | GAP | HAVE | — | HAVE | P0 |
| Broker portal mobile | GAP | HAVE | — | HAVE | P1 |

## Reports

| Capability | Nirman | 4QT | Tally | Zoho | Priority |
|---|---|---|---|---|---|
| Trial Balance, P&L, BS | HAVE | HAVE | HAVE | HAVE | — |
| Purchaser performance report | HAVE | — | — | — | — |
| Stock summary + valuation | HAVE | HAVE | HAVE | HAVE | — |
| Project cost + variance | HAVE | HAVE | HAVE | HAVE | — |
| Sales/booking reports | GAP | HAVE | HAVE | HAVE | P1 |
| GST returns (GSTR-1/2B/3B) | GAP | HAVE | HAVE | HAVE | P0 |
| Ageing (receivables/payables) | GAP | HAVE | HAVE | HAVE | P1 |
| Custom report builder | GAP | HAVE | HAVE | HAVE | P3 |

---

## Top 10 priority gaps (P0)

1. **Allotment letter + demand notice generation** (real-estate specific, 4QT core)
2. **Construction-linked payment schedule (auto)** (4QT core)
3. **GST calc (CGST/SGST/IGST auto) + GSTR-1/2B/3B filing** (Tally gold standard)
4. **e-Invoicing (IRN + QR)** (regulatory mandate)
5. **BOQ + rate analysis** (4QT core, construction-specific)
6. **Customer portal** (4QT CP, Zoho CRM portal — table stakes for real estate)

## Top 10 priority gaps (P1)

7. Lead scoring + nurturing + site visit booking
8. Auto demand notice on construction milestone
9. Payment reminders (pre-due/due/post-due) + interest on overdue
10. Cancellation/transfer/registration/possession workflows
11. Broker portal + commission management
12. 3-way match (PO vs GRN vs invoice) + QC on receipt
13. Contractor work order + change order
14. Quality control (NCR/CAPA) + safety management
15. TDS + e-Way Bill + GST reconciliation
16. Bank reconciliation (auto import)
17. Bill-wise allocation
18. Sales/booking reports + ageing reports
19. Property portal sync (Magicbricks/99Acres)
20. Supplier portal

## Recommended build order

### Phase 1 — Real-estate core (P0)
- Allotment letter + demand notice generation
- Construction-linked payment schedule (auto)
- BOQ + rate analysis
- Customer portal (MVP: payments, docs, progress, queries)

### Phase 2 — Compliance (P0)
- GST calc (auto) + GSTR-1/2B/3B
- e-Invoicing (IRN + QR)

### Phase 3 — Sales lifecycle (P1)
- Lead scoring + nurturing
- Site visit booking
- Cancellation/transfer/registration/possession
- Broker portal + commission

### Phase 4 — Construction depth (P1)
- Contractor work order
- Change order
- Quality control (NCR/CAPA)
- Safety management

### Phase 5 — Procurement + finance (P1)
- 3-way match + QC on receipt
- TDS + e-Way Bill + GST recon
- Bank reconciliation (auto)
- Bill-wise allocation
- Ageing reports

### Phase 6 — Integrations + portals (P2)
- Property portal sync
- Supplier portal
- REST API (public)
- Webhooks

### Phase 7 — Polish (P3)
- Performance reviews, recruitment, multi-currency, consolidation, custom reports, Zapier
