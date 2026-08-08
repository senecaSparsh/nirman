"use client";

import { useState, useMemo } from "react";
import { Globe, ExternalLink } from "lucide-react";
import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileInfoRow,
  MobileSearchBar,
  MobileFilterChips,
  MobileStatusBadge,
  MobileEmptyState,
} from "@/components/mobile/mobile-primitives";

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
 * Rows use MobileInfoRow (not tappable to a detail page) because there
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
      <MobileSearchBar
        value={query}
        onChange={setQuery}
        placeholder="Search title, portal, unit…"
      />

      <MobileFilterChips
        chips={FILTER_CHIPS}
        active={statusFilter}
        onChange={setStatusFilter}
      />

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
      <div>
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
          <div>
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
        <div>
          {listed.map((l) => (
            <ListingRow key={l.id} l={l} />
          ))}
        </div>
      )}

      {draft.length > 0 && (
        <>
          <MobileSectionTitle>Draft ({draft.length})</MobileSectionTitle>
          <div>
            {draft.map((l) => (
              <ListingRow key={l.id} l={l} />
            ))}
          </div>
        </>
      )}

      {delisted.length > 0 && (
        <>
          <MobileSectionTitle>Delisted ({delisted.length})</MobileSectionTitle>
          <div>
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
    <MobileInfoRow
      icon={Globe}
      title={l.title}
      subtitle={subtitle}
      value={formatCurrency(l.askingPrice)}
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
