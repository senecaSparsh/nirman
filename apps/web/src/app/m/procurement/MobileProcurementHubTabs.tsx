"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ClipboardList, FileText, Truck, Undo2 } from "lucide-react";
import { useTabParam } from "@/lib/use-tab-param";
import { MobileFab } from "@/components/mobile/v2/scaffold";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { RegisterTabs } from "@/components/mobile/v2/register-tabs";
import { MobileProcurementList, type ProcurementListItem, type DirectPurchaseListItem } from "./MobileProcurementList";
import { MobileRequisitionsList, type RequisitionListItem } from "../requisitions/MobileRequisitionsList";
import { MobileQuotationsList, type QuotationListItem } from "../quotations/MobileQuotationsList";
import { MobileSupplierReturnsList, type SupplierReturnItem } from "../supplier-returns/MobileSupplierReturnsList";
import { MobileStatCard, MobileEmptyState, MobileSectionTitle } from "@/components/mobile/v2/primitives";
import type { MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";
import { formatCurrency } from "@/lib/utils";
import { MobileNewRequisitionClient } from "../requisitions/new/MobileNewRequisitionClient";
import MobileNewProcurementClient from "./new/MobileNewProcurementClient";
import MobileNewSupplierReturnClient from "../supplier-returns/new/MobileNewSupplierReturnClient";
import { MobileNewQuotationClient } from "../quotations/new/MobileNewQuotationClient";

const TABS = ["indents", "quotations", "pos", "returns"] as const;
type TabValue = (typeof TABS)[number];

type QuotationCatalog = {
  projects: { id: string; name: string }[];
  materials: {
    id: string;
    name: string;
    code: string;
    unit: string;
    hsnCode: string | null;
    gstRate: number;
  }[];
};

// ── Form data types ──
type IndentFormData = {
  projects: { id: string; name: string }[];
  materials: { id: string; name: string; code: string; unit: string }[];
  suppliers: { id: string; name: string }[];
};

type PoFormData = {
  suppliers: { id: string; name: string; phone?: string | null }[];
  projects: { id: string; name: string }[];
  materials: { id: string; name: string; code: string; unit: string; gstRate: number; barcode?: string | null }[];
  locations: { id: string; name: string; type: string; projectId: string | null }[];
  categories: { id: string; name: string; unit: string }[];
};

type ReturnFormData = {
  suppliers: { id: string; name: string }[];
  locations: { id: string; name: string; type: string }[];
  materials: { id: string; name: string; code: string; unit: string }[];
  purchaseOrders: { id: string; poNumber: string; supplierId: string }[];
  categories: { id: string; name: string; unit: string }[];
};

/**
 * MobileProcurementHubTabs — merges the procurement pipeline (Indents,
 * Quotations, Purchase Orders, Supplier Returns) into one page with a
 * toggle bar. Each tab renders its existing list component unchanged.
 *
 * The tab lives in `?tab=` so it's shareable and back-button friendly.
 * The FAB on each tab opens a full-screen overlay form (consistent with
 * the quotations popup pattern) — no page navigation needed.
 */
export function MobileProcurementHubTabs({
  indentItems,
  indentCanCreate,
  indentCanApprove,
  indentSubmittedCount,
  indentLoadMoreUrl,
  indentNextCursor,
  indentExportColumns,
  indentFormData,

  quotationItems,
  quotationCanCreate,
  quotationCatalog,
  quotationExportColumns,

  poItems,
  poCanCreate,
  poCanApprove,
  poDraftCount,
  poLoadMoreUrl,
  poNextCursor,
  poExportColumns,
  poDirectPurchases,
  poDirectPurchaseExportRows,
  poFormData,

  returnItems,
  returnCanCreate,
  returnTotalValue,
  returnPendingCount,
  returnExportColumns,
  returnFormData,
}: {
  indentItems: RequisitionListItem[];
  indentCanCreate: boolean;
  indentCanApprove: boolean;
  indentSubmittedCount: number;
  indentLoadMoreUrl?: string;
  indentNextCursor?: string | null;
  indentExportColumns: MobileColumnSpec[];
  indentFormData: IndentFormData;

  quotationItems: QuotationListItem[];
  quotationCanCreate: boolean;
  quotationCatalog: QuotationCatalog;
  quotationExportColumns: MobileColumnSpec[];

  poItems: ProcurementListItem[];
  poCanCreate: boolean;
  poCanApprove: boolean;
  poDraftCount: number;
  poLoadMoreUrl?: string;
  poNextCursor?: string | null;
  poExportColumns: MobileColumnSpec[];
  poDirectPurchases?: DirectPurchaseListItem[];
  poDirectPurchaseExportRows?: Record<string, unknown>[];
  poFormData: PoFormData;

  returnItems: SupplierReturnItem[];
  returnCanCreate: boolean;
  returnTotalValue: number;
  returnPendingCount: number;
  returnExportColumns: MobileColumnSpec[];
  returnFormData: ReturnFormData;
}) {
  const [tab, setTab] = useTabParam(TABS, "indents");
  const searchParams = useSearchParams();
  const router = useRouter();

  // ── Modal form state ──
  // `showForm` controls which tab's form modal is open (if any).
  // `fabRect` captures the FAB's position for the spring-from-origin animation.
  const [showForm, setShowForm] = useState<TabValue | null>(null);
  const [fabRect, setFabRect] = useState<DOMRect | null>(null);

  // Close any open form when the tab changes — the FAB for the previous
  // tab unmounts, so the modal would be orphaned without this.
  useEffect(() => {
    setShowForm(null);
    setFabRect(null);
  }, [tab]);

  // Open the quotation form when ?new=1 is in the URL (deep-link from
  // /m/quotations/new redirect) — no FAB rect in this case
  useEffect(() => {
    if (searchParams.get("new") === "1" && tab === "quotations") {
      setShowForm("quotations");
    }
  }, [searchParams, tab]);

  const openForm = useCallback((which: TabValue, e?: React.MouseEvent) => {
    // Toggle: if this form is already open, close it (FAB acts as ×)
    if (showForm === which) {
      closeForm();
      return;
    }
    // Capture the FAB's position for the transform-origin animation
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
    // Clear the ?new=1 param if present
    if (searchParams.get("new")) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("new");
      const qs = params.toString();
      router.replace(qs ? `/m/procurement?${qs}` : "/m/procurement", { scroll: false });
    }
    router.refresh();
  }

  const TAB_META: { value: TabValue; label: string; icon: typeof ClipboardList; count: number }[] = [
    { value: "indents", label: "Indents", icon: ClipboardList, count: indentItems.length },
    { value: "quotations", label: "Quotes", icon: FileText, count: quotationItems.length },
    { value: "pos", label: "POs", icon: Truck, count: poItems.length },
    { value: "returns", label: "Returns", icon: Undo2, count: returnItems.length },
  ];

  return (
    <div>
      {/* ── Register bookmark tabs ── */}
      <RegisterTabs
        tabs={TAB_META}
        value={tab}
        onChange={setTab}
      />

      {/* ── Tab content ── */}
      {tab === "indents" && (
        <>
          <MobileRequisitionsList
            items={indentItems}
            canCreate={indentCanCreate}
            canApprove={indentCanApprove}
            submittedCount={indentSubmittedCount}
            loadMoreUrl={indentLoadMoreUrl}
            nextCursor={indentNextCursor}
            exportTitle="Material Indents"
            exportRows={indentItems as unknown as Record<string, unknown>[]}
            exportColumns={indentExportColumns}
            exportSummary={`${indentItems.length} indents`}
          />
          {indentCanCreate && (
            <MobileFab onClick={(e) => openForm("indents", e)} label="New indent" isOpen={showForm === "indents"} />
          )}
        </>
      )}

      {tab === "quotations" && (
        <>
          <MobileQuotationsList
            items={quotationItems}
            canCreate={quotationCanCreate}
            catalog={quotationCatalog}
            exportTitle="Quotation Requests"
            exportRows={quotationItems as unknown as Record<string, unknown>[]}
            exportColumns={quotationExportColumns}
            exportSummary={`${quotationItems.length} requests`}
          />
          {quotationCanCreate && (
            <MobileFab onClick={(e) => openForm("quotations", e)} label="New quotation" isOpen={showForm === "quotations"} />
          )}
        </>
      )}

      {tab === "pos" && (
        <>
          <MobileProcurementList
            items={poItems}
            canCreate={poCanCreate}
            canApprove={poCanApprove}
            draftCount={poDraftCount}
            loadMoreUrl={poLoadMoreUrl}
            nextCursor={poNextCursor}
            exportTitle="Purchase Orders"
            exportRows={poItems as unknown as Record<string, unknown>[]}
            exportColumns={poExportColumns}
            exportSummary={`${poItems.length} purchase orders`}
            directPurchases={poDirectPurchases}
            directPurchaseExportRows={poDirectPurchaseExportRows}
          />
          {poCanCreate && (
            <MobileFab onClick={(e) => openForm("pos", e)} label="New purchase order" isOpen={showForm === "pos"} />
          )}
        </>
      )}

      {tab === "returns" && (
        <div>
          <div className="grid grid-cols-2 gap-1.5 mb-4">
            <MobileStatCard
              label="Return Value"
              value={formatCurrency(returnTotalValue)}
              icon={Undo2}
              tone="signal"
            />
            <MobileStatCard
              label="Pending"
              value={String(returnPendingCount)}
              icon={Undo2}
              tone={returnPendingCount > 0 ? "signal" : "neutral"}
            />
          </div>

          <MobileSupplierReturnsList
            items={returnItems}
            exportTitle="Supplier Returns"
            exportRows={returnItems as unknown as Record<string, unknown>[]}
            exportColumns={returnExportColumns}
            exportSummary={`${returnItems.length} returns · ${formatCurrency(returnTotalValue)}`}
          />

          {returnItems.length === 0 && (
            <>
              <MobileSectionTitle>Recent</MobileSectionTitle>
              <MobileEmptyState
                icon={Undo2}
                title="No purchase returns"
                hint="Tap the + button below to create your first return"
              />
            </>
          )}

          {returnCanCreate && (
            <MobileFab onClick={(e) => openForm("returns", e)} label="New return" isOpen={showForm === "returns"} />
          )}
        </div>
      )}

      {/* ── Centered modal forms (spring up from the FAB) ── */}
      <MobileFabModal
        open={showForm === "indents"}
        onClose={closeForm}
        originRect={fabRect}
        title="New Indent"
      >
        <MobileNewRequisitionClient
          data={indentFormData}
          onClose={closeForm}
          onCreated={() => closeForm()}
        />
      </MobileFabModal>

      <MobileFabModal
        open={showForm === "quotations"}
        onClose={closeForm}
        originRect={fabRect}
        title="New Quotation Request"
      >
        <MobileNewQuotationClient
          data={{ projects: quotationCatalog.projects, materials: quotationCatalog.materials }}
          onClose={closeForm}
          onCreated={() => closeForm()}
        />
      </MobileFabModal>

      <MobileFabModal
        open={showForm === "pos"}
        onClose={closeForm}
        originRect={fabRect}
        title="New Purchase Order"
      >
        <MobileNewProcurementClient
          data={poFormData}
          onClose={closeForm}
          onCreated={() => closeForm()}
        />
      </MobileFabModal>

      <MobileFabModal
        open={showForm === "returns"}
        onClose={closeForm}
        originRect={fabRect}
        title="New Supplier Return"
      >
        <MobileNewSupplierReturnClient
          suppliers={returnFormData.suppliers}
          locations={returnFormData.locations}
          materials={returnFormData.materials}
          purchaseOrders={returnFormData.purchaseOrders}
          categories={returnFormData.categories}
          onClose={closeForm}
          onCreated={() => closeForm()}
        />
      </MobileFabModal>
    </div>
  );
}
