# 07 — Accounting / GL Comparison

> Vouchers, GL, GST, TDS, bank reconciliation, reports — side by side.

## Chart of Accounts

| Dimension | 4QT | Tally | Zoho Books |
|---|---|---|---|
| **Structure** | Built-in (project-wise tracking) | 28 pre-defined groups + custom | Custom groups + ledgers |
| **Pre-defined groups** | Project, cost centre | 15 primary + 13 sub (Bank, Cash, Sundry Debtors/Creditors, Duties & Taxes, etc.) | Standard accounting groups (Asset, Liability, Income, Expense, Equity) |
| **Custom groups** | Yes | Yes | Yes |
| **Multi-company** | Multi-company, multi-project | Unlimited + Group Company consolidation | Multi-org |

## Voucher Types

| Dimension | 4QT | Tally | Zoho Books |
|---|---|---|---|
| **Types** | Built-in transaction types | 24 pre-defined + custom | Invoice, Bill, Journal, Payment, Receipt, Credit Note, Debit Note |
| **Custom voucher types** | — | Yes (inherit from pre-defined) | — |
| **Voucher classes** | — | Yes (predefined rules per class) | — |
| **Voucher numbering** | Auto | Automatic / Manual / Multi-user Auto / Automatic (Manual Override) | Auto + custom series |
| **Optional vouchers** | — | Yes (Ctrl+L, no books impact) | — |
| **Post-dated vouchers** | — | Yes (Ctrl+T) | — |

## Cost Centres / Project Tracking

| Dimension | 4QT | Tally | Zoho Books |
|---|---|---|---|
| **Model** | Project-wise financial tracking | Cost Centres + Cost Categories (parallel allocation) | Projects + tracking categories |
| **Hierarchy** | Project → phase | Hierarchical cost centres | Project → task |
| **Budgets** | Budget forecasting | Ledger/Cost Centre/Group-wise + variance | Budgets vs actuals |
| **Parallel allocation** | — | Cost Categories (multiple parallel dimensions) | Tracking categories (multiple) |

## Bank Reconciliation

| Dimension | 4QT | Tally | Zoho Books |
|---|---|---|---|
| **Manual** | Built-in | Manual | Manual |
| **Auto import** | `[inferred]` | Auto import from 145+ banks | Bank feeds (auto from major banks) |
| **Auto-match** | `[inferred]` | Auto-voucher creation | Auto-match by amount/date + rules |
| **Connected banking** | — | Connected Banking (live balance, payment initiation) | — |
| **Cheque mgmt** | — | Cheque Management | — |

## GST / Taxation

| Dimension | 4QT | Tally | Zoho Books |
|---|---|---|---|
| **GST calc** | Built-in compliance | Auto by party state + item HSN (gold standard) | Auto by location + item tax |
| **e-Invoicing** | `[inferred]` | IRN generation, QR code, signed invoice (turnover > ₹5cr) | e-Invoicing (IRN + QR) |
| **e-Way Bill** | `[inferred]` | Generation, Part A/B, validity, extension (> ₹50K interstate) | e-Way Bill generation |
| **GSTR-1** | Built-in | Filing: B2B, B2C, export, nil-rated, exempt | GSTR-1 report |
| **GSTR-2B** | — | Auto ITC from portal | GSTR-2B reconciliation |
| **GSTR-3B** | Built-in | Summary, tax liability, ITC, auto from 2B | GSTR-3B report |
| **GSTR-9** | — | Annual return | GSTR-9 report |
| **GST reconciliation** | — | Books vs portal, missing invoices, ITC recon | Books-vs-portal recon |
| **TDS** | TDS reports | Full TDS (section-wise, threshold, challan, returns) | TDS |
| **TCS** | — | Section 206C(1H) 0.1% > ₹50L | TCS (configurable) |

## Multi-currency

| Dimension | 4QT | Tally | Zoho Books |
|---|---|---|---|
| **Support** | — `[inferred]` | Full (base + foreign, exchange rate, gain/loss) | Full |
| **Auto conversion** | — | Yes | Yes |
| **Realized/ unrealized gain/loss** | — | Yes | Yes |

## Consolidation

| Dimension | 4QT | Tally | Zoho Books |
|---|---|---|---|
| **Multi-company** | Multi-company | Unlimited companies | Multi-org |
| **Group consolidation** | — | Group Company (consolidated BS/P&L/TB, inter-company elimination) | — (needs Analytics) |

## Interest Calculation

| Dimension | 4QT | Tally | Zoho Books |
|---|---|---|---|
| **On receivables** | Delayed payment interest (configurable, simple/compound) | Built-in interest calculation | — |
| **On payables** | — | Built-in | — |

## Bill-wise Management

| Dimension | 4QT | Tally | Zoho Books |
|---|---|---|---|
| **Allocation** | Outstanding tracking | Agst Ref / New Ref / Advance | Bill tracking (linked to invoice) |
| **Ageing** | Aging reports | Bill-wise ageing | A/R Aging, A/P Aging |

## Reports

| Category | 4QT | Tally | Zoho Books |
|---|---|---|---|
| **Total** | ~60-80 | 400+ | 50+ |
| **Financial statements** | TB, P&L, BS, Cash Flow, Fund Flow | TB, P&L, BS, Ratio Analysis, Cash Flow, Funds Flow | TB, P&L, BS, Cash Flow, Funds Flow, General Ledger |
| **Registers** | — | Day Book, Sales/Purchase/Journal/Contra/Payment/Receipt Register, Credit/Debit Note Register | Sales by Customer/Item/SalesPerson, A/R Aging, Invoice Details, Overdue, A/P Aging, Bill Details, Vendor Payments |
| **Inventory** | Stock, inventory valuation | Stock Summary, Item/Group/Category/Godown/Batch Summary, Movement Analysis, Reorder, Ageing, Expiry | Inventory Summary, Valuation, Stock Aging, ABC, Slow Moving |
| **GST** | GST returns | GSTR-1/2B/3B/9, e-Invoice, e-Way Bill, Reconciliation | Tax Summary, GST, 1099 |
| **Audit** | Audit trails | Tally Audit + Edit Log (immutable, cannot disable) + digital signature | Audit log |

## Audit & Security

| Dimension | 4QT | Tally | Zoho Books |
|---|---|---|---|
| **Audit trail** | Audit trails | Tally audit + Edit Log (cannot disable) | Audit log per app |
| **Encryption** | — | TallyVault encryption | — |
| **Security levels** | Role-based | Owner / Data Entry / Auditor + custom | Role-based + field-level |

## Integration

| Dimension | 4QT | Tally | Zoho Books |
|---|---|---|---|
| **Export to** | Tally, SAP, Oracle, QuickBooks, Xero | — (is the accounting system) | Native between Zoho apps |
| **Import from** | — | XML, JSON, Excel, CSV, SDF | CSV, Excel |
| **API** | REST/GraphQL (undocumented) | XML (HTTP), JSON (v3+), ODBC | REST, OAuth2 |
