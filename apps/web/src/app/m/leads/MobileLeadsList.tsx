"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { MobileLink as Link } from "@/components/mobile/mobile-link";
import { Phone, Calendar, Flame, TrendingUp, UserPlus, Eye, Share2, Mail, IndianRupee, Building, User } from "lucide-react";
import {formatDate, formatCurrency} from "@/lib/utils";
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
  type SummaryStat,
} from "@/components/mobile/v2/scaffold";
import { MobileExportShareIcons, type MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";
import { MobileEmptyState } from "@/components/mobile/v2/primitives";
import { MobileLoadMore, usePaginatedList } from "@/components/mobile/v2/load-more";
import { useFabModal } from "@/lib/use-fab-modal";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { MobileNewLeadClient } from "./new/MobileNewLeadClient";
import { useHydratedDate } from "@/lib/use-hydrated-date";

type StageFilter = "ALL" | "NEW" | "CONTACTED" | "SITE_VISIT" | "NEGOTIATION" | "BOOKED" | "LOST";

export type LeadListItem = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  source: string;
  stage: string;
  priority: string;
  score: number;
  projectName: string | null;
  assignedToName: string | null;
  nextFollowUpAt: string | null;
  lastContactAt: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  interestedUnitType: string | null;
  convertedAt: string | null;
  createdAt: string;
};

const STAGE_COLORS: Record<string, string> = {
  NEW: "var(--color-steel)",
  CONTACTED: "var(--color-info)",
  SITE_VISIT: "var(--color-info)",
  NEGOTIATION: "var(--color-warn)",
  BOOKED: "var(--color-go)",
  LOST: "var(--color-stop)",
};

const STAGE_LABELS: Record<string, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  SITE_VISIT: "Site Visit",
  NEGOTIATION: "Negotiation",
  BOOKED: "Booked",
  LOST: "Lost",
};

const PRIORITY_COLORS: Record<string, string> = {
  LOW: "var(--color-ink-500)",
  MEDIUM: "var(--color-info)",
  HIGH: "var(--color-warn)",
  HOT: "var(--color-stop)",
};

const FILTER_OPTIONS: { label: string; value: StageFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "New", value: "NEW" },
  { label: "Contacted", value: "CONTACTED" },
  { label: "Site Visit", value: "SITE_VISIT" },
  { label: "Negotiation", value: "NEGOTIATION" },
  { label: "Booked", value: "BOOKED" },
  { label: "Lost", value: "LOST" },
];

/**
 * Lead pipeline — "who do I chase today?"
 * Card grid with stage accent and priority indicator.
 */
export function MobileLeadsList({
  items: initialItems,
  hotCount,
  bookedCount,
  followUpsDue,
  canCreate,
  loadMoreUrl,
  initialCursor,
  exportTitle,
  exportRows,
  exportColumns,
  exportSummary,
  newLeadProjects,
  newLeadUnits,
  newLeadAssignees,
}: {
  items: LeadListItem[];
  hotCount: number;
  bookedCount: number;
  followUpsDue: number;
  canCreate?: boolean;
  loadMoreUrl?: string;
  initialCursor?: string | null;
  exportTitle?: string;
  exportRows?: Record<string, unknown>[];
  exportColumns?: MobileColumnSpec[];
  exportSummary?: string;
  /** Dropdown data for the inline new-lead modal (FAB). */
  newLeadProjects?: { id: string; name: string }[];
  newLeadUnits?: { id: string; projectId: string; projectName: string; label: string }[];
  newLeadAssignees?: { id: string; name: string }[];
}) {
  const fab = useFabModal();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<StageFilter>("ALL");

  const { items, loading, hasMore, loadMore } = usePaginatedList<LeadListItem>(
    initialItems,
    loadMoreUrl ?? "",
    initialCursor ?? null,
  );

  const filtered = useMemo(() => {
    let result = items;
    if (stageFilter !== "ALL") {
      result = result.filter((l) => l.stage === stageFilter);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          l.phone.toLowerCase().includes(q) ||
          (l.projectName?.toLowerCase().includes(q) ?? false),
      );
    }
    // Sort: hot first, then by score desc, then by next follow-up
    return [...result].sort((a, b) => {
      const aHot = a.priority === "HOT" ? 1 : 0;
      const bHot = b.priority === "HOT" ? 1 : 0;
      if (aHot !== bHot) return bHot - aHot;
      if (b.score !== a.score) return b.score - a.score;
      const aFollow = a.nextFollowUpAt ? new Date(a.nextFollowUpAt).getTime() : Infinity;
      const bFollow = b.nextFollowUpAt ? new Date(b.nextFollowUpAt).getTime() : Infinity;
      return aFollow - bFollow;
    });
  }, [items, query, stageFilter]);

  const summaryStats: SummaryStat[] = [
    { label: "Leads", value: String(items.length) },
    { label: "Hot", value: String(hotCount), tone: hotCount > 0 ? "stop" : "default" },
    { label: "Booked", value: String(bookedCount), tone: bookedCount > 0 ? "go" : "default" },
    { label: "Follow-ups", value: String(followUpsDue), tone: followUpsDue > 0 ? "signal" : "default" },
  ];

  if (items.length === 0) {
    return (
      <div>
        <MobileEmptyState
          icon={UserPlus}
          title="No leads yet"
          hint={canCreate ? "Tap + to create your first lead" : "Leads will appear here once created."}
        />
        {canCreate ? (
          <>
            <MobileFab onClick={fab.toggle} isOpen={fab.isOpen} label="Add lead" />
            <MobileFabModal
              open={fab.isOpen}
              onClose={fab.close}
              originRect={fab.originRect}
              title="New Lead"
            >
              <MobileNewLeadClient
                projects={newLeadProjects ?? []}
                units={newLeadUnits ?? []}
                assignees={newLeadAssignees ?? []}
                onClose={fab.close}
                onCreated={() => router.refresh()}
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
      <MobileSummaryStrip stats={summaryStats} />

      {/* ── Sticky search header ── */}
      <MobileSearchHeader
        query={query}
        onQueryChange={setQuery}
        placeholder="Search lead, phone, project…"
        action={
          <div className="flex items-center gap-1 shrink-0">
            <MobileFilterIcon
              options={FILTER_OPTIONS}
              active={stageFilter}
              defaultValue="ALL"
              onChange={setStageFilter}
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
        showClear={stageFilter !== "ALL" || !!query}
        onClear={() => { setQuery(""); setStageFilter("ALL"); }}
      />

      {/* ── Lead cards grid ── */}
      {filtered.length === 0 ? (
        <MobileNoResults
          title={query || stageFilter !== "ALL" ? "No matching leads" : "No leads"}
          hint={query || stageFilter !== "ALL"
            ? "Try a different search or filter"
            : canCreate
              ? "Tap + to add your first lead"
              : "Leads will appear here once added"}
        />
      ) : (
        <MobileCardGrid cols={2}>
          {filtered.map((l) => (
            <LeadCard key={l.id} l={l} />
          ))}
        </MobileCardGrid>
      )}

      {loadMoreUrl ? (
        <MobileLoadMore
          onClick={loadMore}
          loading={loading}
          hasMore={hasMore}
          count={items.length}
        />
      ) : null}

      {/* ── New lead FAB ── */}
      {canCreate ? (
        <>
          <MobileFab onClick={fab.toggle} isOpen={fab.isOpen} label="Add lead" />
          <MobileFabModal
            open={fab.isOpen}
            onClose={fab.close}
            originRect={fab.originRect}
            title="New Lead"
          >
            <MobileNewLeadClient
              projects={newLeadProjects ?? []}
              units={newLeadUnits ?? []}
              assignees={newLeadAssignees ?? []}
              onClose={fab.close}
              onCreated={() => router.refresh()}
            />
          </MobileFabModal>
        </>
      ) : null}
    </div>
  );
}

/* ─── Lead card — pipeline-style with stage accent ─── */
function LeadCard({ l }: { l: LeadListItem }) {
  const router = useRouter();
  const stageColor = STAGE_COLORS[l.stage] ?? "var(--color-ink-500)";
  const priorityColor = PRIORITY_COLORS[l.priority] ?? "var(--color-ink-500)";
  const isHot = l.priority === "HOT";
  const isConverted = !!l.convertedAt;
  const now = useHydratedDate();
  const followUpOverdue = l.nextFollowUpAt && now && new Date(l.nextFollowUpAt) <= now;

  // ── Long-press overview sheet (data already in the list item — no fetch) ──
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [pressPoint, setPressPoint] = useState<{ x: number; y: number } | null>(null);
  const { bind: longPressBind } = useLongPress((x, y) => {
    setPressPoint({ x, y });
    setOverviewOpen(true);
  });

  const budgetText =
    l.budgetMin != null && l.budgetMax != null
      ? `${formatCurrency(l.budgetMin)} – ${formatCurrency(l.budgetMax)}`
      : l.budgetMin != null
        ? `From ${formatCurrency(l.budgetMin)}`
        : l.budgetMax != null
          ? `Up to ${formatCurrency(l.budgetMax)}`
          : "Not specified";

  const overviewRows: OverviewRow[] = [
    { icon: TrendingUp, label: "Source", value: l.source },
    { icon: TrendingUp, label: "Status", value: STAGE_LABELS[l.stage] ?? l.stage, valueColor: stageColor },
    { icon: Phone, label: "Phone", value: l.phone || "—" },
    { icon: Mail, label: "Email", value: l.email ?? "—" },
    { icon: IndianRupee, label: "Budget", value: budgetText },
    { icon: User, label: "Assigned To", value: l.assignedToName ?? "Unassigned" },
    { icon: Building, label: "Project Interest", value: l.projectName ?? "—" },
  ];

  const overviewActions: ContextAction[] = [
    {
      label: "View Full Details",
      icon: Eye,
      onPress: () => router.push(`/m/leads/${l.id}`),
    },
    {
      label: "Share",
      icon: Share2,
      onPress: () => {
        const url = `${window.location.origin}/m/leads/${l.id}`;
        if (navigator.share) {
          navigator.share({ title: l.name, url }).catch(() => {});
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
          href={`/m/leads/${l.id}`}
          className="flex flex-col rounded-[0.625rem] border text-m-body overflow-hidden active:scale-[0.98] transition-transform"
          style={{
            borderColor: "var(--color-line)",
            backgroundColor: "var(--color-paper)",
          }}
        >
          {/* Top accent strip */}
          <div className="h-0.5 w-full" style={{ backgroundColor: stageColor }} />

          <div className="p-2 flex flex-col gap-1 flex-1">
            {/* Row 1: Name + priority indicator */}
            <div className="flex items-center justify-between gap-1">
              <p className="text-m-label font-bold leading-tight truncate" style={{ color: "var(--color-ink-950)" }}>
                {l.name}
              </p>
              {isHot ? (
                <Flame className="size-2.5 shrink-0" style={{ color: priorityColor }} />
              ) : (
                <span
                  className="size-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: priorityColor }}
                />
              )}
            </div>

            {/* Row 2: Stage badge + phone */}
            <div className="flex items-center gap-1.5">
              <span
                className="text-m-caption font-bold uppercase shrink-0"
                style={{ color: stageColor }}
              >
                {STAGE_LABELS[l.stage] ?? l.stage}
              </span>
              {l.phone ? (
                <>
                  <span style={{ color: "var(--color-line)" }}>·</span>
                  <span className="text-m-caption truncate flex items-center gap-0.5" style={{ color: "var(--color-ink-500)" }}>
                    <Phone className="size-2" />
                    {l.phone}
                  </span>
                </>
              ) : null}
            </div>

            {/* Row 3: Project name */}
            {l.projectName ? (
              <p className="text-m-caption truncate" style={{ color: "var(--color-ink-500)" }}>
                {l.projectName}
              </p>
            ) : null}

            {/* Row 4: Bottom area — fixed height for equal card sizes */}
            <div className="mt-auto pt-1 h-[1rem] flex items-center gap-1.5">
              {isConverted ? (
                <span className="text-m-caption font-bold uppercase" style={{ color: "var(--color-go)" }}>
                  Converted
                </span>
              ) : l.nextFollowUpAt ? (
                <span
                  className="text-m-caption font-semibold flex items-center gap-0.5"
                  style={{ color: followUpOverdue ? "var(--color-stop)" : "var(--color-ink-500)" }}
                >
                  <Calendar className="size-2" />
                  {formatDate(l.nextFollowUpAt)}
                </span>
              ) : l.score > 0 ? (
                <span className="text-m-caption font-semibold flex items-center gap-0.5" style={{ color: "var(--color-ink-500)" }}>
                  <TrendingUp className="size-2" />
                  Score {l.score}
                </span>
              ) : (
                <span className="text-m-caption font-semibold" style={{ color: "var(--color-ink-500)" }}>
                  {STAGE_LABELS[l.stage] ?? l.stage}
                </span>
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
        title={l.name}
        subtitle={STAGE_LABELS[l.stage] ?? l.stage}
        accentColor={stageColor}
        rows={overviewRows}
        actions={overviewActions}
      />
    </>
  );
}
