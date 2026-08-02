# T05 — Land acquisition, partition & valuation work end-to-end

> Label: `wayfinder:grilling` · Status: **open` · Blocked by: T01

## Question

Does the land lifecycle work end-to-end — record land purchase (with initial parcel) → partition a
parcel into children (area conservation enforced) → set parcel status → update valuation → sell a
parcel (T06) — with `LandPartition` audit records, GL `postLandPurchase` entry, NRV write-down
flagging, and the `/land` portfolio rollup + `/land/[id]` detail hub reflecting reality?

## Checklist

- [ ] `/land`: record a land purchase with seller + registry info; verify initial parcel created
- [ ] Verify GL land-purchase entry posted (debit land asset, credit cash/payable)
- [ ] `/land/[id]`: partition a parcel into 2+ children; verify Σ child area = parent area,
      parent status = PARTITIONED, `LandPartition` record created
- [ ] Attempt partition with mismatched areas; verify rejection
- [ ] Update a parcel's valuation; verify rollup on `/land` updates
- [ ] Set parcel status (e.g. AVAILABLE → UNDER_DEVELOPMENT); verify state guard
- [ ] Flag NRV write-downs on a parcel; verify `flagNrvWriteDowns()` surfaces it
- [ ] `/land` portfolio rollup: total area, valued area, sold count reconcile
- [ ] Log every defect; fix in priority order

## Resolution

_(filled on close)_
