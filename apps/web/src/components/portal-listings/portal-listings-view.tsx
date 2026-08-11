"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Globe, Plus, RefreshCw, ExternalLink, XCircle, Loader2,
  CheckCircle2, AlertCircle, Clock, Pencil, Trash2,
  Zap, SearchX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { DataTable, type Column } from "@/components/ui/data-table";
import { IdentityCell, MoneyCell, QtyCell } from "@/components/ui/cells";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";

type ListingStatus = "DRAFT" | "LISTED" | "DELISTED" | "SYNC_FAILED";

type ListingRow = {
  id: string;
  builtUnitId: string;
  unitNumber: string;
  unitType: string;
  unitStatus: string;
  projectName: string;
  portalName: string;
  listingId: string | null;
  listingUrl: string | null;
  status: ListingStatus;
  title: string;
  description: string | null;
  askingPrice: number;
  area: number;
  areaUnit: string;
  floor: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  furnishing: string | null;
  photos: string[];
  listedAt: string | null;
  lastSyncedAt: string | null;
  syncError: string | null;
};

type UnitOption = {
  id: string;
  label: string;
  unitNumber: string;
  unitType: string;
  askingPrice: number;
  area: number;
  areaUnit: string;
  floor: number | null;
};

type ProjectOption = { id: string; name: string };

const PORTAL_NAMES = ["99acres", "MagicBricks", "Housing.com"];

const STATUS_CONFIG: Record<ListingStatus, { label: string; variant: "success" | "warning" | "danger" | "muted"; icon: typeof CheckCircle2 }> = {
  LISTED: { label: "Listed", variant: "success", icon: CheckCircle2 },
  DRAFT: { label: "Draft", variant: "warning", icon: Clock },
  DELISTED: { label: "Delisted", variant: "muted", icon: XCircle },
  SYNC_FAILED: { label: "Sync Failed", variant: "danger", icon: AlertCircle },
};

const UNIT_TYPE_LABELS: Record<string, string> = {
  BHK_1: "1 BHK", BHK_2: "2 BHK", BHK_3: "3 BHK", BHK_4: "4 BHK",
  SHOP: "Shop", OFFICE: "Office", WAREHOUSE_UNIT: "Warehouse", VILLA: "Villa", OTHER: "Other",
};

function unitTypeLabel(t: string): string {
  return UNIT_TYPE_LABELS[t] ?? t.replace(/_/g, " ");
}

function pricePerSqft(price: number, area: number): number | null {
  if (!area || area <= 0) return null;
  return price / area;
}

function timeAgo(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

function StatusBadge({ status }: { status: ListingStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.DRAFT;
  const Icon = cfg.icon;
  return (
    <Badge variant={cfg.variant} className="text-micro">
      <Icon className="mr-0.5 h-3 w-3" /> {cfg.label}
    </Badge>
  );
}

export function PortalListingsView({
  listings,
  unitOptions,
  projects = [],
  permissions,
}: {
  listings: ListingRow[];
  unitOptions: UnitOption[];
  projects?: ProjectOption[];
  permissions?: { canManage?: boolean };
}) {
  const canManage = permissions?.canManage ?? false;
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ListingRow | null>(null);
  const [detailTarget, setDetailTarget] = useState<ListingRow | null>(null);
  const [delistTarget, setDelistTarget] = useState<ListingRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ListingRow | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [bulkSyncing, setBulkSyncing] = useState(false);
  const router = useRouter();

  const pendingSyncCount = useMemo(
    () => listings.filter((l) => l.status === "DRAFT" || l.status === "SYNC_FAILED").length,
    [listings],
  );

  async function sync(id: string) {
    setSyncing(id);
    try {
      const res = await fetch(`/api/portal-listings/${id}?action=sync`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sync failed");
      toast.success(data.status === "LISTED" ? "Listing pushed to portal" : "Sync attempted");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(null);
    }
  }

  async function bulkSync() {
    setBulkSyncing(true);
    try {
      const res = await fetch("/api/portal-listings?action=sync-all", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Bulk sync failed");
      if (data.total === 0) {
        toast.info("No pending listings to sync");
      } else {
        toast.success(`${data.succeeded}/${data.total} synced successfully${data.failed > 0 ? `, ${data.failed} failed` : ""}`);
      }
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Bulk sync failed");
    } finally {
      setBulkSyncing(false);
    }
  }

  async function confirmDelist() {
    if (!delistTarget) return;
    setSyncing(delistTarget.id);
    try {
      const res = await fetch(`/api/portal-listings/${delistTarget.id}?action=delist`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Delist failed");
      toast.success("Listing delisted from portal");
      setDelistTarget(null);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Delist failed");
    } finally {
      setSyncing(null);
    }
  }

  const columns: Column<ListingRow>[] = [
    {
      key: "title",
      label: "Listing",
      sortable: true,
      width: "280px",
      sortValue: (l) => l.title,
      render: (l) => {
        const pps = pricePerSqft(l.askingPrice, l.area);
        return (
          <IdentityCell
            name={l.title}
            sub={[
              l.projectName,
              `${l.unitNumber} (${unitTypeLabel(l.unitType)})`,
              pps != null ? `${formatCurrency(pps)}/${l.areaUnit.replace(/_/g, " ").toLowerCase()}` : null,
            ].filter(Boolean).join(" · ")}
          />
        );
      },
      exportValue: (l) => l.title,
    },
    {
      key: "portalName",
      label: "Portal",
      sortable: true,
      filterable: true,
      width: "120px",
      render: (l) => (
        <span className="inline-flex items-center gap-1.5 text-foreground">
          <Globe className="h-3.5 w-3.5 text-muted-foreground" />
          {l.portalName}
        </span>
      ),
      filterValue: (l) => l.portalName,
      exportValue: (l) => l.portalName,
    },
    {
      key: "projectName",
      label: "Project",
      sortable: true,
      filterable: true,
      width: "160px",
      render: (l) => l.projectName,
      filterValue: (l) => l.projectName,
      exportValue: (l) => l.projectName,
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      filterable: true,
      render: (l) => <StatusBadge status={l.status} />,
      filterValue: (l) => STATUS_CONFIG[l.status]?.label ?? l.status,
      exportValue: (l) => l.status,
    },
    {
      key: "askingPrice",
      label: "Asking price",
      align: "right",
      sortable: true,
      render: (l) => <MoneyCell value={l.askingPrice} formatted={formatCurrency(l.askingPrice)} />,
      exportValue: (l) => l.askingPrice,
    },
    {
      key: "area",
      label: "Area",
      align: "right",
      sortable: true,
      render: (l) => <QtyCell value={formatNumber(l.area, 0)} unit={l.areaUnit.replace(/_/g, " ").toLowerCase()} />,
      exportValue: (l) => l.area,
    },
    {
      key: "bedrooms",
      label: "BHK",
      align: "right",
      sortable: true,
      defaultHidden: true,
      render: (l) => l.bedrooms != null ? `${l.bedrooms} BHK` : <span className="text-faint">—</span>,
      sortValue: (l) => l.bedrooms ?? -1,
      exportValue: (l) => l.bedrooms ?? "",
    },
    {
      key: "lastSyncedAt",
      label: "Last synced",
      sortable: true,
      defaultHidden: true,
      sortValue: (l) => l.lastSyncedAt ?? "",
      render: (l) => {
        if (l.syncError) return <span className="text-danger text-meta">{l.syncError.slice(0, 40)}</span>;
        if (l.lastSyncedAt) return <span className="text-muted-foreground">{timeAgo(l.lastSyncedAt)}</span>;
        return <span className="text-faint">—</span>;
      },
      exportValue: (l) => l.lastSyncedAt ?? "",
    },
    {
      key: "listedAt",
      label: "Listed on",
      sortable: true,
      defaultHidden: true,
      sortValue: (l) => l.listedAt ?? "",
      render: (l) => l.listedAt ? <span className="text-muted-foreground">{formatDate(l.listedAt)}</span> : <span className="text-faint">—</span>,
      exportValue: (l) => l.listedAt ?? "",
    },
  ];

  function rowActions(l: ListingRow) {
    return (
      <>
        {l.listingUrl && (
          <a
            href={l.listingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-info"
            title={`View on ${l.portalName}`}
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
        {canManage && l.status !== "DELISTED" && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={(e) => { e.stopPropagation(); sync(l.id); }}
            disabled={syncing === l.id}
            title={l.status === "DRAFT" ? "Push to portal" : "Re-sync"}
          >
            {syncing === l.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
        )}
        {canManage && l.status !== "LISTED" && (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setEditTarget(l); setFormOpen(true); }} title="Edit listing">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
        {canManage && l.status === "LISTED" && (
          <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-danger" onClick={(e) => { e.stopPropagation(); setDelistTarget(l); }} disabled={syncing === l.id} title="Delist from portal">
            <XCircle className="h-3.5 w-3.5" />
          </Button>
        )}
        {canManage && l.status !== "LISTED" && (
          <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-danger" onClick={(e) => { e.stopPropagation(); setDeleteTarget(l); }} title="Delete listing">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </>
    );
  }

  const trailingButtons = (
    <>
      {canManage && pendingSyncCount > 0 && (
        <Button variant="outline" onClick={bulkSync} disabled={bulkSyncing}>
          {bulkSyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
          Sync All ({pendingSyncCount})
        </Button>
      )}
      {canManage && unitOptions.length > 0 && (
        <Button onClick={() => { setEditTarget(null); setFormOpen(true); }}>
          <Plus className="h-4 w-4" /> New listing
        </Button>
      )}
    </>
  );

  const noMatch = (
    <EmptyState
      size="compact"
      icon={<SearchX />}
      title="No listings match"
      description="Adjust the search or column filters to see all portal listings."
    />
  );

  return (
    <div className="space-y-4">
      {listings.length === 0 ? (
        <EmptyState
          icon={<Globe className="h-5 w-5" />}
          title="No portal listings yet"
          description="Sync your available built units to property portals like 99acres, MagicBricks, and Housing.com to reach more buyers."
          action={canManage && unitOptions.length > 0 ? (
            <Button size="sm" onClick={() => { setEditTarget(null); setFormOpen(true); }}>
              <Plus className="mr-1 h-3.5 w-3.5" /> New Listing
            </Button>
          ) : undefined}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
          <DataTable
            data={listings}
            columns={columns}
            storageKey="portal-listings"
            hideable
            exportFileName="portal-listings"
            initialSort={{ key: "askingPrice", direction: "desc" }}
            onRowClick={(l) => setDetailTarget(l)}
            searchable
            searchPlaceholder="Search title, unit, project, portal…"
            toolbarTrailing={trailingButtons}
            showTotals
            sumColumns={["askingPrice"]}
            totalFormat={(_key, sum) => formatCurrency(sum)}
            rowTone={(l) => {
              if (l.status === "SYNC_FAILED") return "danger";
              if (l.status === "DELISTED") return "warning";
              return null;
            }}
            rowActions={rowActions}
            emptyState={noMatch}
          />
        </div>
      )}

      {/* Form dialog (create or edit) */}
      {formOpen && (
        <ListingForm
          unitOptions={unitOptions}
          editTarget={editTarget}
          onOpenChange={setFormOpen}
          onSaved={() => { setFormOpen(false); setEditTarget(null); router.refresh(); }}
        />
      )}

      {/* Detail dialog */}
      {detailTarget && (
        <ListingDetailDialog
          listing={detailTarget}
          onClose={() => setDetailTarget(null)}
          onEdit={() => { setEditTarget(detailTarget); setDetailTarget(null); setFormOpen(true); }}
          onSync={() => { sync(detailTarget.id); setDetailTarget(null); }}
          onDelist={() => { setDelistTarget(detailTarget); setDetailTarget(null); }}
          canManage={canManage}
          syncing={syncing === detailTarget.id}
        />
      )}

      {/* Delist confirmation */}
      <ConfirmDialog
        open={!!delistTarget}
        onOpenChange={(o) => !o && setDelistTarget(null)}
        title="Delist from portal"
        description={`Remove "${delistTarget?.title}" from ${delistTarget?.portalName}? The listing will be marked as delisted and removed from the portal.`}
        confirmLabel="Delist"
        variant="destructive"
        onConfirm={confirmDelist}
      />

      {/* Delete confirmation */}
      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        endpoint={deleteTarget ? `/api/portal-listings/${deleteTarget.id}` : ""}
        title="Delete listing"
        description={`Permanently delete the ${deleteTarget?.portalName} listing for "${deleteTarget?.title}"? This cannot be undone.`}
        successMessage="Listing deleted"
        errorMessage="Failed to delete listing"
      />
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Listing Detail Dialog
// ───────────────────────────────────────────────────────────

function ListingDetailDialog({
  listing,
  onClose,
  onEdit,
  onSync,
  onDelist,
  canManage,
  syncing,
}: {
  listing: ListingRow;
  onClose: () => void;
  onEdit: () => void;
  onSync: () => void;
  onDelist: () => void;
  canManage: boolean;
  syncing: boolean;
}) {
  const cfg = STATUS_CONFIG[listing.status] ?? STATUS_CONFIG.DRAFT;
  const Icon = cfg.icon;
  const pps = pricePerSqft(listing.askingPrice, listing.area);

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={listing.title}
      description={`${listing.portalName} · ${listing.projectName} — ${listing.unitNumber}`}
      className="max-w-xl"
      action={
        canManage && listing.status !== "LISTED" ? (
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-4">
        {/* Status + key facts */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={cfg.variant}>
            <Icon className="mr-0.5 h-3 w-3" /> {cfg.label}
          </Badge>
          {listing.listingId && (
            <Badge variant="outline" className="font-mono text-micro">ID: {listing.listingId}</Badge>
          )}
        </div>

        {/* Photo gallery */}
        {listing.photos.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {listing.photos.slice(0, 6).map((url, i) => (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="aspect-square overflow-hidden rounded-md border border-border bg-muted"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Photo ${i + 1}`} className="h-full w-full object-cover transition-transform hover:scale-105" />
              </a>
            ))}
          </div>
        )}

        {/* Price + area card */}
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/20 p-3 sm:grid-cols-4">
          <div>
            <div className="text-label text-muted-foreground">Asking Price</div>
            <div className="text-body font-semibold tnum">{formatCurrency(listing.askingPrice)}</div>
          </div>
          <div>
            <div className="text-label text-muted-foreground">Area</div>
            <div className="text-body font-semibold tnum">{formatNumber(listing.area, 0)} {listing.areaUnit.replace(/_/g, " ").toLowerCase()}</div>
          </div>
          {pps != null && (
            <div>
              <div className="text-label text-muted-foreground">Price / {listing.areaUnit.replace(/_/g, " ").toLowerCase()}</div>
              <div className="text-body font-semibold tnum">{formatCurrency(pps)}</div>
            </div>
          )}
          <div>
            <div className="text-label text-muted-foreground">Unit Type</div>
            <div className="text-body font-semibold">{unitTypeLabel(listing.unitType)}</div>
          </div>
        </div>

        {/* Property details grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-meta sm:grid-cols-3">
          {listing.floor != null && (
            <div><span className="text-muted-foreground">Floor: </span>{listing.floor}</div>
          )}
          {listing.bedrooms != null && (
            <div><span className="text-muted-foreground">Bedrooms: </span>{listing.bedrooms}</div>
          )}
          {listing.bathrooms != null && (
            <div><span className="text-muted-foreground">Bathrooms: </span>{listing.bathrooms}</div>
          )}
          {listing.furnishing && (
            <div><span className="text-muted-foreground">Furnishing: </span>{listing.furnishing}</div>
          )}
          <div><span className="text-muted-foreground">Unit #: </span>{listing.unitNumber}</div>
        </div>

        {/* Description */}
        {listing.description && (
          <div>
            <div className="text-label text-muted-foreground">Description</div>
            <p className="mt-1 text-body leading-relaxed whitespace-pre-wrap">{listing.description}</p>
          </div>
        )}

        {/* Sync info */}
        <div className="space-y-1.5 rounded-lg border border-border p-3">
          <div className="text-label text-muted-foreground">Sync Status</div>
          {listing.listedAt && (
            <div className="text-meta">
              <span className="text-muted-foreground">First listed: </span>{formatDate(listing.listedAt)}
            </div>
          )}
          {listing.lastSyncedAt && (
            <div className="text-meta">
              <span className="text-muted-foreground">Last synced: </span>{formatDate(listing.lastSyncedAt)}
            </div>
          )}
          {listing.syncError && (
            <div className="flex items-start gap-1.5 text-meta text-danger">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{listing.syncError}</span>
            </div>
          )}
          {listing.listingUrl && (
            <a
              href={listing.listingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-meta text-info hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" /> View on {listing.portalName}
            </a>
          )}
        </div>

        {/* Actions */}
        {canManage && (
          <div className="flex justify-end gap-2 border-t border-border pt-3">
            {listing.status !== "DELISTED" && (
              <Button size="sm" variant="outline" onClick={onSync} disabled={syncing}>
                {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                {listing.status === "DRAFT" ? "Push to Portal" : "Re-sync"}
              </Button>
            )}
            {listing.status === "LISTED" && (
              <Button size="sm" variant="outline" className="text-danger" onClick={onDelist} disabled={syncing}>
                <XCircle className="h-3.5 w-3.5" /> Delist
              </Button>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}

// ───────────────────────────────────────────────────────────
//  Listing Form (Create or Edit)
// ───────────────────────────────────────────────────────────

function ListingForm({
  unitOptions,
  editTarget,
  onOpenChange,
  onSaved,
}: {
  unitOptions: UnitOption[];
  editTarget: ListingRow | null;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [builtUnitId, setBuiltUnitId] = useState(editTarget?.builtUnitId ?? "");
  const [portalName, setPortalName] = useState(editTarget?.portalName ?? "99acres");
  const [title, setTitle] = useState(editTarget?.title ?? "");
  const [description, setDescription] = useState(editTarget?.description ?? "");
  const [askingPrice, setAskingPrice] = useState(editTarget ? String(editTarget.askingPrice) : "");
  const [bedrooms, setBedrooms] = useState(editTarget?.bedrooms != null ? String(editTarget.bedrooms) : "");
  const [bathrooms, setBathrooms] = useState(editTarget?.bathrooms != null ? String(editTarget.bathrooms) : "");
  const [furnishing, setFurnishing] = useState(editTarget?.furnishing ?? "");
  const [photos, setPhotos] = useState<string[]>(editTarget?.photos ?? []);
  const [photoInput, setPhotoInput] = useState("");

  const selectedUnit = unitOptions.find((u) => u.id === builtUnitId);
  const isEdit = !!editTarget;

  function onUnitChange(id: string) {
    setBuiltUnitId(id);
    if (isEdit) return;
    const u = unitOptions.find((x) => x.id === id);
    if (u) {
      const typeLabel = unitTypeLabel(u.unitType);
      const projectName = u.label.split(" — ")[0] ?? "";
      setTitle(`${typeLabel} ${u.unitNumber} for sale in ${projectName}`);
      if (u.askingPrice > 0) setAskingPrice(String(u.askingPrice));
      const bhkMatch = u.unitType.match(/BHK_(\d)/);
      if (bhkMatch) setBedrooms(bhkMatch[1]!);
    }
  }

  function addPhoto() {
    const url = photoInput.trim();
    if (!url) return;
    try { new URL(url); } catch { toast.error("Enter a valid URL"); return; }
    setPhotos((p) => [...p, url]);
    setPhotoInput("");
  }

  function removePhoto(idx: number) {
    setPhotos((p) => p.filter((_, i) => i !== idx));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!isEdit && !builtUnitId) return toast.error("Select a built unit");
    if (!title.trim()) return toast.error("Title is required");
    if (!askingPrice || Number(askingPrice) <= 0) return toast.error("Asking price must be > 0");

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim() || undefined,
        askingPrice: Number(askingPrice),
        bedrooms: bedrooms ? Number(bedrooms) : undefined,
        bathrooms: bathrooms ? Number(bathrooms) : undefined,
        furnishing: furnishing || undefined,
        photos: photos.length > 0 ? photos : undefined,
      };
      if (!isEdit) {
        payload.builtUnitId = builtUnitId;
        payload.portalName = portalName;
      }

      const url = isEdit ? `/api/portal-listings/${editTarget!.id}` : "/api/portal-listings";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save listing");
      toast.success(isEdit ? "Listing updated" : "Listing created as draft — click Push to sync to the portal");
      onSaved();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  const pps = askingPrice && selectedUnit ? pricePerSqft(Number(askingPrice), selectedUnit.area) : null;

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title={isEdit ? "Edit Listing" : "New Portal Listing"}
      description={isEdit ? "Update the listing details" : "Create a listing for a built unit on a property portal"}
      className="max-w-lg"
    >
      <form onSubmit={save} className="space-y-3">
        {/* Built unit + portal (only on create) */}
        {!isEdit && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Built Unit *</Label>
              <Select value={builtUnitId} onChange={(e) => onUnitChange(e.target.value)} required>
                <option value="" disabled>Select a unit…</option>
                {unitOptions.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Portal *</Label>
              <Select value={portalName} onChange={(e) => setPortalName(e.target.value)}>
                {PORTAL_NAMES.map((p) => <option key={p} value={p}>{p}</option>)}
              </Select>
            </div>
          </div>
        )}

        {/* Selected unit info */}
        {selectedUnit && (
          <p className="text-micro text-muted-foreground">
            {formatNumber(selectedUnit.area, 0)} {selectedUnit.areaUnit.replace(/_/g, " ").toLowerCase()}
            {selectedUnit.floor != null && ` · Floor ${selectedUnit.floor}`}
            {selectedUnit.askingPrice > 0 && ` · Asking: ${formatCurrency(selectedUnit.askingPrice)}`}
          </p>
        )}

        {/* Title */}
        <div className="space-y-1.5">
          <Label>Listing Title *</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. 2 BHK Apartment for sale in Skyline Residency" required />
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <Label>Description</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Describe the property — location, amenities, highlights…" />
        </div>

        {/* Price + bedrooms + bathrooms */}
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>Asking Price *</Label>
            <Input type="number" min="0" step="0.01" value={askingPrice} onChange={(e) => setAskingPrice(e.target.value)} required />
            {pps != null && (
              <p className="text-micro text-muted-foreground">{formatCurrency(pps)}/{selectedUnit!.areaUnit.replace(/_/g, " ").toLowerCase()}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Bedrooms</Label>
            <Input type="number" min="0" max="10" value={bedrooms} onChange={(e) => setBedrooms(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Bathrooms</Label>
            <Input type="number" min="0" max="10" value={bathrooms} onChange={(e) => setBathrooms(e.target.value)} />
          </div>
        </div>

        {/* Furnishing */}
        <div className="space-y-1.5">
          <Label>Furnishing</Label>
          <Select value={furnishing} onChange={(e) => setFurnishing(e.target.value)}>
            <option value="">Select…</option>
            <option value="Furnished">Furnished</option>
            <option value="Semi-Furnished">Semi-Furnished</option>
            <option value="Unfurnished">Unfurnished</option>
          </Select>
        </div>

        {/* Photos */}
        <div className="space-y-1.5">
          <Label>Photos ({photos.length})</Label>
          <div className="flex gap-1.5">
            <Input
              type="url"
              value={photoInput}
              onChange={(e) => setPhotoInput(e.target.value)}
              placeholder="https://example.com/photo.jpg"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPhoto(); } }}
            />
            <Button type="button" variant="outline" size="sm" onClick={addPhoto} disabled={!photoInput.trim()}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          {photos.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {photos.map((url, i) => (
                <div key={i} className="relative h-16 w-16 overflow-hidden rounded-md border border-border bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    className="absolute right-0 top-0 rounded-bl-md bg-foreground/70 px-1 text-white transition-colors hover:bg-danger"
                  >
                    <XCircle className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : isEdit ? "Save Changes" : "Create Draft"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
