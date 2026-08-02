# T07 — Finance, GL & expenses work end-to-end

> Label: `wayfinder:grilling` · Status: **open** · Blocked by: T01

## Question

Does the accounting layer reconcile — `seedChartOfAccounts()` run, every mutation across modules
(T02–T06) produced balanced `JournalEntry`+`JournalLine` rows inside the same transaction, the
`/gl` trial balance balances, account ledger drill-down shows the right lines, expenses post
correctly, and `/finance` dashboard P&L matches the GL — so the books never diverge from reality?

## Checklist

- [ ] Verify `seedChartOfAccounts()` has run (13 system accounts present); run if not
- [ ] After T02–T06, pull `/api/gl/trial-balance`; verify it balances (Σ debits = Σ credits)
- [ ] `/gl` UI: trial balance renders; drill into an account (e.g. inventory, WIP, cash); verify
      ledger lines match the source mutations
- [ ] `/finance`: create an expense; verify `postExpense` GL entry + audit log
- [ ] Verify expense delete reverses correctly (or is blocked — check current behavior)
- [ ] `/finance` P&L: revenue, COGS, expenses reconcile to GL revenue/expense accounts
- [ ] Project cost add/delete (T04) reflects in GL + finance dashboard
- [ ] Cross-check: pick one PO receipt, trace its GL entry → trial balance → finance dashboard
- [ ] Log every defect; fix in priority order

## Resolution

_(filled on close)_
