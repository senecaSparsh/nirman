# 03 — TallyPrime Screens and Flows

> TallyPrime is a keyboard-first desktop accounting ERP. Every action has a
> dedicated shortcut key. The "Gateway of Tally" is the home screen; "Go To"
> (Alt+G) is the command palette. This file maps every voucher type, every
> report, and the exact keystrokes for the core flows.

## Navigation model

```
Gateway of Tally (home screen)
├── Masters (create/alter ledgers, stock items, godowns, voucher types)
├── Vouchers (F-key entry — see below)
├── Reports (Alt+R or menu — see reports section)
└── Utilities (backup, restore, company management, Tally audit)

Alt+G (Go To) — command palette, type anything to jump
F11 — Company Features (toggle modules on/off)
F12 — Configuration (screen-level options)
Ctrl+A — Accept/Save (universal)
Ctrl+Q — Quit without saving
Esc — Back
Alt+C — Create on the fly (master/ledger/item while in a voucher)
Alt+D — Delete voucher/ledger
Alt+X — Cancel voucher
```

## Voucher types (24 predefined)

### Accounting (8)
| Voucher | Shortcut | Purpose |
|---|---|---|
| Contra | F4 | Bank↔Cash, Bank↔Bank transfers |
| Payment | F5 | Pay money (cash/bank out) |
| Receipt | F6 | Receive money (cash/bank in) |
| Journal | F7 | Non-cash adjustments, year-end, provisions |
| Sales | F8 | Sales invoice (goods/services) |
| Purchase | F9 | Purchase invoice (goods/services) |
| Credit Note | Ctrl+F8 | Sales return, discount given, post-sale adjustment |
| Debit Note | Ctrl+F9 | Purchase return, discount received, post-purchase adjustment |

### Inventory (7)
| Voucher | Shortcut | Purpose |
|---|---|---|
| Stock Journal | Alt+F7 | Material transfer between godowns, manufacturing journal |
| Physical Stock | Alt+F7 (other) | Stock count verification |
| Delivery Note | Alt+F8 | Goods dispatched (against sales order) |
| Receipt Note | Alt+F9 | Goods received (against purchase order) |
| Rejections In | — | Rejected goods received back |
| Rejections Out | — | Rejected goods sent out |
| Material In/Out | — | Job work material movement |

### Order (4)
| Voucher | Shortcut | Purpose |
|---|---|---|
| Sales Order | Alt+F5 | Customer order (no GL impact, stock reservation optional) |
| Purchase Order | Alt+F4 | Supplier order (no GL impact) |
| Job Work In Order | — | Job work order from customer |
| Job Work Out Order | — | Job work order to vendor |

### Payroll (2)
| Voucher | Shortcut | Purpose |
|---|---|---|
| Payroll | Ctrl+F4 | Salary processing |
| Attendance | — | Attendance/production entry |

### Other
| Voucher | Shortcut | Purpose |
|---|---|---|
| Memorandum | — | Non-posting note voucher |
| Reversing Journal | — | Auto-reversing entry (accruals) |
| Optional Voucher | Ctrl+L | Mark any voucher as optional (no books impact) |
| POS | — | Point of sale invoice |

## Sales voucher modes (3)

| Mode | When | What shows |
|---|---|---|
| Item Invoice | Selling goods | "Name of Item" column — stock item, qty, rate, auto-GST |
| Accounting Invoice | Selling services | "Particulars" column — ledger, amount, manual GST |
| As Voucher | Both, double-entry | Dr/Cr columns — debit cash/bank/party, credit sales + item alloc |

---

## FLOW: Sales Order Entry

- **Entry:** Alt+G → Create Voucher → F10 (Other) → Sales Order. OR Gateway → Vouchers → Alt+F5
- **Trigger:** Manual (customer confirms order)
- **Prerequisite:** F11 → F2 → "Enable sales order processing" = Yes
- **Steps:**
  1. Press Alt+G → Create Voucher → Sales Order
  2. Party A/c Name: select customer ledger (Alt+C to create on the fly)
  3. Dispatch Details screen: dispatch doc no, destination, transporter
  4. Party Details screen: buyer name, address, GSTIN, state
  5. Sales Order No: enter (or auto)
  6. Due on date + Quantity per lot (split deliveries allowed)
  7. Select Sales ledger
  8. Select stock items: Name of Item, Qty, Rate (auto-filled if available)
  9. Additional ledgers: transport, insurance, discount
  10. Narration
  11. Ctrl+A to save
  12. Alt+P → Enter to print
- **Keystrokes:** ~25-30 keypresses for a 2-line order
- **Result:** Sales order created (no GL impact), stock reserved if tracking enabled, appears in Sales Order Outstanding report
- **Variants:**
  - Order No. per item: F12 → "Provide Order No. for each item" = Yes
  - Multiple due dates: enter each lot with its own due date

## FLOW: Sales Invoice (Item Invoice Mode)

- **Entry:** Alt+G → Create Voucher → F8 (Sales). OR Gateway → Vouchers → F8
- **Trigger:** Manual (goods dispatched) or linked from Sales Order
- **Steps:**
  1. Press F8
  2. Ctrl+H → select "Item Invoice" (if not already)
  3. Party A/c Name: Cash/Bank (cash sale) or customer ledger (credit sale)
  4. Dispatch Details: dispatch doc, destination
  5. Party Details: buyer name, address, GSTIN, place of supply
  6. Sales ledger: select common sales ledger
  7. Name of Item: select stock item (Alt+C to create new)
  8. Qty, Rate → Amount auto-calculated
  9. GST auto-calculated based on party state + item HSN rate:
     - Local (intra-state): CGST + SGST (e.g. 9% + 9%)
     - Interstate: IGST (e.g. 18%)
  10. Additional ledgers: transport, insurance, discount
  11. Narration
  12. Ctrl+A to save
  13. Ctrl+P or Alt+P → Current to print
  14. C (Configure) → I (Preview) → P (Print)
- **Keystrokes:** ~30-40 for a 2-line invoice with GST
- **Result:** Sales voucher posted (Dr Party/Cash, Cr Sales + CGST/SGST/IGST), stock reduced, GSTR-1 updated
- **Link to order:** if Sales Order exists, select it in the order field → qty auto-fills

## FLOW: Sales Invoice (Accounting Invoice Mode — services)

- Same as above but Ctrl+H → "Accounting Invoice"
- No stock item column; instead "Particulars" → select service ledger → Amount
- GST manual (no auto from HSN)

## FLOW: Credit Note (Sales Return)

- **Entry:** Ctrl+F8
- **Steps:**
  1. Party A/c Name
  2. Mode: Item (goods return) or Accounting (service/adjustment)
  3. Select original sales voucher reference:
     - Agst Ref: adjust against existing invoice (before payment)
     - New Ref: separate reference (after payment)
     - Advance: against advance payment
  4. Select items, qty being returned
  5. GST: included in GSTR-1, reduces output tax liability
  6. Reason for return (mandatory)
  7. Ctrl+A to save
- **Result:** Stock increased (if item mode), GL reversed (Dr Sales Returns, Cr Party), GSTR-1 updated

## FLOW: Purchase Order

- **Entry:** Alt+G → Create Voucher → Alt+F4 (Purchase Order)
- **Prerequisite:** F11 → F2 → "Enable purchase order processing" = Yes
- **Steps:** Same structure as Sales Order but for supplier
- **Result:** PO created (no GL impact), appears in PO Outstanding report

## FLOW: Purchase Invoice (Item Invoice Mode)

- **Entry:** Alt+G → Create Voucher → F9 (Purchase)
- **Steps:**
  1. Press F9
  2. Ctrl+H → "Item Invoice"
  3. Supplier Invoice No. + Date (from supplier's bill)
  4. Party A/c Name: supplier ledger (Alt+C to create)
  5. Receipt Details: receipt doc, bill of landing, destination
  6. Purchase ledger: select (marked GST applicable)
  7. Name of Item: select stock item, Qty, Rate
  8. GST auto-calculated (ITC):
     - Local: CGST + SGST (input tax credit)
     - Interstate: IGST
  9. Additional ledgers: freight, insurance, loading
  10. Narration
  11. Ctrl+A to save
- **Result:** Purchase posted (Dr Purchase + CGST/SGST/IGST-ITC, Cr Supplier), stock increased, GSTR-2B eligible

## FLOW: Receipt Note (GRN without invoice)

- **Entry:** Alt+F9 (Receipt Note)
- **Purpose:** Record goods received before supplier invoice arrives
- **Result:** Stock increased, no GL impact (provisional), linked to PO

## FLOW: Receipt Voucher (F6) with Bill-wise Allocation

- **Entry:** Alt+G → Create Voucher → F6 (Receipt)
- **Prerequisite:** F11 → Accounting Features → "Maintain bill-wise details" = Yes; Party ledger → "Maintain balances bill-by-bill" = Yes
- **Steps:**
  1. Press F6
  2. Ctrl+H → "Single Entry" (or "As Voucher" for double-entry)
  3. Account: select Cash or Bank ledger
  4. Particulars: select customer ledger
  5. Amount: enter received amount → press Enter
  6. Bill-wise Details screen appears:
     - Select "Agst Ref" → list of outstanding bills shown
     - Select bill(s) to allocate against
     - Or "New Ref" for advance (creates new bill reference)
     - Or "Advance" for unallocated advance
  7. F12 → "Pre-Allocate Bills" = Yes to select bills before entering amount
  8. Ctrl+A to save
- **Keystrokes:** ~15-20 for a single-bill receipt
- **Result:** GL entry (Dr Cash/Bank, Cr Customer), bill outstanding reduced, ageing updated

## FLOW: Payment Voucher (F5)

- Same as Receipt but for paying suppliers
- Bill-wise allocation against purchase bills (Agst Ref / New Ref / Advance)

## FLOW: Stock Journal (Inter-Godown Transfer)

- **Entry:** Alt+F7 (Stock Journal)
- **Steps:**
  1. Source godown, destination godown
  2. Select items, qty
  3. Ctrl+A to save
- **Result:** Stock reduced at source, increased at destination, no GL impact (same company)

## FLOW: Physical Stock Verification

- **Entry:** Alt+F7 (Physical Stock) or Gateway → Inventory Vouchers
- **Steps:** Enter physical count per item → system compares with book stock → variance → adjustment voucher
- **Result:** Stock adjusted to physical count, variance posted to GL

---

## GST workflow (full)

1. **Company config:** F11 → F3 → GSTIN, state, enable GST
2. **Master config:** party GSTIN/state/type, item HSN/SAC/rate, ledger GST applicability
3. **Tax ledgers:** CGST, SGST/UTGST, IGST, Cess (under Duties & Taxes group)
4. **Sales invoice:** auto GST calc by party state + item rate
5. **e-Invoicing** (turnover > ₹5cr): IRN generation, QR code, signed invoice, e-Way Bill link
6. **e-Way Bill** (consignment > ₹50K interstate): number, validity, Part A + Part B
7. **GSTR-1 filing** (monthly/quarterly): B2B, B2C Large/Small, export, nil-rated, exempt
8. **GSTR-3B:** summary, tax liability, ITC, auto from GSTR-2B
9. **GST reconciliation:** books vs portal, missing invoices, ITC recon

## TCS on Sales

- Section 206C(1H): 0.1% on receipts > ₹50L threshold
- Create TCS ledger (Duties & Taxes), set "Is TCS Applicable" in Sales Ledger

## Price Lists + Price Levels

- F11 → F2 → "Use Multiple Price Levels" = Yes
- Price levels: Wholesaler, Distributor, Retailer, Export
- Quantity-based slab pricing, discount %, applicable-from date, stock-group-wise

---

## Reports (400+ — key ones)

### Accounting
| Report | Shortcut / Path |
|---|---|
| Day Book | Alt+G → Day Book (all transactions for a date) |
| Sales Register | Alt+G → Sales Register (monthly summary, drill-down, columnar, profitability) |
| Purchase Register | Alt+G → Purchase Register |
| Cash/Bank Book | Gateway → Display → Cash/Bank Book |
| Journal Register | Gateway → Display → Journal Register |
| Contra/Payment/Receipt Register | Gateway → Display → respective |
| Credit/Debit Note Register | Gateway → Display → Note Register |
| Bills Receivable/Payable | Gateway → Display → Bills R/P |
| Ageing | inside Bills R/P or receivables/payables |
| Outstanding | Sales Order Outstanding, Bill-wise Pending |
| Interest | Interest receivable/payable (if enabled) |

### Financial Statements
| Report | Path |
|---|---|
| Trial Balance | Gateway → Display → Trial Balance |
| Profit & Loss | Gateway → Display → P&L A/c |
| Balance Sheet | Gateway → Display → Balance Sheet |
| Ratio Analysis | inside P&L or BS screen |
| Cash Flow | Gateway → Display → Cash Flow |
| Funds Flow | Gateway → Display → Funds Flow |

### Inventory
| Report | Path |
|---|---|
| Stock Summary | Gateway → Display → Stock Summary (real-time stock-in-hand) |
| Item/Group/Category Summary | drill-down from Stock Summary |
| Godown Summary | Gateway → Display → Godown Summary (hierarchical) |
| Batch Summary | if batches enabled |
| Movement Analysis | Gateway → Display → Movement Analysis (inward/outward, effective rates) |
| Stock Query | item-specific detailed view |
| Reorder Status | Gateway → Display → Reorder Status |
| Stock Ageing | Gateway → Display → Ageing |
| Stock Transfers | from Stock Journal register |
| Physical Stock Register | Gateway → Display → Physical Stock |
| Expiry | if batches with expiry enabled |
| Cost of Production | if manufacturing enabled |

### Sales/Purchase
| Report | Path |
|---|---|
| Sales Order Outstanding | by group/category/item/ledger/all — ordered vs undelivered, due date, days overdue |
| Purchase Order Outstanding | same structure |
| Sales Profitability | transaction value, gross revenue, cost, gross profit, margin % |
| Bill-wise Pending | Sales/Purchase |
| Item/Godown/Batch-wise Sales | drill-down from Sales Register |
| Sales Executive-wise | if salesperson tracking enabled |

### GST
| Report | Path |
|---|---|
| GSTR-1 | Gateway → Display → GST → GSTR-1 |
| GSTR-2B | Gateway → Display → GST → GSTR-2B |
| GSTR-3B | Gateway → Display → GST → GSTR-3B |
| GSTR-9 | annual return |
| e-Invoice | Gateway → Display → e-Invoice |
| e-Way Bill | Gateway → Display → e-Way Bill |
| GST Reconciliation | books vs portal |

### Payroll
| Report | Path |
|---|---|
| Payslips | Gateway → Display → Payroll → Payslips |
| Payroll Statement | summary |
| Attendance/Overtime Register | |
| PF/ESI/PT/IT | statutory reports |

### Management
| Report | Path |
|---|---|
| Cost Centre Summary | Gateway → Display → Cost Centres |
| Cost Category Summary | parallel allocation |
| Budget vs Actual | Gateway → Display → Budgets |
| Scenario | what-if scenarios |
| Cash Flow Projection | Gateway → Display → Cash Flow Projections |

### Audit
| Report | Path |
|---|---|
| Tally Audit Listings | Gateway → Display → Tally Audit |
| Edit Log | per-voucher change tracking (cannot disable) |
| Exception Reports | Gateway → Display → Exception |

---

## Multi-company / currency / branch

- **Multi-company:** unlimited companies, Group Company for consolidation (consolidated BS/P&L/TB, inter-company elimination)
- **Multi-currency:** base + foreign, exchange rate maintenance, auto conversion, gain/loss accounting
- **Multi-branch:** separate companies + Group Co, OR single company + godowns + cost centres, OR Branch/Division groups

## Additional features

- **POS:** barcode, multi-mode payment, quick billing, POS Register
- **Banking:** auto bank statement import (145+ banks), auto-voucher creation, Connected Banking (live balance, payment initiation)
- **Security:** user/password, security levels (Owner/Data Entry/Auditor), TallyVault encryption, Tally audit, Edit Log (cannot disable)
- **AI (TallyIra):** Docs by Ira — scan/upload → auto-create entries → GST validation → review/approve

## Integration methods

- **XML (HTTP):** bidirectional, voucher/master import/export, native Tally XML (port 9000)
- **JSON (v3.0+):** bidirectional, modern web/mobile
- **ODBC:** bidirectional, real-time dashboards/Excel/BI
- **TDL (Tally Definition Language):** custom reports, screens, workflows, HTTP actions
- **Import/Export formats:** XML, JSON, Excel, CSV, SDF
