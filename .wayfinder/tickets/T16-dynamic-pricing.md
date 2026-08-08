# T16 — Dynamic Pricing & Valuation Post-Renovation

> Label: `wayfinder:build` · Status: **open** · Claimed by: — · Blocked by: T04 (closed), T08 (equipment)

## Question

The brother's design specifies a "Dynamic Pricing Module" that calculates valuation changes
post-renovation/addition. The app currently has:
- `BuiltUnit.currentValuation` and `BuiltUnit.askingPrice` (manually set)
- `BuiltUnit.productionCost` (auto-computed from cost-per-sqft allocation)
- `LandParcel.currentValuation` and `LandParcel.askingPrice` (manually set)
- Project costs (labour, overhead, equipment, contractor, permit) flow into `totalProjectCost` → `costPerSqft` → `unit.productionCost`

But there's no concept of:
- Renovation as a distinct activity (vs. initial construction)
- Value-add tracking (cost of renovation → new valuation)
- Automatic valuation recalculation after renovation
- Profitability analysis comparing cost-basis vs. post-renovation valuation vs. sale price

## What needs to be built

### A. Renovation/Value-Add Tracking
- **RenovationProject model**: (unitId/parcelId, type: RENOVATION/ADDITION/ENHANCEMENT, description, startDate, endDate, totalCost, status)
- Link renovation costs to project costs (or a separate cost category)
- Track cost-basis before vs. after renovation

### B. Dynamic Valuation
- After renovation completes, auto-recalculate `currentValuation` = old valuation + renovation cost + market adjustment
- Or: manual valuation update with renovation cost as a baseline suggestion
- NRV (Net Realizable Value) write-down logic if post-renovation valuation < cost basis

### C. Profitability Analysis
- Per-unit: acquisition cost + construction cost + renovation cost vs. current valuation vs. sale price
- ROI calculation: (sale price - total cost) / total cost
- Comparison report: pre-renovation vs. post-renovation profitability

## Resolution

_(not started — this is a new module build ticket)_
