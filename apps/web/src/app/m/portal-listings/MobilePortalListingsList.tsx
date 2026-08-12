"use client";

import { useState, useMemo } from "react";
import { Globe, ExternalLink, Search, X } from "lucide-react";
import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileRow,
  MobileStatusBadge,
  MobileEmptyState,
} from "@/components/mobile/v2/primitives";

type ListingFilter = "ALL" | "LISTED" | "DRAFT" | "SYNC_FAILED" | "DELISTED";

export type PortalListingItem = {
  id: string;
  portalName: string;
  title: string;
  status: string;
  askingPrice: number;
  listingUrl: string | null;
  lastSyncedAt: string | null;
  syncError: string | null;
  unitNumber: string | null;
  projectName: string | null;
};

const FILTER_CHIPS: { label: string; value: ListingFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Listed", value: "LISTED" },
  { label: "Draft", value: "DRAFT" },
  { label: "Failed", value: "SYNC_FAILED" },
  { label: "Delisted", value: "DELISTED" },
];

/**
 * Client component for the mobile portal-listings list. Handles
 * client-side search (title / portal / unit) + status filter chips.
 * When no filter/search is active, listings are shown grouped
 * (Sync Failed → Listed → Draft → Delisted), surfacing failures first.
 * When a filter or search is active, a flat result list is shown.
 *
 * Rows use MobileRow (not tappable to a detail page) because there
 * is no mobile portal-listing detail page — but listed rows with a
 * listingUrl render an external-link affordance.
 */
export function MobilePortalListingsList({
  items,
}: {
  items: PortalListingItem[];
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ListingFilter>("ALL");

  const filtered = useMemo(() => {
    let result = items;
    if (statusFilter !== "ALL") {
      result = result.filter((l) => l.status === statusFilter);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (l) =>
          l.title.toLowerCase().includes(q) ||
          l.portalName.toLowerCase().includes(q) ||
          (l.unitNumber?.toLowerCase().includes(q) ?? false) ||
          (l.projectName?.toLowerCase().includes(q) ?? false),
      );
    }
    return result;
  }, [items, query, statusFilter]);

  const isFiltering = query.trim() !== "" || statusFilter !== "ALL";

  return (
    <div>
      <div className="mb-4">
        <div className="flex items-center gap-2 rounded-[0.625rem] border px-3 h-10"
          style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }}>
          <Search className="size-4 shrink-0" style={{ color: "var(--color-ink-300)" }} />
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search..."
            className="flex-1 bg-transparent text-[0.875rem] outline-none placeholder:text-[var(--color-ink-300)]"
            style={{ color: "var(--color-ink-900)" }} />
          {query && <button onClick={() => setQuery("")} className="press"><X className="size-4" style={{ color: "var(--color-ink-300)" }} /></button>}
        </div>
      </div>

      <div className="flex gap-1.5 mb-4 overflow-x-auto">
        {FILTER_CHIPS.map((chip) => {
          const active = statusFilter === chip.value;
          return <button key={chip.value} onClick={() => setStatusFilter(chip.value)}
          className="press rounded-[0.375rem] px-3 py-1 text-[0.6875rem] font-semibold whitespace-nowrap transition-colors"
          style={{ backgroundColor: active ? "var(--color-ink-950)" : "var(--color-concrete)", color: active ? "#fff" : "var(--color-ink-500)" }}>
          {chip.label}
        </button>;
        })}
      </div>

      {isFiltering ? (
        <FlatList items={filtered} />
      ) : (
        <GroupedList items={items} />
      )}
    </div>
  );
}

/* ----------------------------------------------------------------
 * Flat list — shown when a search or filter is active.
 * ---------------------------------------------------------------- */
function FlatList({ items }: { items: PortalListingItem[] }) {
  if (items.length === 0) {
    return (
      <MobileEmptyState
        icon={Globe}
        title="No matching listings"
        hint="Try a different search or filter"
      />
    );
  }
  return (
    <div>
      <MobileSectionTitle>Results ({items.length})</MobileSectionTitle>
      <div className="flex flex-col gap-2.5">
        {items.map((l) => (
          <ListingRow key={l.id} l={l} />
        ))}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------
 * Grouped list — the default Failed → Listed → Draft → Delisted view.
 * ---------------------------------------------------------------- */
function GroupedList({ items }: { items: PortalListingItem[] }) {
  const failed = items.filter((l) => l.status === "SYNC_FAILED");
  const listed = items.filter((l) => l.status === "LISTED");
  const draft = items.filter((l) => l.status === "DRAFT");
  const delisted = items.filter((l) => l.status === "DELISTED");

  return (
    <div>
      {failed.length > 0 && (
        <>
          <MobileSectionTitle>Sync Failed ({failed.length})</MobileSectionTitle>
          <div className="flex flex-col gap-2.5">
            {failed.map((l) => (
              <ListingRow key={l.id} l={l} />
            ))}
          </div>
        </>
      )}

      <MobileSectionTitle>Listed ({listed.length})</MobileSectionTitle>
      {listed.length === 0 ? (
        <MobileEmptyState
          icon={Globe}
          title="No listings live"
          hint="Draft listings appear here once synced to a portal"
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {listed.map((l) => (
            <ListingRow key={l.id} l={l} />
          ))}
        </div>
      )}

      {draft.length > 0 && (
        <>
          <MobileSectionTitle>Draft ({draft.length})</MobileSectionTitle>
          <div className="flex flex-col gap-2.5">
            {draft.map((l) => (
              <ListingRow key={l.id} l={l} />
            ))}
          </div>
        </>
      )}

      {delisted.length > 0 && (
        <>
          <MobileSectionTitle>Delisted ({delisted.length})</MobileSectionTitle>
          <div className="flex flex-col gap-2.5">
            {delisted.map((l) => (
              <ListingRow key={l.id} l={l} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** A single portal-listing row with a status badge and price meta. */
function ListingRow({ l }: { l: PortalListingItem }) {
  const subtitle = `${l.portalName} · ${l.unitNumber ?? "—"}${
    l.status === "SYNC_FAILED" && l.syncError
      ? ` · ${l.syncError}`
      : l.lastSyncedAt
        ? ` · synced ${formatDate(l.lastSyncedAt)}`
        : ""
  }`;
  return (
    <MobileRow
      icon={Globe}
      title={l.title}
      subtitle={subtitle}
      meta={formatCurrency(l.askingPrice)}
      tone={
        l.status === "SYNC_FAILED"
          ? "danger"
          : l.status === "LISTED"
            ? "success"
            : l.status === "DRAFT"
              ? "warning"
              : "default"
      }
      badge={
        <div className="flex shrink-0 items-center gap-1.5">
          <MobileStatusBadge status={l.status} />
          {l.status === "LISTED" && l.listingUrl && (
            <Link
              href={l.listingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground active:bg-accent"
              aria-label="Open listing"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      }
    />
  );
}
