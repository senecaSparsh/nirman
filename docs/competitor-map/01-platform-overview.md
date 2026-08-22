# 01 — Platform Overview

## Positioning at a glance

| Dimension | 4QT | Tally (TallyPrime) | Zoho (Zoho One suite) |
|---|---|---|---|
| **Type** | Vertical ERP — Real Estate / Construction | Horizontal accounting + inventory ERP | Suite of 55+ horizontal SaaS apps |
| **Origin** | Noida, India (2015) | Bangalore, India (1986) | Chennai, India (1996) |
| **Target customer** | Builders, developers, contractors | SMBs across all industries | SMB to mid-market, all industries |
| **Deployment** | Cloud + on-prem | Desktop (Windows) + Cloud Access + TallyPrime Cloud | Cloud-only (SaaS) |
| **Customers (claimed)** | 800+ in 35+ Indian cities | 2M+ businesses globally | 100M+ users globally |
| **Core differentiator** | Industry workflows: RERA, possession, broker commission, demand notices | Deep accounting + GST compliance + 400+ reports + keyboard-first entry | Best-in-suite native integration + low-code (Creator) + Deluge scripting |
| **Pricing model** | Custom quote (modules + users + projects + deployment) | One-time license + AMC | Per-user subscription (annual) |
| **Entry price (est.)** | Contact vendor (likely ₹3,000-8,000/user/mo) | Silver single-user ~₹22,500 + GST one-time | Zoho One Essentials ~$15/user/mo |
| **API maturity** | Limited (REST/GraphQL, not publicly documented) | XML (HTTP), JSON (v3+), ODBC, TDL | Mature REST per app, OAuth2, SDKs in 6 languages |
| **Mobile** | iOS/Android ERP app + Customer Portal app + Channel Partner app | Report viewer + TallyPrime Cloud Access (remote desktop) | Per-app native iOS/Android + Zoho One unified app |

## Architecture

### 4QT
- **Stack:** React/Angular frontend, .NET/C# + Python/Java backend, MS SQL Server / MySQL / MongoDB, GCP, Docker/K8s
- **Multi-tenancy:** Multi-company, multi-project
- **APIs:** REST/GraphQL (not publicly documented)
- **Portals:** Customer Portal (separate app), Channel Partner Portal (separate app), Mobile ERP app

### TallyPrime
- **Stack:** Native C++ desktop app, proprietary file-based DB (.900 files), TDL (Tally Definition Language) for customization
- **Multi-tenancy:** Multi-company (unlimited), Group Company for consolidation
- **APIs:** XML (HTTP on port 9000), JSON (v3.0+), ODBC, TDL HTTP actions
- **Cloud:** TallyPrime Cloud Access (remote desktop to a hosted Tally instance), online report viewer, mobile report access, Tally.NET Sync

### Zoho
- **Stack:** Cloud-native, per-app microservices, Deluge scripting language, REST APIs, OAuth2
- **Multi-tenancy:** Multi-org per app, Zoho Directory for SSO
- **APIs:** REST per app, SDKs (Java/Python/Node/PHP/.NET/Ruby), Zoho Flow (1000+ connectors), webhooks
- **Mobile:** Per-app native iOS/Android + Zoho One unified app (admin console, push notifications, offline mode, biometric login)

## Module coverage matrix (high level)

| Module | 4QT | Tally | Zoho (which app) |
|---|---|---|---|
| Lead Management / CRM | ✅ Built-in | ❌ (manual ledgers) | ✅ Zoho CRM |
| Sales / Booking | ✅ Built-in | ✅ Sales vouchers | ✅ Zoho Books/Invoice |
| Procurement / PO | ✅ Built-in | ✅ Purchase vouchers | ✅ Zoho Inventory/Books |
| Inventory / Stock | ✅ Built-in | ✅ Deep | ✅ Zoho Inventory |
| Construction / Project Mgmt | ✅ Built-in (core) | ⚠️ Cost centres only | ✅ Zoho Projects |
| BOQ / Rate Analysis | ✅ Built-in | ❌ | ❌ (needs Creator) |
| DPR (Daily Progress Report) | ✅ Built-in | ❌ | ❌ (needs Creator) |
| Contractor / Work Order | ✅ Built-in | ⚠️ Job work | ❌ (needs Creator) |
| Accounting / GL | ✅ Built-in | ✅ Gold standard | ✅ Zoho Books |
| GST / Tax Compliance | ✅ Built-in | ✅ Gold standard | ✅ Zoho Books |
| HR / Payroll | ✅ Built-in | ✅ Payroll module | ✅ Zoho People + Payroll |
| Attendance (GPS/biometric) | ✅ Built-in | ⚠️ Attendance voucher | ✅ Zoho People |
| Customer Portal | ✅ Built-in | ❌ | ✅ Zoho Desk/CRM portal |
| Channel Partner / Broker Portal | ✅ Built-in | ❌ | ⚠️ Via CRM partner portal |
| Post-sales / Complaints | ✅ Built-in | ❌ | ✅ Zoho Desk |
| Lease / Rental Management | ✅ Built-in | ❌ | ❌ (needs Creator) |
| Facilities / Mall Management | ✅ Built-in | ❌ | ❌ (needs Creator) |
| Land / Parcel Management | ✅ Built-in | ❌ | ❌ (needs Creator) |
| Banking / Reconciliation | ✅ Built-in | ✅ Deep | ✅ Zoho Books |
| Manufacturing / BoM | ❌ | ✅ | ✅ Zoho Inventory (composite items) |
| Low-Code Custom Apps | ❌ | ⚠️ TDL | ✅ Zoho Creator |
| Business Intelligence | ⚠️ Basic dashboards | ⚠️ 400+ reports | ✅ Zoho Analytics |
| Workflow Automation | ✅ Built-in | ⚠️ TDL | ✅ Zoho Flow + Blueprints |

## Pricing detail

| Platform | Model | Entry | Mid | Enterprise |
|---|---|---|---|---|
| **4QT** | Custom quote | Contact vendor | Contact vendor | Contact vendor |
| **TallyPrime** | One-time + AMC | Silver (single user) ~₹22,500 + GST | Gold (multi-user) ~₹67,500 + GST | TallyPrime Cloud subscription |
| **Zoho One** | Per-user/yr | Essentials ~$15/user/mo (15+ apps) | Standard All-Employee $37/user/mo (50+ apps) | Standard Flexible $90/user/mo (50+ apps) |
| **Zoho (individual)** | Per-app | Free tiers (CRM 3 users, Books <$50K rev, Inventory 50 orders/mo) | Standard $14-39 | Professional $23-79, Enterprise $40-129 |

## Key takeaway

- **4QT** is the closest functional analog to Nirman — vertical real-estate ERP with booking, possession, broker, demand notices.
- **Tally** is the accounting/GST gold standard that most Indian builders' CAs already use; Nirman should integrate, not replace.
- **Zoho** is the modular suite to learn UX/integration patterns from — visual blueprints, low-code, per-app APIs, unified mobile.
