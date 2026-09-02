"use client";

import { useEffect } from "react";
import { ScrollText, ArrowLeftRight, ClipboardCheck, Recycle } from "lucide-react";
import { useTabParam } from "@/lib/use-tab-param";
import { MobileFab } from "@/components/mobile/v2/scaffold";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { RegisterTabs } from "@/components/mobile/v2/register-tabs";
import { useFabModal } from "@/lib/use-fab-modal";
import MobileNewStockCountClient from "../stock-counts/new/MobileNewStockCountClient";
import MobileNewScrapGenerationClient from "../scrap-generations/new/MobileNewScrapGenerationClient";
import { MobileStockMovementsList, type StockLocation, type StockMovementItem, type MaterialStockItem } from "./MobileStockMovementsList";
import { MobileTransfersList, type TransferItem } from "../transfers/MobileTransfersList";
import { MobileStockCountsList, type StockCountItem } from "../stock-counts/MobileStockCountsList";
import { MobileScrapGenerationsList, type ScrapGenerationItem } from "../scrap-generations/MobileScrapGenerationsList";
import type { MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";

const TABS = ["ledger", "transfers", "counts", "scrap"] as const;
type TabValue = (typeof TABS)[number];

/**
 * MobileStockHubTabs — merges the Stock Ledger, Transfers, Stock Counts,
 * and Scrap Generations into one page with a toggle bar. Each tab renders
 * its existing list component unchanged — only the toggle bar is new.
 *
 * The tab lives in `?tab=` so it's shareable and back-button friendly
 * (same pattern as the desktop /stock hub).
 */
export function MobileStockHubTabs({
  ledgerLocations,
  ledgerMovements,
  ledgerTotalInventoryValue,
  ledgerFilterMaterialName,
  ledgerMaterialStockItems,
  ledgerExportColumns,
  ledgerCanManage,
  ledgerCategories,

  transfersItems,
  transfersCanCreate,
  transfersCanTransfer,
  transfersInTransitCount,
  transfersCurrentCompanyId,
  transfersLoadMoreUrl,
  transfersNextCursor,
  transfersExportColumns,

  countsItems,
  countsSummary,
  countsCanCreate,

  scrapItems,
  scrapTotalValue,
  scrapCanCreate,
  scrapExportColumns,
}: {
  ledgerLocations: StockLocation[];
  ledgerMovements: StockMovementItem[];
  ledgerTotalInventoryValue: number;
  ledgerFilterMaterialName: string | null;
  ledgerMaterialStockItems: MaterialStockItem[];
  ledgerExportColumns: MobileColumnSpec[];
  ledgerCanManage: boolean;
  ledgerCategories: { id: string; name: string; unit: string }[];

  transfersItems: TransferItem[];
  transfersCanCreate: boolean;
  transfersCanTransfer: boolean;
  transfersInTransitCount: number;
  transfersCurrentCompanyId: string;
  transfersLoadMoreUrl?: string;
  transfersNextCursor?: string | null;
  transfersExportColumns: MobileColumnSpec[];

  countsItems: StockCountItem[];
  countsSummary: { total: number; draft: number; counted: number; reconciled: number };
  countsCanCreate: boolean;

  scrapItems: ScrapGenerationItem[];
  scrapTotalValue: number;
  scrapCanCreate: boolean;
  scrapExportColumns: MobileColumnSpec[];
}) {
  const [tab, setTab] = useTabParam(TABS, "ledger");
  const countFab = useFabModal();
  const scrapFab = useFabModal();

  // Close any open form when the tab changes — the FAB for the previous
  // tab unmounts, so the modal would be orphaned without this.
  useEffect(() => {
    countFab.close();
    scrapFab.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const TAB_META: { value: TabValue; label: string; icon: typeof ScrollText; count: number }[] = [
    { value: "ledger", label: "Ledger", icon: ScrollText, count: ledgerMovements.length },
    { value: "transfers", label: "Transfers", icon: ArrowLeftRight, count: transfersItems.length },
    { value: "counts", label: "Counts", icon: ClipboardCheck, count: countsItems.length },
    { value: "scrap", label: "Scrap", icon: Recycle, count: scrapItems.length },
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
      {tab === "ledger" && (
        <MobileStockMovementsList
          locations={ledgerLocations}
          movements={ledgerMovements}
          totalInventoryValue={ledgerTotalInventoryValue}
          filterMaterialName={ledgerFilterMaterialName}
          materialStockItems={ledgerMaterialStockItems}
          exportTitle="Stock Ledger"
          exportRows={ledgerMovements as unknown as Record<string, unknown>[]}
          exportColumns={ledgerExportColumns}
          exportSummary={`${ledgerMovements.length} stock movements`}
          canManage={ledgerCanManage}
          categories={ledgerCategories}
        />
      )}

      {tab === "transfers" && (
        <>
          <MobileTransfersList
            items={transfersItems}
            canCreate={transfersCanCreate}
            canTransfer={transfersCanTransfer}
            inTransitCount={transfersInTransitCount}
            currentCompanyId={transfersCurrentCompanyId}
            loadMoreUrl={transfersLoadMoreUrl}
            nextCursor={transfersNextCursor}
            exportTitle="Stock Transfers"
            exportRows={transfersItems as unknown as Record<string, unknown>[]}
            exportColumns={transfersExportColumns}
            exportSummary={`${transfersItems.length} transfers`}
          />
          {transfersCanCreate && (
            <MobileFab href="/m/stock-out?mode=transfer" label="New stock transfer" />
          )}
        </>
      )}

      {tab === "counts" && (
        <>
          <MobileStockCountsList
            items={countsItems}
            counts={countsSummary}
            canCreate={countsCanCreate}
          />
          {countsCanCreate && (
            <MobileFab onClick={countFab.toggle} isOpen={countFab.isOpen} label="New stock count" />
          )}
        </>
      )}

      {tab === "scrap" && (
        <>
          <MobileScrapGenerationsList
            items={scrapItems}
            totalValue={scrapTotalValue}
            canCreate={scrapCanCreate}
            exportTitle="Scrap Generations"
            exportRows={scrapItems as unknown as Record<string, unknown>[]}
            exportColumns={scrapExportColumns}
            exportSummary={`${scrapItems.length} slips`}
          />
          {scrapCanCreate && (
            <MobileFab onClick={scrapFab.toggle} isOpen={scrapFab.isOpen} label="New scrap generation" />
          )}
        </>
      )}

      {/* ── Centered modal forms (spring up from the FAB) ── */}
      <MobileFabModal
        open={countFab.isOpen}
        onClose={countFab.close}
        originRect={countFab.originRect}
        title="New Stock Count"
      >
        <MobileNewStockCountClient
          onClose={countFab.close}
          onCreated={() => countFab.close()}
        />
      </MobileFabModal>

      <MobileFabModal
        open={scrapFab.isOpen}
        onClose={scrapFab.close}
        originRect={scrapFab.originRect}
        title="New Scrap Generation"
      >
        <MobileNewScrapGenerationClient
          onClose={scrapFab.close}
          onCreated={() => scrapFab.close()}
        />
      </MobileFabModal>
    </div>
  );
}
