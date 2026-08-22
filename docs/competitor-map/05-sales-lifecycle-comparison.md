# 05 — Sales Lifecycle Comparison

> The full sales lifecycle: Lead → Quote → Order → Invoice → Payment → Return.
> Side by side across 4QT, Tally, and Zoho — with entry points, clicks, and logic.

## What "Sale Calling" means

- **NOT a Tally feature.** "Tally calling" = outbound sales calls to sell Tally software (telecalling job descriptions).
- In ERP context, the equivalent processes are: Sales Order Booking, Order Calling (converting orders to invoices), Stock Allocation, Follow-up Calls (tracking order status via reports).

## Sales flow at a glance

```
Lead/Enquiry → Quotation → Sales Order → [Delivery Note/Shipment] → Invoice → Payment → [Credit Note if return]
                                                                        ↓
                                                              Outstanding Tracking → Aging → Recovery
```

## Step-by-step comparison

### Step 1: Order Creation

| Dimension | 4QT | Tally | Zoho |
|---|---|---|---|
| **Entry** | Booking management (property allotment) | Sales Order voucher (Alt+F5) | Sales Order in Books/Inventory |
| **Trigger** | Lead conversion / direct booking | Manual (customer confirms) | Manual / from Deal (CRM) / from Quote |
| **Fields** | Customer, unit, booking amount, payment plan | Party A/c, Order No, Date, Due Date, Sales Ledger, Item (qty, rate) | Customer, SO#, Date, Items (qty, rate, tax), warehouse |
| **Clicks/Keys** | ~10 taps | ~25-30 keypresses (2-line order) | ~12-15 clicks |
| **Stock reservation** | Inventory status / double-booking prevention | Order tracking (no stock hold unless tracking numbers) | Pick list generation, stock commitment |
| **GL impact** | No (booking is commercial, not financial) | No (order is non-posting) | No (SO is non-posting) |
| **Result** | Unit → Booked, allotment letter generated | Sales Order created, appears in Outstanding report | SO created, stock reserved, appears in SO list |

### Step 2: Delivery / Dispatch

| Dimension | 4QT | Tally | Zoho |
|---|---|---|---|
| **Entry** | Possession handover | Delivery Note (Alt+F8) | Shipment / Package creation |
| **Trigger** | Construction completion + possession | Manual (goods dispatched) | Manual (after pick + pack) |
| **Steps** | Possession notice → checklist → certificate → keys | Select SO → Delivery Note → items, qty → save | Picklist → Package → Shipment (manual or carrier) |
| **Clicks/Keys** | ~12 taps | ~15 keypresses | ~15-20 clicks (pick + pack + ship) |
| **Stock impact** | N/A (real estate) | Stock reduced (if item invoice) | Stock reduced |
| **Carrier integration** | N/A | No | FedEx/UPS/DHL/USPS, tracking, labels |

### Step 3: Invoicing

| Dimension | 4QT | Tally | Zoho |
|---|---|---|---|
| **Entry** | Demand notice + payment receipt | Sales Invoice (F8), linked to order | Invoice, linked to SO |
| **Trigger** | Construction milestone (auto-demand) | Manual | Manual / auto from Books-Inventory sync |
| **Modes** | Demand notice (stage-wise) | Item Invoice (goods) / Accounting Invoice (services) / As Voucher | Regular / Recurring / Retainer |
| **GST** | Built-in compliance | Auto by party state + item HSN (CGST/SGST/IGST) | Auto by location + item tax |
| **TCS** | — | Section 206C(1H) 0.1% > ₹50L | Configurable tax |
| **Clicks/Keys** | ~3 taps (auto-demand) | ~30-40 keypresses (2-line + GST) | ~15-20 clicks |
| **Result** | Demand PDF, notification sent | GL entry (Dr Party, Cr Sales + Tax), stock reduced, GSTR-1 updated | Invoice created, A/R updated, GL entry (if Books) |

### Step 4: Payment Collection

| Dimension | 4QT | Tally | Zoho |
|---|---|---|---|
| **Entry** | Customer detail → Receive Payment | Receipt voucher (F6) | Invoice → Record Payment |
| **Bill-wise** | Outstanding tracking | Agst Ref / New Ref / Advance | Linked to invoice automatically |
| **Modes** | Cheque/RTGS/NEFT/Cash/Card | Cash/Bank ledger | Cash/Cheque/Online (Stripe/PayPal) |
| **Clicks/Keys** | ~6 taps | ~15-20 keypresses (with bill-wise) | ~7 clicks |
| **Result** | Receipt PDF, GL entry, outstanding reduced | GL entry (Dr Cash/Bank, Cr Party), bill outstanding reduced, ageing updated | Invoice → Paid, GL entry, A/R reduced |
| **Auto-reminders** | Pre-due, due, post-due (3/7/15 days) | No (manual) | Auto-reminders (configurable) |

### Step 5: Returns / Cancellation

| Dimension | 4QT | Tally | Zoho |
|---|---|---|---|
| **Entry** | Cancellation/surrender workflow | Credit Note (Ctrl+F8) | Credit Note in Books/Inventory |
| **Reference** | Booking record | Agst Ref (before payment) / New Ref (after) | Linked to original invoice |
| **GST** | — | Included in GSTR-1, reduces output tax, reason required | Reverses tax, updates GSTR |
| **Fee/Refund** | Cancellation fee + refund calc + approval | No (manual) | No (manual) |
| **Clicks/Keys** | ~8-12 taps | ~15 keypresses | ~8 clicks |
| **Result** | Unit → Available, refund processed | Stock increased, GL reversed, GSTR-1 updated | Stock increased (if item), GL reversed, A/R adjusted |

### Step 6: Outstanding Tracking

| Dimension | 4QT | Tally | Zoho |
|---|---|---|---|
| **Reports** | Aging reports, recovery mgmt | Sales Order Outstanding, Bill-wise Pending, Ageing | A/R Aging, Overdue Invoices |
| **Interest** | Delayed payment interest (configurable, simple/compound) | Built-in interest calculation | No (manual) |
| **Recovery** | Recovery management module | Ageing + follow-up (manual) | Dunning emails (automated) |

### Pricing

| Dimension | 4QT | Tally | Zoho |
|---|---|---|---|
| **Model** | Project/unit pricing + broker commission | Price Lists + Price Levels (wholesaler/distributor/retailer) | Price Lists per customer |
| **Discounts** | Negotiation tracking | Item-level, invoice-level, price-list, quantity slab | Item-level, invoice-level, price-list |

---

## Click count summary (happy path: order → invoice → payment)

| Platform | Order | Invoice | Payment | Total |
|---|---|---|---|---|
| 4QT (booking → demand → receipt) | ~10 | ~3 (auto-demand) | ~6 | ~19 |
| Tally (SO → Sales → Receipt) | ~27 | ~35 | ~18 | ~80 keypresses |
| Zoho (SO → Invoice → Payment) | ~14 | ~18 | ~7 | ~39 clicks |

**Note:** Tally's higher count is keystrokes, not mouse clicks — experienced users do 200+ vouchers/hour. Zoho's count is mouse clicks. 4QT's count is taps (web/mobile).

---

## Cross-platform sales flow logic

```
Lead/Enquiry
    ↓
Quotation (4QT: negotiation; Tally: optional; Zoho: Quote in CRM/Books)
    ↓
Sales Order (4QT: Booking; Tally: Alt+F5; Zoho: SO in Books/Inventory)
    ↓
[Delivery Note / Shipment] (4QT: Possession; Tally: Alt+F8; Zoho: Pick→Pack→Ship)
    ↓
Invoice (4QT: Demand Notice; Tally: F8; Zoho: Invoice in Books)
    ↓
Payment (4QT: Receipt; Tally: F6 bill-wise; Zoho: Record Payment)
    ↓
[Credit Note if return] (4QT: Cancellation; Tally: Ctrl+F8; Zoho: Credit Note)
    ↓
Outstanding Tracking → Aging → Recovery/Interest
```

Each platform uses different vocabulary for the same business step:
- 4QT: "Booking" = order, "Demand Notice" = invoice, "Possession" = delivery
- Tally: "Sales Order" = order, "Sales Voucher" = invoice, "Delivery Note" = dispatch
- Zoho: "Sales Order" = order, "Invoice" = invoice, "Shipment" = delivery
