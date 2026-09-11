"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ScrollText, ArrowLeftRight, ClipboardCheck, Recycle, Package } from "lucide-react";
import { useTabParam } from "@/lib/use-tab-param";
import { MobileFab } from "@/components/mobile/v2/scaffold";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { RegisterTabs } from "@/components/mobile/v2/register-tabs";
import { useFabModal } from "@/lib/use-fab-modal";
import { formatNumber, formatCurrency, formatCurrencyCompact } from "@/lib/utils";
import MobileNewStockCountClient from "../stock-counts/new/MobileNewStockCountClient";
import MobileNewScrapGenerationClient from "../scrap-generations/new/MobileNewScrapGenerationClient";
import { MobileStockOutClient } from "../stock-out/MobileStockOutClient";
import { MobileStockMovementsList, type StockLocation, type StockMovementItem, type MaterialStockItem } from "./MobileStockMovementsList";
import { MobileTransfersList, type TransferItem } from "../transfers/MobileTransfersList";
import { MobileStockCountsList, type StockCountItem } from "../stock-counts/MobileStockCountsList";
import { MobileScrapGenerationsList, type ScrapGenerationItem } from "../scrap-generations/MobileScrapGenerationsList";
import type { MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";

const TABS = ["on-hand", "ledger", "transfers", "counts", "scrap"] as const;
type TabValue = (typeof TABS)[number];

export interface OnHandItem {
  id: string;
  code: string;
  name: string;
  unit: string;
  categoryName: string;
  totalQty: number;
  stockValue: number;
  mac: number;
  reorderPoint: number | null;
  isLow: boolean;
  isOut: boolean;
  locations: { id: string; name: string; type: string; qty: number }[];
}

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

  onHandItems,
  onHandExportColumns,
  onHandTotalValue,
  onHandLowCount,
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

  onHandItems: OnHandItem[];
  onHandExportColumns: MobileColumnSpec[];
  onHandTotalValue: number;
  onHandLowCount: number;
}) {
  const [tab, setTab] = useTabParam(TABS, "on-hand");
  const countFab = useFabModal();
  const scrapFab = useFabModal();
  const transferFab = useFabModal();

  // Close any open form when the tab changes — the FAB for the previous
  // tab unmounts, so the modal would be orphaned without this.
  useEffect(() => {
    countFab.close();
    scrapFab.close();
    transferFab.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const TAB_META: { value: TabValue; label: string; icon: typeof ScrollText; count: number }[] = [
    { value: "on-hand", label: "On Hand", icon: Package, count: onHandItems.length },
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
      {tab === "on-hand" && (
        <MobileOnHandList
          items={onHandItems}
          totalValue={onHandTotalValue}
          lowCount={onHandLowCount}
          exportColumns={onHandExportColumns}
        />
      )}

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
            <MobileFab onClick={transferFab.toggle} isOpen={transferFab.isOpen} label="New stock transfer" />
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

      <MobileFabModal
        open={transferFab.isOpen}
        onClose={transferFab.close}
        originRect={transferFab.originRect}
        title="New Stock Transfer"
      >
        <MobileStockOutClient
          canTransfer
          canIssue={false}
          initialMode="transfer"
          initialProjectId=""
          initialFromLocationId=""
          onClose={transferFab.close}
        />
      </MobileFabModal>
    </div>
  );
}

// ── On Hand list — current stock levels by material ──
function MobileOnHandList({
  items,
  totalValue,
  lowCount,
  exportColumns: _exportColumns,
}: {
  items: OnHandItem[];
  totalValue: number;
  lowCount: number;
  exportColumns: MobileColumnSpec[];
}) {
  const [query, setQuery] = useState("");
  const [lowOnly, setLowOnly] = useState(false);

  const filtered = items.filter((m) => {
    if (lowOnly && !m.isLow && !m.isOut) return false;
    if (query.trim()) {
      const q = query.toLowerCase();
      return m.name.toLowerCase().includes(q) || m.code.toLowerCase().includes(q) || m.categoryName.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div>
      {/* ── Summary strip ── */}
      <div className="grid grid-cols-3 gap-2 px-4 pt-3 pb-2">
        <div className="rounded-[0.5rem] border p-2" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
          <p className="text-m-caption font-bold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>Items</p>
          <p className="text-m-section font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>{items.length}</p>
        </div>
        <div className="rounded-[0.5rem] border p-2" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
          <p className="text-m-caption font-bold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>Value</p>
          <p className="text-m-section font-bold tabular-nums" style={{ color: "var(--color-ink-950)" }}>{formatCurrencyCompact(totalValue)}</p>
        </div>
        <div className="rounded-[0.5rem] border p-2" style={{ borderColor: lowCount > 0 ? "color-mix(in srgb, var(--color-signal) 30%, var(--color-line))" : "var(--color-line)", backgroundColor: lowCount > 0 ? "color-mix(in srgb, var(--color-signal) 6%, var(--color-paper))" : "var(--color-paper)" }}>
          <p className="text-m-caption font-bold uppercase tracking-wide" style={{ color: "var(--color-ink-500)" }}>Low/Out</p>
          <p className="text-m-section font-bold tabular-nums" style={{ color: lowCount > 0 ? "var(--color-signal-dark)" : "var(--color-ink-950)" }}>{lowCount}</p>
        </div>
      </div>

      {/* ── Search + low-stock filter ── */}
      <div className="px-4 py-2 flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search materials…"
          className="flex-1 h-8 px-2 text-m-body outline-none border rounded-[0.5rem]"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
        />
        <button
          onClick={() => setLowOnly((v) => !v)}
          className="h-8 px-3 rounded-[0.5rem] text-m-caption font-bold press"
          style={{
            backgroundColor: lowOnly ? "color-mix(in srgb, var(--color-signal) 10%, var(--color-paper))" : "var(--color-paper)",
            border: `1px solid ${lowOnly ? "var(--color-signal)" : "var(--color-line)"}`,
            color: lowOnly ? "var(--color-signal-dark)" : "var(--color-ink-500)",
          }}
        >
          Low only
        </button>
      </div>

      {/* ── Material list ── */}
      {filtered.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <Package className="size-8 mx-auto mb-2" style={{ color: "var(--color-ink-400)" }} />
          <p className="text-m-body font-bold" style={{ color: "var(--color-ink-700)" }}>
            {lowOnly ? "No low-stock materials" : "No materials in stock"}
          </p>
          <p className="text-m-caption mt-1" style={{ color: "var(--color-ink-500)" }}>
            {query.trim() ? "Try a different search" : "Stock will appear here once materials are received"}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 px-4 pb-4">
          {filtered.map((m) => {
            const tone = m.isOut ? "var(--color-stop)" : m.isLow ? "var(--color-signal)" : "var(--color-go)";
            return (
              <Link
                key={m.id}
                href={`/m/materials/${m.id}`}
                className="flex items-center gap-2 rounded-[0.5rem] border p-2.5 press overflow-hidden"
                style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
              >
                <div className="h-8 w-1 shrink-0 rounded-full" style={{ backgroundColor: tone }} />
                <div className="flex-1 min-w-0">
                  <p className="text-m-body font-bold leading-tight truncate" style={{ color: "var(--color-ink-950)" }}>{m.name}</p>
                  <p className="text-m-caption truncate" style={{ color: "var(--color-ink-500)" }}>
                    {m.code} · {m.categoryName} · {m.locations.length} loc
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-m-body font-bold tabular-nums" style={{ color: m.isOut ? "var(--color-stop)" : m.isLow ? "var(--color-signal-dark)" : "var(--color-ink-950)" }}>
                    {formatNumber(m.totalQty, 0)} <span className="text-m-caption font-normal" style={{ color: "var(--color-ink-500)" }}>{m.unit}</span>
                  </p>
                  <p className="text-m-caption tabular-nums" style={{ color: "var(--color-ink-500)" }}>{formatCurrency(m.stockValue)}</p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
