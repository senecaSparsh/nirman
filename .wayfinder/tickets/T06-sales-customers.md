# T06 — Sales & customers work end-to-end

> Label: `wayfinder:grilling` · Status: **open** · Blocked by: T01

## Question

Does the sales lifecycle work end-to-end — create customer → sell a land parcel or built unit
(double-sell guard) → record payments → verify profit computation, payment status, GL
`postAssetSale` + `postPaymentReceived` entries, asset marked sold, and `/sales` list reflecting
profit per sale — and does cancelling a sale (with no payments) correctly release the asset?

## Checklist

- [ ] `/customers`: create a customer; verify CRUD + active-sales count
- [ ] `/sales`: sell a land parcel (from T05); verify double-sell guard rejects re-selling it
- [ ] Sell a built unit (from T04); verify unit marked SOLD, production cost carried into profit
- [ ] Record a payment; verify `postPaymentReceived` GL entry + payment status (PARTIAL/FULL)
- [ ] Verify `computeSaleProfit()` matches displayed profit (revenue − cost − GST)
- [ ] Cancel a sale with no payments; verify asset released back to sellable
- [ ] Attempt cancel with payments; verify rejection
- [ ] `/sales` list: profit, payment status, asset type filters work
- [ ] Log every defect; fix in priority order

## Resolution

_(filled on close)_
