# 06 — Procurement & Inventory Comparison

> Indent → RFQ → PO → GRN → Issue → Return, side by side.

## Procurement flow at a glance

```
Material Requisition (Indent)
    ↓ (approval)
RFQ → Quote Comparison → Supplier Selection
    ↓
Purchase Order (approval → sent to supplier)
    ↓
Goods Receipt (GRN) → QC → Stock Update
    ↓
Supplier Invoice → 3-Way Match → Payment
    ↓
Material Issue → Stock Deduction → Cost Allocation
    ↓
[Return → Credit Note → Stock Reversal]
```

## Step-by-step comparison

### Requisition / Indent

| Dimension | 4QT | Tally | Zoho Inventory |
|---|---|---|---|
| **Entry** | Site → Raise Indent | Purchase Order (Ctrl+F9 other) — no separate indent | PO in Inventory/Books (no separate indent) |
| **Approval** | Indent → approval → budget check | N/A (direct PO) | N/A (direct PO) |
| **Auto-reorder** | Reorder point + EOQ + safety stock + lead time `[inferred]` | Reorder Levels (F11 → F2) | Low stock alerts + auto PO |
| **Clicks** | ~8 taps | N/A | N/A |

### Quote Comparison / RFQ

| Dimension | 4QT | Tally | Zoho Inventory |
|---|---|---|---|
| **RFQ** | Quote mgmt + vendor comparison + bid analysis | Manual (no native quote comparison) | Manual (no native comparative quotes) |
| **Comparison** | Auto comparative statement (rate, landed cost, taxes, delivery) | Manual | Manual |
| **Bid mgmt** | RFQ, bid analysis, comparison, award | No | No |
| **Vendor evaluation** | On-time + quality + price → rating | Movement Analysis (supplier cost comparison) | No |

### Purchase Order

| Dimension | 4QT | Tally | Zoho Inventory |
|---|---|---|---|
| **Entry** | Approved Indent → Create PO | Alt+F4 (Purchase Order) | Purchases → POs → + New |
| **Approval** | PO approval workflow | No (direct) | Approval workflow (configurable) |
| **Fields** | Vendor, items, qty, rate, taxes, delivery date, project | Party A/c, PO No, Date, Due Date, items, qty, rate | Vendor, PO#, Date, Items, Qty, Rate, Tax, Warehouse |
| **Clicks/Keys** | ~15 taps | ~25 keypresses | ~12 clicks |
| **GL impact** | No (commitment only) | No (non-posting) | No (non-posting) |
| **Result** | PO sent to supplier, commitment in budget | PO created, appears in PO Outstanding | PO created, appears in PO list |

### Goods Receipt (GRN)

| Dimension | 4QT | Tally | Zoho Inventory |
|---|---|---|---|
| **Entry** | PO → Receive Goods | Receipt Note (Alt+F9) | PO → Create → Purchase Receive |
| **QC** | Quality check + inspection + reports | No | No |
| **Batch/Serial** | — | Batch-wise (mfg/exp) + serial (IMEI) | Serial + Batch tracking |
| **Clicks/Keys** | ~10 taps | ~15 keypresses | ~8 clicks |
| **Stock impact** | Stock updated (qty in, location) | Stock increased (if item mode) | Stock increased |
| **GL impact** | GL entry (Dr Stock, Cr Supplier) | No (provisional) — GL on Purchase invoice | GL entry (via Books sync) |
| **3-way match** | PO vs GRN vs invoice with tolerance | Manual | Manual |

### Supplier Invoice + Payment

| Dimension | 4QT | Tally | Zoho Inventory |
|---|---|---|---|
| **Invoice entry** | Invoice → 3-way match → approval → payment | Purchase voucher (F9) — GL on this step | PO → Create → Bill (syncs to Books) |
| **Bill-wise** | Outstanding tracking | Agst Ref / New Ref / Advance | Linked to bill automatically |
| **Payment** | Payment to supplier | Payment voucher (F5) with bill-wise | Bill → Record Payment (in Books) |

### Material Issue

| Dimension | 4QT | Tally | Zoho Inventory |
|---|---|---|---|
| **Entry** | Site → Issue Material | Stock Journal (Alt+F7) | Stock Adjustment |
| **Cost allocation** | Material to project + indirect/overhead + transport + storage | Cost centres (if enabled) | Projects (if enabled) |
| **Clicks/Keys** | ~6 taps | ~12 keypresses | ~6 clicks |
| **Stock impact** | Stock deducted | Stock reduced | Stock reduced |
| **GL impact** | GL entry (Dr Project Cost, Cr Stock) | GL entry (if cost centres) | GL entry (via Books) |

### Return / Supplier Return

| Dimension | 4QT | Tally | Zoho Inventory |
|---|---|---|---|
| **Entry** | Stock → Return to Supplier | Rejections Out / Debit Note (Ctrl+F9) | Purchase Return |
| **Credit note** | Credit note → stock reversed | Debit Note (Dr Supplier, Cr Purchase + Stock) | Vendor Credit (in Books) |
| **Clicks/Keys** | ~5 taps | ~12 keypresses | ~6 clicks |

### Multi-location

| Dimension | 4QT | Tally | Zoho Inventory |
|---|---|---|---|
| **Model** | Project/site + warehouse | Godowns (unlimited, inter-godown transfer, third-party) | Warehouses + Bins |
| **Transfer** | Stock transfer between locations | Stock Journal (inter-godown) | Stock Transfer |
| **Hierarchy** | Project → site | Hierarchical godowns | Multi-warehouse + bins |

### Valuation

| Dimension | 4QT | Tally | Zoho Inventory |
|---|---|---|---|
| **Methods** | — `[inferred]` | FIFO / Avg / LIFO / Std Cost / Last Purchase | FIFO / LIFO / Weighted Avg |
| **MAC** | — | Average Cost option | Weighted Average option |

### BoM / Manufacturing

| Dimension | 4QT | Tally | Zoho Inventory |
|---|---|---|---|
| **BoM** | No | BoM + Manufacturing Journal + Job Work + Scrap | Composite Items (bundles) |
| **Job work** | No | Job Work In/Out, Material In/Out | No |
| **Scrap** | No | By-products/Co-products/Scrap | No |

---

## Click count summary (happy path: indent → PO → GRN → issue)

| Platform | Indent | RFQ/PO | GRN | Issue | Total |
|---|---|---|---|---|---|
| 4QT | ~8 | ~15 | ~10 | ~6 | ~39 taps |
| Tally | N/A | ~25 | ~15 | ~12 | ~52 keypresses |
| Zoho | N/A | ~12 | ~8 | ~6 | ~26 clicks |

**Key difference:** 4QT has the most complete procurement chain (indent → RFQ → comparison → PO → GRN → QC → 3-way match). Tally is the fastest for pure entry but lacks RFQ/comparison/QC. Zoho is the cleanest UX but also lacks RFQ/comparison/QC.
