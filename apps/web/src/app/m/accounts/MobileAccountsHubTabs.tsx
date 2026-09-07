"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTabParam } from "@/lib/use-tab-param";
import { MobileFab } from "@/components/mobile/v2/scaffold";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { RegisterTabs } from "@/components/mobile/v2/register-tabs";
import { MobileNewFinanceDialog } from "../books/finance/MobileNewFinanceDialog";

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
 * procurement hub. Expenses opens the finance dialog (expense + project
 * cost). Claims, petty-cash, and payments navigate to their respective
 * /new pages (full-screen forms). Receipts and GL have no create action.
 */
export function MobileAccountsHubTabs({
  counts = {},
  children,
  // FAB props
  projects = [],
  subcontractors = [],
  canCreateExpense = false,
  canCreateProjectCost = false,
  canCreateClaim = false,
  canManagePettyCash = false,
  canManagePayments = false,
}: {
  activeTab?: string;
  counts?: Partial<Record<TabValue, number>>;
  children: React.ReactNode;
  projects?: ProjectOption[];
  subcontractors?: SubcontractorOption[];
  canCreateExpense?: boolean;
  canCreateProjectCost?: boolean;
  canCreateClaim?: boolean;
  canManagePettyCash?: boolean;
  canManagePayments?: boolean;
}) {
  const [tab, setTab] = useTabParam(TABS, "overview");
  const router = useRouter();

  // ── Modal form state (matches procurement hub pattern) ──
  const [showForm, setShowForm] = useState<TabValue | null>(null);
  const [fabRect, setFabRect] = useState<DOMRect | null>(null);

  // Close any open form when the tab changes
  useEffect(() => {
    setShowForm(null);
    setFabRect(null);
  }, [tab]);

  const openForm = useCallback((which: TabValue, e?: React.MouseEvent) => {
    if (showForm === which) {
      closeForm();
      return;
    }
    if (e?.currentTarget instanceof HTMLElement) {
      setFabRect(e.currentTarget.getBoundingClientRect());
    } else {
      setFabRect(null);
    }
    setShowForm(which);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showForm]);

  function closeForm() {
    setShowForm(null);
    setFabRect(null);
    router.refresh();
  }

  // Navigate to a /new page (for tabs with full-screen forms)
  function navigateToNew(href: string) {
    window.location.assign(href);
  }

  const tabsWithCounts = TAB_META.map((t) => ({
    ...t,
    count: counts[t.value as TabValue],
  }));

  // Determine FAB visibility and label per tab
  const showExpenseFab = tab === "expenses" && (canCreateExpense || canCreateProjectCost);
  const showClaimFab = tab === "claims" && canCreateClaim;
  const showPettyCashFab = tab === "petty-cash" && canManagePettyCash;
  const showPaymentFab = tab === "payments" && canManagePayments;

  return (
    <div>
      <RegisterTabs tabs={tabsWithCounts} value={tab} onChange={setTab} />
      {children}

      {/* ── FAB per tab (matches procurement hub pattern) ── */}
      {showExpenseFab && (
        <MobileFab
          onClick={(e) => openForm("expenses", e)}
          label="Add expense"
          isOpen={showForm === "expenses"}
        />
      )}
      {showClaimFab && (
        <MobileFab
          onClick={() => navigateToNew("/m/expense-claims/new")}
          label="New claim"
        />
      )}
      {showPettyCashFab && (
        <MobileFab
          onClick={() => navigateToNew("/m/petty-cash/new")}
          label="Create float"
        />
      )}
      {showPaymentFab && (
        <MobileFab
          onClick={() => navigateToNew("/m/supplier-payments/new")}
          label="Record payment"
        />
      )}

      {/* ── Dialog forms (spring up from the FAB) ── */}
      <MobileFabModal
        open={showForm === "expenses"}
        onClose={closeForm}
        originRect={fabRect}
        title="Add Expense"
      >
        <MobileNewFinanceDialog
          open={showForm === "expenses"}
          onClose={closeForm}
          projects={projects}
          subcontractors={subcontractors}
          canCreateExpense={canCreateExpense}
          canCreateProjectCost={canCreateProjectCost}
          initialTab="expense"
        />
      </MobileFabModal>
    </div>
  );
}
