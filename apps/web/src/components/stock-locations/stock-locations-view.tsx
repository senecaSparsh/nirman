"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Plus, Pencil, Trash2, Warehouse, Building2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, Select } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { DataTable } from "@/components/ui/data-table";
import { IdentityCell, MoneyCell, QtyCell } from "@/components/ui/cells";
import { formatCurrency } from "@/lib/utils";

export type StockLocationRow = {
  id: string;
  type: "CENTRAL_WAREHOUSE" | "COMPANY_WAREHOUSE" | "PROJECT_SITE" | "DEPARTMENT";
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

export type ProjectOption = { id: string; name: string };

const TYPE_LABELS: Record<StockLocationRow["type"], string> = {
  CENTRAL_WAREHOUSE: "Central Warehouse",
  COMPANY_WAREHOUSE: "Warehouse",
  PROJECT_SITE: "Project Site",
  DEPARTMENT: "Department",
};

const TYPE_ICONS: Record<StockLocationRow["type"], typeof Warehouse> = {
  CENTRAL_WAREHOUSE: Warehouse,
  COMPANY_WAREHOUSE: Warehouse,
  PROJECT_SITE: MapPin,
  DEPARTMENT: Building2,
};

export function StockLocationsView({
  locations,
  projects,
  permissions,
}: {
  locations: StockLocationRow[];
  projects: ProjectOption[];
  permissions?: { canManage?: boolean };
}) {
  const router = useRouter();
  const canManage = permissions?.canManage ?? false;
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<StockLocationRow | null>(null);
  const [delTarget, setDelTarget] = useState<StockLocationRow | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [fType, setFType] = useState<StockLocationRow["type"]>("COMPANY_WAREHOUSE");
  const [fName, setFName] = useState("");
  const [fProjectId, setFProjectId] = useState("");
  const [fAddress, setFAddress] = useState("");
  const [fLat, setFLat] = useState("");
  const [fLng, setFLng] = useState("");
  const [fGeoRadius, setFGeoRadius] = useState("");

  function openCreate() {
    setEditTarget(null);
    setFType("COMPANY_WAREHOUSE");
    setFName("");
    setFProjectId("");
    setFAddress("");
    setFLat("");
    setFLng("");
    setFGeoRadius("");
    setFormOpen(true);
  }

  function openEdit(l: StockLocationRow) {
    setEditTarget(l);
    setFType(l.type);
    setFName(l.name);
    setFProjectId(l.projectId ?? "");
    setFAddress(l.address ?? "");
    setFLat(l.lat != null ? String(l.lat) : "");
    setFLng(l.lng != null ? String(l.lng) : "");
    setFGeoRadius(l.geoRadius != null ? String(l.geoRadius) : "");
    setFormOpen(true);
  }

  async function submit() {
    if (!fName.trim()) return toast.error("Name is required");
    if (fType === "PROJECT_SITE" && !fProjectId) return toast.error("A project site must be linked to a project");
    setSubmitting(true);
    try {
      const payload = {
        type: fType,
        name: fName.trim(),
        projectId: fType === "PROJECT_SITE" ? fProjectId : null,
        address: fAddress.trim() || null,
        lat: fLat ? parseFloat(fLat) : null,
        lng: fLng ? parseFloat(fLng) : null,
        geoRadius: fGeoRadius ? parseInt(fGeoRadius) : null,
      };
      const res = editTarget
        ? await fetch(`/api/stock-locations/${editTarget.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch("/api/stock-locations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save location");
      toast.success(editTarget ? "Location updated" : "Location created");
      setFormOpen(false);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {locations.length === 0 ? (
        <EmptyState
          icon={<MapPin />}
          title="No stock locations"
          description="Stock locations are where material is received, stored and issued from. Add a warehouse or project site to start tracking inventory."
          action={
            canManage ? (
              <Button onClick={openCreate}>
                <Plus className="size-4" /> New Location
              </Button>
            ) : undefined
          }
          contactHint="Ask an inventory manager to create the first location."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
          <DataTable
            data={locations}
            storageKey="stock-locations"
            searchable
            searchPlaceholder="Search name, type, address…"
            hideable
            freezeFirstColumn
            exportFileName="stock-locations"
            columnDividers
            initialSort={{ key: "name", direction: "asc" }}
            onAddRow={canManage ? openCreate : undefined}
            addRowLabel="New Location"
            showTotals
            sumColumns={["itemCount", "stockValue"]}
            totalFormat={(key, sum) =>
              key === "itemCount"
                ? sum.toLocaleString("en-IN")
                : formatCurrency(sum)
            }
            rowActions={
              canManage
                ? (l) => (
                    <>
                      <Button variant="ghost" size="icon-sm" title="Edit location" onClick={() => openEdit(l)}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Delete location"
                        className="hover:text-danger"
                        onClick={() => setDelTarget(l)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </>
                  )
                : undefined
            }
            columns={[
              {
                key: "name",
                label: "Location",
                sortable: true,
                width: "260px",
                render: (l) => {
                  const Icon = TYPE_ICONS[l.type] ?? MapPin;
                  return (
                    <IdentityCell
                      name={l.name}
                      sub={`${TYPE_LABELS[l.type]}${l.projectName ? ` · ${l.projectName}` : ""}`}
                      icon={<Icon />}
                    />
                  );
                },
              },
              {
                key: "type",
                label: "Type",
                sortable: true,
                render: (l) => (
                  <span className="text-caption font-medium text-muted-foreground">
                    {TYPE_LABELS[l.type]}
                  </span>
                ),
                exportValue: (l) => TYPE_LABELS[l.type],
              },
              {
                key: "address",
                label: "Address",
                defaultHidden: true,
                render: (l) => l.address ?? <span className="text-faint">—</span>,
                exportValue: (l) => l.address ?? "",
              },
              {
                key: "projectName",
                label: "Project",
                sortable: true,
                render: (l) =>
                  l.projectName ?? <span className="text-faint">—</span>,
                exportValue: (l) => l.projectName ?? "",
              },
              {
                key: "geo",
                label: "Geo-fence",
                align: "right",
                hint: "GPS coordinates and geo-fence radius for validating field receipts.",
                render: (l) =>
                  l.lat != null && l.lng != null ? (
                    <span className="text-caption tnum text-muted-foreground">
                      {l.lat.toFixed(4)}, {l.lng.toFixed(4)}
                      {l.geoRadius != null ? ` · ${l.geoRadius}m` : ""}
                    </span>
                  ) : (
                    <span className="text-faint">—</span>
                  ),
                exportValue: (l) =>
                  l.lat != null && l.lng != null
                    ? `${l.lat}, ${l.lng}${l.geoRadius != null ? `, r=${l.geoRadius}m` : ""}`
                    : "",
              },
              {
                key: "itemCount",
                label: "Items",
                align: "right",
                sortable: true,
                hint: "Number of distinct materials currently held at this location.",
                render: (l) =>
                  l.itemCount > 0 ? (
                    <QtyCell value={l.itemCount} />
                  ) : (
                    <span className="text-faint">—</span>
                  ),
                exportValue: (l) => l.itemCount,
              },
              {
                key: "stockValue",
                label: "Stock Value",
                align: "right",
                sortable: true,
                bar: true,
                hint: "Total value of on-hand stock at this location, valued at moving average cost.",
                render: (l) => (
                  <MoneyCell value={l.stockValue} formatted={formatCurrency(l.stockValue)} neutral />
                ),
                exportValue: (l) => l.stockValue,
              },
            ]}
          />
        </div>
      )}

      {/* Create/Edit dialog */}
      <Dialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editTarget ? "Edit Location" : "New Stock Location"}
        description="Where material is received, stored and issued from. Project sites must be linked to a project."
      >
        <div className="space-y-3">
          <div>
            <Label required>Type</Label>
            <Select value={fType} onChange={(e) => setFType(e.target.value as StockLocationRow["type"])} disabled={!!editTarget}>
              <option value="COMPANY_WAREHOUSE">Company Warehouse</option>
              <option value="CENTRAL_WAREHOUSE">Central Warehouse</option>
              <option value="PROJECT_SITE">Project Site</option>
              <option value="DEPARTMENT">Department</option>
            </Select>
          </div>
          <div>
            <Label required>Name</Label>
            <Input value={fName} onChange={(e) => setFName(e.target.value)} placeholder="e.g. Main Warehouse, Site Store" />
          </div>
          {fType === "PROJECT_SITE" && (
            <div>
              <Label required>Project</Label>
              <Select value={fProjectId} onChange={(e) => setFProjectId(e.target.value)}>
                <option value="">Select project…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </div>
          )}
          <div>
            <Label>Address</Label>
            <Textarea value={fAddress} onChange={(e) => setFAddress(e.target.value)} rows={2} placeholder="Optional" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Latitude</Label>
              <Input type="number" step="any" value={fLat} onChange={(e) => setFLat(e.target.value)} placeholder="Optional" />
            </div>
            <div>
              <Label>Longitude</Label>
              <Input type="number" step="any" value={fLng} onChange={(e) => setFLng(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <div>
            <Label hint="Default: 500m">Geo-fence radius (m)</Label>
            <Input type="number" min="10" value={fGeoRadius} onChange={(e) => setFGeoRadius(e.target.value)} placeholder="500" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={submitting}>
              {submitting ? "Saving…" : editTarget ? "Save Changes" : "Create Location"}
            </Button>
          </div>
        </div>
      </Dialog>

      {delTarget && (
        <DeleteConfirmDialog
          open={delTarget !== null}
          onOpenChange={(o) => { if (!o) setDelTarget(null); }}
          endpoint={`/api/stock-locations/${delTarget.id}`}
          title="Delete location"
          description={`Delete "${delTarget.name}"? Locations with stock items cannot be deleted.`}
          successMessage="Location deleted"
          onSuccess={() => { setDelTarget(null); }}
        />
      )}
    </div>
  );
}
