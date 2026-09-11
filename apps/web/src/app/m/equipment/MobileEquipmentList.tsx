"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Wrench, CheckCircle2, MapPin, Settings, Archive,
  Eye, Share2, Calendar, FileText, Package, TrendingDown, IndianRupee,
} from "lucide-react";
import { formatCurrencyCompact, formatCurrency, formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { useLongPress } from "@/lib/use-long-press";
import {
  MobileOverviewSheet,
  type OverviewRow,
} from "@/components/mobile/v2/mobile-overview-sheet";
import type { ContextAction } from "@/components/mobile/v2/mobile-context-menu";
import {
  MobileSearchHeader,
  MobileFilterIcon,
  MobileCardGrid,
  MobileFab,
  MobileNoResults,
  MobileSummaryStrip,
} from "@/components/mobile/v2/scaffold";
import {
  MobileExportShareIcons,
  type MobileColumnSpec,
} from "@/components/mobile/v2/export-share-bar";
import { MobileEmptyState } from "@/components/mobile/v2/primitives";
import { useFabModal } from "@/lib/use-fab-modal";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import MobileNewEquipmentClient from "./new/MobileNewEquipmentClient";

type EquipmentFilter =
  | "ALL"
  | "AVAILABLE"
  | "ASSIGNED"
  | "IN_MAINTENANCE"
  | "RETIRED";

export type EquipmentItem = {
  id: string;
  name: string;
  status: string;
  category: string | null;
  assetTag: string;
  model: string | null;
  currentValue: number;
  assignmentId: string | null;
  assignedProjectName: string | null;
  assignedLocationName: string | null;
};

const FILTER_OPTIONS: { label: string; value: EquipmentFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Available", value: "AVAILABLE" },
  { label: "Assigned", value: "ASSIGNED" },
  { label: "Maintenance", value: "IN_MAINTENANCE" },
  { label: "Retired", value: "RETIRED" },
];

/**
 * Equipment list — "where is my equipment, and what's it doing?"
 * Procurement-style cards in a 2-col grid with status accent.
 * Smart sort: available first (ready to deploy), then assigned (in use),
 * then maintenance (needs attention), then retired.
 */
export function MobileEquipmentList({
  items,
  counts,
  canCreate,
  canEdit = false,
  exportTitle,
  exportRows,
  exportColumns,
  exportSummary,
}: {
  items: EquipmentItem[];
  counts: {
    total: number;
    available: number;
    assigned: number;
    inMaintenance: number;
    retired: number;
    totalValue: number;
  };
  canCreate: boolean;
  canEdit?: boolean;
  exportTitle?: string;
  exportRows?: Record<string, unknown>[];
  exportColumns?: MobileColumnSpec[];
  exportSummary?: string;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<EquipmentFilter>("ALL");
  const fab = useFabModal();
  const router = useRouter();

  const filtered = useMemo(() => {
    let result = items;
    if (filter !== "ALL") result = result.filter((e) => e.status === filter);
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          (e.category?.toLowerCase().includes(q) ?? false) ||
          e.assetTag.toLowerCase().includes(q) ||
          (e.assignedProjectName?.toLowerCase().includes(q) ?? false),
      );
    }
    // Smart sort: AVAILABLE > ASSIGNED > IN_MAINTENANCE > RETIRED, then by name
    const statusOrder: Record<string, number> = {
      AVAILABLE: 0,
      ASSIGNED: 1,
      IN_MAINTENANCE: 2,
      RETIRED: 3,
    };
    return [...result].sort((a, b) => {
      const so = (statusOrder[a.status] ?? 4) - (statusOrder[b.status] ?? 4);
      if (so !== 0) return so;
      return a.name.localeCompare(b.name);
    });
  }, [items, query, filter]);

  if (items.length === 0) {
    return (
      <div>
        <MobileEmptyState
          icon={Wrench}
          title="No equipment yet"
          hint={canCreate ? "Tap + to add your first equipment" : "Equipment will appear here once added."}
        />
        {canCreate ? (
          <>
            <MobileFab onClick={fab.toggle} label="Add equipment" isOpen={fab.isOpen} />
            <MobileFabModal open={fab.isOpen} onClose={fab.close} originRect={fab.originRect} title="Add Equipment">
              <MobileNewEquipmentClient
                onClose={fab.close}
                onCreated={() => { fab.close(); router.refresh(); }}
              />
            </MobileFabModal>
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      {/* ── Summary strip ── */}
      <MobileSummaryStrip
        stats={[
          { label: "Available", value: String(counts.available), tone: "go" },
          { label: "In Use", value: String(counts.assigned), tone: "default" },
          {
            label: "Maint.",
            value: String(counts.inMaintenance),
            tone: "signal",
          },
          {
            label: "Value",
            value: formatCurrencyCompact(counts.totalValue),
            tone: "default",
          },
        ]}
      />

      {/* ── Sticky search header ── */}
      <MobileSearchHeader
        query={query}
        onQueryChange={setQuery}
        placeholder="Search name, tag, category…"
        action={
          <div className="flex items-center gap-1 shrink-0">
            <MobileFilterIcon
              options={FILTER_OPTIONS}
              active={filter}
              defaultValue="ALL"
              onChange={(v) => setFilter(v as EquipmentFilter)}
            />
            {exportTitle && exportRows && exportColumns ? (
              <MobileExportShareIcons
                title={exportTitle}
                rows={exportRows}
                columns={exportColumns}
                summary={exportSummary}
              />
            ) : null}
          </div>
        }
        showClear={filter !== "ALL" || query !== ""}
        onClear={() => {
          setQuery("");
          setFilter("ALL");
        }}
      />

      {/* ── Equipment cards grid ── */}
      {filtered.length === 0 ? (
        <MobileNoResults
          title="No matching equipment"
          hint="Try a different search or filter"
        />
      ) : (
        <MobileCardGrid cols={3}>
          {filtered.map((e) => (
            <EquipmentCard key={e.id} e={e} canEdit={canEdit} />
          ))}
        </MobileCardGrid>
      )}

      {canCreate ? (
        <>
          <MobileFab onClick={fab.toggle} label="Add equipment" isOpen={fab.isOpen} />
          <MobileFabModal open={fab.isOpen} onClose={fab.close} originRect={fab.originRect} title="Add Equipment">
            <MobileNewEquipmentClient
              onClose={fab.close}
              onCreated={() => { fab.close(); router.refresh(); }}
            />
          </MobileFabModal>
        </>
      ) : null}
    </div>
  );
}

/* ─── Equipment card — procurement-style with status accent ─── */
/* Text is intentionally tight (m-micro / m-caption) because the grid is 3-col. */
/* Long-press opens an overview sheet with full details fetched from the API. */
function EquipmentCard({ e, canEdit }: { e: EquipmentItem; canEdit?: boolean }) {
  const router = useRouter();
  const isAvailable = e.status === "AVAILABLE";
  const isAssigned = e.status === "ASSIGNED";
  const isMaintenance = e.status === "IN_MAINTENANCE";
  const isRetired = e.status === "RETIRED";

  // Accent: go=available, steel=assigned, signal=maintenance, stop=retired
  const accentColor = isRetired
    ? "var(--color-stop)"
    : isMaintenance
      ? "var(--color-signal)"
      : isAssigned
        ? "var(--color-steel)"
        : "var(--color-go)";

  const StatusIcon = isAvailable
    ? CheckCircle2
    : isAssigned
      ? MapPin
      : isMaintenance
        ? Settings
        : Archive;
  const statusLabel = isAvailable
    ? "Available"
    : isAssigned
      ? "Assigned"
      : isMaintenance
        ? "Maint."
        : "Retired";

  // ── Long-press overview sheet ──
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [details, setDetails] = useState<EquipmentOverview | null>(null);
  const [pressPoint, setPressPoint] = useState<{ x: number; y: number } | null>(null);

  async function loadOverview() {
    if (details) return; // already fetched
    setOverviewLoading(true);
    try {
      const res = await fetch(`/api/equipment/${e.id}`);
      if (!res.ok) throw new Error("Failed to load");
      const data = (await res.json()) as EquipmentOverview;
      setDetails(data);
    } catch {
      toast.error("Could not load equipment details");
      setOverviewOpen(false);
    } finally {
      setOverviewLoading(false);
    }
  }

  const { bind: longPressBind } = useLongPress((x, y) => {
    setPressPoint({ x, y });
    setOverviewOpen(true);
    void loadOverview();
  });

  // Build overview rows from fetched details (or a minimal set from the card)
  const overviewRows: OverviewRow[] = details
    ? [
        { icon: Wrench, label: "Asset Tag", value: details.assetTag, mono: true },
        ...(details.category
          ? [{ icon: Package, label: "Category", value: details.category }]
          : []),
        ...(details.model
          ? [{ icon: Settings, label: "Model", value: details.model }]
          : []),
        ...(details.serialNumber
          ? [{ icon: FileText, label: "Serial No", value: details.serialNumber, mono: true }]
          : []),
        { icon: IndianRupee, label: "Acquisition Cost", value: formatCurrency(details.acquisitionCost) },
        {
          icon: TrendingDown,
          label: "Current Value",
          value: formatCurrency(details.currentValue),
          valueColor: accentColor,
        },
        ...(details.purchaseDate
          ? [{ icon: Calendar, label: "Purchase Date", value: formatDate(details.purchaseDate) }]
          : []),
        ...(details.activeAssignment
          ? [{
              icon: MapPin,
              label: "Assigned To",
              value: details.activeAssignment.projectName ?? details.activeAssignment.locationName,
              valueColor: "var(--color-steel)",
            }]
          : []),
        ...(details.notes
          ? [{ icon: FileText, label: "Notes", value: details.notes }]
          : []),
      ]
    : [
        { icon: Wrench, label: "Asset Tag", value: e.assetTag, mono: true },
        ...(e.category ? [{ icon: Package, label: "Category", value: e.category }] : []),
        { icon: IndianRupee, label: "Current Value", value: formatCurrencyCompact(e.currentValue) },
      ];

  const overviewActions: ContextAction[] = [
    {
      label: "View Full Details",
      icon: Eye,
      onPress: () => router.push(`/m/equipment/${e.id}`),
    },
    {
      label: "Share",
      icon: Share2,
      onPress: () => {
        const url = `${window.location.origin}/m/equipment/${e.id}`;
        if (navigator.share) {
          navigator.share({ title: e.name, url }).catch(() => {});
        } else {
          navigator.clipboard?.writeText(url).catch(() => {});
          toast.success("Link copied");
        }
      },
    },
  ];

  return (
    <>
      <div {...longPressBind}>
        <Link
          href={`/m/equipment/${e.id}`}
          className="flex flex-col rounded-[0.5rem] border text-m-body overflow-hidden active:scale-[0.98] transition-transform"
          style={{
            borderColor: "var(--color-line)",
            backgroundColor: "var(--color-paper)",
            ...(isRetired ? { opacity: 0.6 } : {}),
          }}
        >
          {/* Top accent strip */}
          <div className="h-0.5 w-full" style={{ backgroundColor: accentColor }} />

          <div className="p-1.5 flex flex-col gap-0.5 flex-1">
            {/* Row 1: Status badge */}
            <div className="flex items-center justify-between gap-0.5">
              <span
                className="flex items-center gap-0.5 text-m-micro font-bold uppercase shrink-0"
                style={{ color: accentColor }}
              >
                <StatusIcon className="size-2" />
                {statusLabel}
              </span>
              <span
                className="text-m-micro font-mono truncate"
                style={{ color: "var(--color-ink-500)" }}
              >
                {e.assetTag}
              </span>
            </div>

            {/* Row 2: Equipment name */}
            <p
              className="text-m-caption font-bold leading-tight truncate"
              style={{ color: "var(--color-ink-950)" }}
            >
              {e.name}
            </p>

            {/* Row 3: Category or model */}
            <span
              className="text-m-micro truncate"
              style={{ color: "var(--color-ink-500)" }}
            >
              {e.category ?? "Uncategorized"}
            </span>

            {/* Row 4: Assignment or value (fixed height) */}
            <div className="mt-auto pt-0.5 h-[1.25rem] flex flex-col justify-end">
              {isAssigned && e.assignedProjectName ? (
                <div className="flex items-center gap-0.5">
                  <MapPin
                    className="size-2 shrink-0"
                    style={{ color: "var(--color-steel)" }}
                  />
                  <span
                    className="text-m-micro font-semibold truncate"
                    style={{ color: "var(--color-steel)" }}
                  >
                    {e.assignedProjectName}
                  </span>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span
                    className="text-m-micro font-semibold"
                    style={{ color: "var(--color-ink-500)" }}
                  >
                    Value
                  </span>
                  <span
                    className="text-m-micro font-bold tabular-nums"
                    style={{ color: "var(--color-ink-950)" }}
                  >
                    {formatCurrencyCompact(e.currentValue)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </Link>
      </div>

      {/* Long-press overview sheet */}
      <MobileOverviewSheet
        open={overviewOpen}
        onClose={() => setOverviewOpen(false)}
        origin={pressPoint}
        title={e.name}
        subtitle={e.category ?? undefined}
        accentColor={accentColor}
        loading={overviewLoading}
        rows={overviewRows}
        actions={canEdit ? overviewActions : overviewActions.slice(0, 1)}
      />
    </>
  );
}

/* ─── Types for the overview fetch (matches GET /api/equipment/[id]) ─── */
interface EquipmentOverview {
  id: string;
  assetTag: string;
  name: string;
  model: string | null;
  serialNumber: string | null;
  category: string | null;
  status: string;
  acquisitionCost: number;
  currentValue: number;
  purchaseDate: string | null;
  notes: string | null;
  activeAssignment: {
    id: string;
    locationName: string;
    projectName: string | null;
    assignedAt: string;
  } | null;
}
