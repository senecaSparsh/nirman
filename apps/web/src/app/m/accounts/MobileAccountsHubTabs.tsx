"use client";

import { useTabParam } from "@/lib/use-tab-param";
import { MobileFab } from "@/components/mobile/v2/scaffold";
import { RegisterTabs } from "@/components/mobile/v2/register-tabs";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { useFabModal } from "@/lib/use-fab-modal";
import { MobileFinanceFab } from "../books/finance/MobileNewFinanceDialog";
import { MobileNewExpenseClaimClient } from "../expense-claims/new/MobileNewExpenseClaimClient";
import { MobileNewPettyCashClient } from "../petty-cash/new/MobileNewPettyCashClient";
import { MobileNewSupplierPaymentClient } from "../supplier-payments/new/MobileNewSupplierPaymentClient";

const TABS = ["overview", "expenses", "claims", "petty-cash", "payments", "receipts", "gl"] as const;
type TabValue = (typeof TABS)[number];

const TAB_META: { value: TabValue; label: string; count?: number }[] = [
  { value: "overview", label: "Overview" },
  { value: "expenses", label: "Expenses" },
  { value: "claims", label: "Claims" },
  { value: "petty-cash", label: "Petty Cash" },
  { value: "payments", label: "Payments" },
  { value: "receipts", label: "Receipts" },
  { value: "gl", label: "GL" },
];

interface ProjectOption {
  id: string;
  name: string;
}

interface SubcontractorOption {
  id: string;
  name: string;
  trade: string | null;
}

interface EmployeeOption {
  id: string;
  name: string;
}

interface SupplierOption {
  id: string;
  name: string;
  balanceOwed: string;
}

interface PoOption {
  id: string;
  poNumber: string;
  supplierId: string;
  total: string;
  status: string;
}

interface InvoiceOption {
  id: string;
  invoiceNumber: string;
  supplierId: string;
  totalAmount: string;
  status: string;
}

/**
 * MobileAccountsHubTabs — the tab bar wrapper for the Accounts/Finance hub.
 *
 * Groups Overview (dashboard), Expenses, Claims, Petty Cash, Supplier
 * Payments, Receipts, and GL into one tabbed page at /m/accounts — same
 * pattern as /m/stock and /m/procurement.
 *
 * The tab lives in `?tab=` so it's shareable and back-button friendly.
 * The content below the tab bar is server-rendered children — the page.tsx
 * conditionally fetches data and renders the appropriate component based
 * on the active tab.
 *
 * FAB: each list tab gets a floating "+" button, consistent with the
 * procurement hub. Expenses uses MobileFinanceFab (self-contained FAB +
 * dialog, same as /m/books/finance). Claims, petty-cash, and payments
 * open inline dialog forms (MobileFabModal) — same pattern as procurement.
 * Receipts and GL have no create action.
 */
export function MobileAccountsHubTabs({
  counts = {},
  children,
  // FAB props
  projects = [],
  subcontractors = [],
  employees = [],
  suppliers = [],
  purchaseOrders = [],
  invoices = [],
  canCreateExpense = false,
  canCreateProjectCost = false,
  canCreateClaim = false,
  canManagePettyCash = false,
  canManagePayments = false,
  expenseCategories = [],
  currentUserId = null,
}: {
  activeTab?: string;
  counts?: Partial<Record<TabValue, number>>;
  children: React.ReactNode;
  projects?: ProjectOption[];
  subcontractors?: SubcontractorOption[];
  employees?: EmployeeOption[];
  suppliers?: SupplierOption[];
  purchaseOrders?: PoOption[];
  invoices?: InvoiceOption[];
  canCreateExpense?: boolean;
  canCreateProjectCost?: boolean;
  canCreateClaim?: boolean;
  canManagePettyCash?: boolean;
  canManagePayments?: boolean;
  expenseCategories?: { id: string; name: string; isActive: boolean }[];
  currentUserId?: string | null;
}) {
  const [tab, setTab] = useTabParam(TABS, "overview");
  const claimFab = useFabModal();
  const pettyCashFab = useFabModal();
  const paymentFab = useFabModal();

  const tabsWithCounts = TAB_META.map((t) => ({
    ...t,
    count: counts[t.value as TabValue],
  }));

  // Determine FAB visibility per tab
  const showExpenseFab = tab === "expenses" && (canCreateExpense || canCreateProjectCost);
  const showClaimFab = tab === "claims" && canCreateClaim;
  const showPettyCashFab = tab === "petty-cash" && canManagePettyCash;
  const showPaymentFab = tab === "payments" && canManagePayments;

  return (
    <div>
      <RegisterTabs tabs={tabsWithCounts} value={tab} onChange={setTab} />
      {children}

      {/* ── FAB per tab ── */}
      {showExpenseFab && (
        <MobileFinanceFab
          projects={projects}
          subcontractors={subcontractors}
          canCreateExpense={canCreateExpense}
          canCreateProjectCost={canCreateProjectCost}
        />
      )}
      {showClaimFab && (
        <>
          <MobileFab
            onClick={claimFab.toggle}
            label="New claim"
            isOpen={claimFab.isOpen}
          />
          <MobileFabModal open={claimFab.isOpen} onClose={claimFab.close} originRect={claimFab.originRect} title="New Expense Claim">
            <MobileNewExpenseClaimClient
              employees={employees}
              projects={projects}
              categories={expenseCategories}
              currentUserId={currentUserId}
              onClose={claimFab.close}
              onCreated={() => { claimFab.close(); window.location.reload(); }}
            />
          </MobileFabModal>
        </>
      )}
      {showPettyCashFab && (
        <>
          <MobileFab
            onClick={pettyCashFab.toggle}
            label="Create float"
            isOpen={pettyCashFab.isOpen}
          />
          <MobileFabModal open={pettyCashFab.isOpen} onClose={pettyCashFab.close} originRect={pettyCashFab.originRect} title="New Petty Cash Float">
            <MobileNewPettyCashClient
              projects={projects}
              employees={employees}
              currentUserId={currentUserId}
              onClose={pettyCashFab.close}
              onCreated={() => { pettyCashFab.close(); window.location.reload(); }}
            />
          </MobileFabModal>
        </>
      )}
      {showPaymentFab && (
        <>
          <MobileFab
            onClick={paymentFab.toggle}
            label="Record payment"
            isOpen={paymentFab.isOpen}
          />
          <MobileFabModal open={paymentFab.isOpen} onClose={paymentFab.close} originRect={paymentFab.originRect} title="New Supplier Payment">
            <MobileNewSupplierPaymentClient
              suppliers={suppliers}
              purchaseOrders={purchaseOrders}
              invoices={invoices}
              onClose={paymentFab.close}
              onCreated={() => { paymentFab.close(); window.location.reload(); }}
            />
          </MobileFabModal>
        </>
      )}
    </div>
  );
}
