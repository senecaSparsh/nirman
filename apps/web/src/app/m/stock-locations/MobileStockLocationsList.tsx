"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {MapPin, Pencil, Trash2, Loader2, Warehouse, Building2, Eye, Share2, Package, IndianRupee, FolderOpen} from "lucide-react";
import { haptic } from "@/lib/haptic";
import { useLongPress } from "@/lib/use-long-press";
import {
  MobileOverviewSheet,
  type OverviewRow,
} from "@/components/mobile/v2/mobile-overview-sheet";
import type { ContextAction } from "@/components/mobile/v2/mobile-context-menu";
import { MobileEmptyState } from "@/components/mobile/v2/primitives";
import { MobileFab } from "@/components/mobile/v2/scaffold";
import { MobileFabModal } from "@/components/mobile/v2/fab-modal";
import { MobileDialog } from "@/components/mobile/v2/dialog";
import { useFabModal } from "@/lib/use-fab-modal";
import { MobileNewStockLocationForm } from "./MobileNewStockLocationDialog";
import { MobileSelectWithCreate } from "@/components/mobile/MobileSelectWithCreate";
import { formatCurrency, formatCurrencyCompact } from "@/lib/utils";

type LocationType = "COMPANY_WAREHOUSE" | "PROJECT_SITE" | "DEPARTMENT" | "CENTRAL_WAREHOUSE";

type LocationRow = {
  id: string;
  type: LocationType;
  name: string;
  address: string | null;
  projectId: string | null;
  projectName: string | null;
  lat: number | null;
  lng: number | null;
  geoRadius: number | null;
  itemCount: number;
  stockValue: number;
};

interface ProjectItem { id: string; name: string; }

const TYPE_LABELS: Record<LocationType, string> = {
  COMPANY_WAREHOUSE: "Warehouse",
  CENTRAL_WAREHOUSE: "Central Warehouse",
  PROJECT_SITE: "Project Site",
  DEPARTMENT: "Department",
};

const TYPE_ICONS: Record<LocationType, typeof Warehouse> = {
  COMPANY_WAREHOUSE: Warehouse,
  CENTRAL_WAREHOUSE: Warehouse,
  PROJECT_SITE: MapPin,
  DEPARTMENT: Building2,
};

export function MobileStockLocationsList({
  locations,
  projects,
  canManage,
}: {
  locations: LocationRow[];
  projects: ProjectItem[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<LocationRow | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const fab = useFabModal();

  async function handleDelete(loc: LocationRow) {
    if (loc.itemCount > 0) {
      toast.error("Cannot delete a location with stock items");
      return;
    }
    if (!window.confirm(`Delete "${loc.name}"?\n\nThis cannot be undone.`)) return;
    setDeleting(loc.id);
    haptic(10);
    try {
      const res = await fetch(`/api/stock-locations/${loc.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");
      toast.success("Location deleted");
      haptic([10, 40, 80]);
      router.refresh();
    } catch (err: unknown) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div>
      <div className="px-4 pt-4 pb-2">
        <a
          href="/m/settings"
          className="text-m-caption font-medium"
          style={{ color: "var(--color-ink-500)" }}
        >
          ← Settings
        </a>
        <h1 className="text-m-section font-bold mt-1" style={{ color: "var(--color-ink-950)" }}>
          Stock Locations
        </h1>
        <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
          {locations.length} location{locations.length !== 1 ? "s" : ""}
        </p>
      </div>

      {canManage && (
        <>
          <MobileFab onClick={fab.toggle} isOpen={fab.isOpen} label="New location" icon={MapPin} />
          <MobileFabModal
            open={fab.isOpen}
            onClose={fab.close}
            originRect={fab.originRect}
            title="New Stock Location"
          >
            <MobileNewStockLocationForm
              onClose={fab.close}
              projects={projects}
            />
          </MobileFabModal>
        </>
      )}

      {locations.length === 0 ? (
        <MobileEmptyState
          icon={MapPin}
          title="No stock locations"
          hint={canManage ? "Tap the + button to create one" : "Ask an admin to create locations"}
        />
      ) : (
        <div className="flex flex-col gap-2 px-4 pb-8">
          {locations.map((loc) => (
            <LocationCard
              key={loc.id}
              loc={loc}
              canManage={canManage}
              isDeleting={deleting === loc.id}
              onEdit={() => setEditing(loc)}
              onDelete={() => handleDelete(loc)}
            />
          ))}
        </div>
      )}

      {editing && (
        <EditLocationDialog
          location={editing}
          projects={projects}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

/* ── Location card — extracted so we can use long-press hooks ────────────── */
/* Long-press opens an overview sheet (data already in the list item — no fetch). */
function LocationCard({
  loc,
  canManage,
  isDeleting,
  onEdit,
  onDelete,
}: {
  loc: LocationRow;
  canManage: boolean;
  isDeleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const router = useRouter();
  const Icon = TYPE_ICONS[loc.type] ?? MapPin;

  // ── Long-press overview sheet (data already in the list item — no fetch) ──
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [pressPoint, setPressPoint] = useState<{ x: number; y: number } | null>(null);
  const { bind: longPressBind } = useLongPress((x, y) => {
    setPressPoint({ x, y });
    setOverviewOpen(true);
  });

  const overviewRows: OverviewRow[] = [
    { icon: Icon, label: "Type", value: TYPE_LABELS[loc.type] ?? loc.type },
    ...(loc.projectName ? [{ icon: MapPin, label: "Project", value: loc.projectName }] : []),
    ...(loc.address ? [{ icon: MapPin, label: "Address", value: loc.address }] : []),
    { icon: Package, label: "Total Items", value: String(loc.itemCount) },
    {
      icon: IndianRupee,
      label: "Stock Value",
      value: formatCurrency(loc.stockValue),
    },
  ];

  const overviewActions: ContextAction[] = [
    {
      label: "View Full Details",
      icon: Eye,
      onPress: () => router.push(`/m/stock-locations/${loc.id}`),
    },
    {
      label: "Share",
      icon: Share2,
      onPress: () => {
        const url = `${window.location.origin}/m/stock-locations/${loc.id}`;
        if (navigator.share) {
          navigator.share({ title: loc.name, url }).catch(() => {});
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
        <div
          className="rounded-[0.75rem] border p-3.5"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div
                className="grid place-items-center size-9 rounded-[0.625rem] shrink-0"
                style={{ backgroundColor: "color-mix(in srgb, var(--color-ink-500) 10%, transparent)" }}
              >
                <Icon className="size-4" style={{ color: "var(--color-ink-600)" }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-m-body font-semibold truncate" style={{ color: "var(--color-ink-950)" }}>
                  {loc.name}
                </p>
                <p className="text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                  {TYPE_LABELS[loc.type] ?? loc.type}
                  {loc.projectName ? ` · ${loc.projectName}` : ""}
                </p>
                {loc.address && (
                  <p className="text-m-caption mt-0.5 truncate" style={{ color: "var(--color-ink-400)" }}>
                    {loc.address}
                  </p>
                )}
                <div className="flex items-center gap-3 mt-1.5 text-m-caption" style={{ color: "var(--color-ink-500)" }}>
                  <span>{loc.itemCount} item{loc.itemCount !== 1 ? "s" : ""}</span>
                  <span>·</span>
                  <span className="tnum">{formatCurrencyCompact(loc.stockValue)}</span>
                </div>
              </div>
            </div>
            {canManage && (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={onEdit}
                  className="grid place-items-center size-8 rounded-[0.625rem] active:opacity-70 transition-colors press"
                  title="Edit location"
                >
                  <Pencil className="size-4" style={{ color: "var(--color-ink-500)" }} />
                </button>
                <button
                  onClick={onDelete}
                  disabled={isDeleting || loc.itemCount > 0}
                  className="grid place-items-center size-8 rounded-[0.625rem] active:opacity-70 transition-colors disabled:opacity-30 press"
                  title={loc.itemCount > 0 ? "Cannot delete location with stock" : "Delete location"}
                >
                  {isDeleting ? (
                    <Loader2 className="size-4 animate-spin" style={{ color: "var(--color-stop)" }} />
                  ) : (
                    <Trash2 className="size-4" style={{ color: "var(--color-stop)" }} />
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Long-press overview sheet */}
      <MobileOverviewSheet
        open={overviewOpen}
        onClose={() => setOverviewOpen(false)}
        origin={pressPoint}
        title={loc.name}
        subtitle={TYPE_LABELS[loc.type] ?? loc.type}
        accentColor="var(--color-ink-500)"
        rows={overviewRows}
        actions={overviewActions}
      />
    </>
  );
}

/* ── Edit Location Dialog ────────────────────────────────────── */

function EditLocationDialog({
  location,
  projects,
  onClose,
  onSaved,
}: {
  location: LocationRow;
  projects: ProjectItem[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const _router = useRouter();
  const [name, setName] = useState(location.name);
  const [address, setAddress] = useState(location.address ?? "");
  const [projectId, setProjectId] = useState(location.projectId ?? "");
  const [lat, setLat] = useState(location.lat != null ? String(location.lat) : "");
  const [lng, setLng] = useState(location.lng != null ? String(location.lng) : "");
  const [geoRadius, setGeoRadius] = useState(location.geoRadius != null ? String(location.geoRadius) : "");
  const [saving, setSaving] = useState(false);

  const isProjectSite = location.type === "PROJECT_SITE";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    haptic(10);
    try {
      const res = await fetch(`/api/stock-locations/${location.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          address: address.trim() || null,
          projectId: isProjectSite ? (projectId || null) : null,
          lat: lat ? parseFloat(lat) : null,
          lng: lng ? parseFloat(lng) : null,
          geoRadius: geoRadius ? parseInt(geoRadius) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update location");
      toast.success("Location updated");
      haptic([10, 40, 80]);
      onSaved();
    } catch (err: unknown) {
      haptic([50, 20, 50]);
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  return (
    <MobileDialog open={true} onClose={onClose} title="Edit Location">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <label className="text-m-caption font-medium" style={{ color: "var(--color-ink-600)" }}>
              Name *
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-[0.625rem] border px-3 py-2.5 text-m-body outline-none" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
              required
            />
          </div>

          {isProjectSite && (
            <MobileSelectWithCreate
              label="Project"
              value={projectId}
              onChange={(v) => setProjectId(v)}
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
              placeholder="Select project…"
              icon={FolderOpen}
            />
          )}

          <div className="space-y-1">
            <label className="text-m-caption font-medium" style={{ color: "var(--color-ink-600)" }}>
              Address
            </label>
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={2}
              className="w-full rounded-[0.625rem] border px-3 py-2.5 text-m-body resize-none outline-none" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-m-caption font-medium" style={{ color: "var(--color-ink-600)" }}>
                Latitude
              </label>
              <input
                type="number"
                step="any"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="Optional"
                className="w-full rounded-[0.625rem] border px-3 py-2.5 text-m-body outline-none" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
              />
            </div>
            <div className="space-y-1">
              <label className="text-m-caption font-medium" style={{ color: "var(--color-ink-600)" }}>
                Longitude
              </label>
              <input
                type="number"
                step="any"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                placeholder="Optional"
                className="w-full rounded-[0.625rem] border px-3 py-2.5 text-m-body outline-none" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-m-caption font-medium" style={{ color: "var(--color-ink-600)" }}>
              Geo-fence radius (m)
            </label>
            <input
              type="number"
              min="0"
              value={geoRadius}
              onChange={(e) => setGeoRadius(e.target.value)}
              placeholder="Default: 500"
              className="w-full rounded-[0.625rem] border px-3 py-2.5 text-m-body outline-none" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-[0.625rem] py-2.5 text-m-body font-semibold press disabled:opacity-50 active:scale-95 transition-transform"
            style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
          >
            {saving ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" /> Saving…
              </span>
            ) : (
              "Save Changes"
            )}
          </button>
        </form>
    </MobileDialog>
  );
}
