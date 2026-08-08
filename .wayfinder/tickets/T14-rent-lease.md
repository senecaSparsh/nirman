# T14 — Rent & Lease Module

> Label: `wayfinder:build` · Status: **open** · Claimed by: — · Blocked by: nothing (new module)

## Question

The brother's design specifies "Sell and Rent/Lease workflows" for real estate assets. The app
currently only has sell (AssetSale). Rent/lease is completely missing.

## What exists

- `AssetSale` model for selling built units and land parcels (one-time transaction)
- `BuiltUnit` status: PLANNED → UNDER_CONSTRUCTION → AVAILABLE → SOLD
- `LandParcel` status: AVAILABLE → PARTITIONED → SOLD → HOLD
- No rent, lease, tenancy, or rental agreement models
- No recurring billing infrastructure

## What needs to be built

### A. Tenancy/Rental Agreement
- **Tenancy model**: (unitId/parcelId, tenantId/customerId, startDate, endDate, monthlyRent, securityDeposit, status: ACTIVE/EXPIRED/TERMINATED, agreementUrl)
- **RentalPayment model**: (tenancyId, amount, dueDate, paidDate, status: PENDING/PAID/OVERDUE, paymentMode)
- Unit status expansion: add RENTED, LEASED to BuiltUnit and LandParcel status enums
- GL posting: Dr Cash, Cr Rental Income (on payment); Dr Cash, Cr Security Deposit Liability (on deposit)

### B. Recurring Billing
- Monthly rent generation (scheduled workflow or manual trigger)
- Payment tracking with overdue alerts
- Late fee computation (optional)

### C. UI
- Tenancy management page
- Rental payment tracking
- Tenant management (reuse Customer model or create Tenant)
- Reports: rental income, occupancy rate, arrears

## Resolution

_(not started — this is a new module build ticket)_
