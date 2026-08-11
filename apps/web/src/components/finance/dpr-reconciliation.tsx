/**
 * DPR-Finance Reconciliation — re-export from the canonical location.
 *
 * The spec (docs/UX-AUDIT.md line 289) references this path:
 *   apps/web/src/components/finance/dpr-reconciliation.tsx
 *
 * The actual implementation lives in:
 *   apps/web/src/components/dpr/dpr-finance-reconciliation-view.tsx
 *
 * This file provides a re-export so both import paths work.
 */
export { DprFinanceReconciliationView as DprReconciliation } from "@/components/dpr/dpr-finance-reconciliation-view";
