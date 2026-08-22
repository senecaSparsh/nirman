"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, ClipboardCheck, Check, ArrowRight, Loader2, Trash2, ChevronDown, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
import { Dialog } from "@/components/ui/dialog";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EditableGrid, type EditableColumn } from "@/components/ui/editable-grid";
import { SelectWithCreate } from "@/components/ui/select-with-create";
import { LocationFormDialog } from "@/components/materials/location-form-dialog";
import { StatusPill } from "@/components/page";
import { GlPreviewPanel } from "@/components/finance/gl-preview-panel";
import { formatNumber, formatDate } from "@/lib/utils";
import type { GlPreviewLine } from "@nirman/services/gl-preview";
import type { StockCountRow, ProjectOption } from "@/lib/types";

type LocationWithStock = {
  id: string;
  type: string;
  name: string;
  stockItems: { materialId: string; materialCode: string; materialName: string; unit: string; qty: number }[];
};

type CountLine = {
  materialId: string;
  materialCode: string;
  materialName: string;
  unit: string;
  systemQty: number;
  countedQty: string;
};

export function StockCountsView({
  counts,
  locations,
  projects,
  permissions,
}: {
  counts: StockCountRow[];
  locations: LocationWithStock[];
  projects: ProjectOption[];
  permissions: { canCreate?: boolean; canManage?: boolean };
}) {
  const canCreate = permissions?.canCreate ?? false;
  const canManage = permissions?.canManage ?? false;
  const [formOpen, setFormOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<StockCountRow | null>(null);
  const [delTarget, setDelTarget] = useState<StockCountRow | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewLines, setPreviewLines] = useState<GlPreviewLine[]>([]);
  const router = useRouter();

  const filteredCounts = useMemo(
    () => (statusFilter ? counts.filter((c) => c.status === statusFilter) : counts),
    [counts, statusFilter],
  );

  const countColumns: Column<StockCountRow>[] = [
    { key: "countDate", label: "Date", render: (c) => <span className="text-meta">{formatDate(c.countDate)}</span>, sortValue: (c) => c.countDate },
    {
      key: "locationName",
      label: "Location",
      render: (c) => (
        <div>
          <div className="font-medium">{c.locationName}</div>
          <div className="text-caption text-muted-foreground">{c.locationType.replace("_", " ").toLowerCase()}</div>
        </div>
      ),
      sortValue: (c) => c.locationName,
    },
    { key: "status", label: "Status", render: (c) => <StatusPill status={c.status} /> },
    { key: "lineCount", label: "Lines", align: "right", sortValue: (c) => c.lineCount },
    {
      key: "totalVariance",
      label: "Total Variance",
      align: "right",
      render: (c) =>
        c.totalVariance === 0 ? (
          <span className="text-muted-foreground">0</span>
        ) : c.totalVariance > 0 ? (
          <span className="text-success">+{formatNumber(c.totalVariance, 3)}</span>
        ) : (
          <span className="text-danger">{formatNumber(c.totalVariance, 3)}</span>
        ),
      sortValue: (c) => c.totalVariance,
    },
    {
      key: "actions",
      label: "",
      align: "right",
      render: (c) => (
        <div className="flex items-center justify-end gap-1">
          <span className="text-caption text-muted-foreground">View →</span>
          {canManage && c.status === "DRAFT" && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-danger"
              onClick={(e) => { e.stopPropagation(); setDelTarget(c); }}
              title="Delete draft count"
              aria-label="Delete draft count"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  async function doAction(countId: string, action: "confirm" | "reconcile") {
    try {
      const res = await fetch(`/api/stock-counts/${countId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (action === "confirm") {
        toast.success("Count confirmed", {
          description: "Review the variances and reconcile to adjust stock.",
        });
        // Keep detail open so the user can reconcile immediately — re-fetch to show updated status
        const r2 = await fetch(`/api/stock-counts/${countId}`);
        if (r2.ok) {
          const d2 = await r2.json();
          if (!d2.error) {
            // API returns lines array; compute lineCount + totalVariance for StockCountRow
            const lines = d2.lines ?? [];
            setDetailTarget({
              ...d2,
              lineCount: lines.length,
              totalVariance: lines.reduce((s: number, l: { variance: number }) => s + l.variance, 0),
            });
          }
        }
      } else if (action === "reconcile") {
        toast.success("Stock reconciled", {
          description: "Stock quantities updated to match counted values. GL adjustment posted.",
          action: { label: "View GL", onClick: () => router.push("/gl") },
        });
        setDetailTarget(null);
      } else {
        toast.success(`${action} successful`);
        setDetailTarget(null);
      }
      router.refresh();
    } catch (err: unknown) {
      toast.error((err instanceof Error ? err.message : "Action failed"));
    }
  }

  async function previewGl(count: StockCountRow) {
    const lines = (count.lines ?? []).map((l) => ({
      variance: l.variance,
      unitCost: l.unitCost ?? 0,
    }));
    if (lines.length === 0 || lines.every((l) => l.variance === 0)) {
      toast.info("No variances to preview — all counted quantities match system stock.");
      return;
    }
    setPreviewing(true);
    try {
      const res = await fetch("/api/gl/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "stockAdjustment", lines }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to preview");
      setPreviewLines(data.lines);
      setShowPreview(true);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setPreviewing(false);
    }
  }

  // Extract the status filter so it can be used in the DataTable toolbar.
  const statusSelect = (
    <div className="relative shrink-0" style={{ width: 140 }}>
      <select
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value)}
        style={{ width: 140 }}
        className="h-8 shrink-0 appearance-none rounded-md border border-input bg-card pl-2.5 pr-7 text-[13px] text-foreground transition-[border-color,box-shadow] hover:border-border-strong focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/20"
      >
        <option value="">All statuses</option>
        <option value="DRAFT">Draft</option>
        <option value="COUNTED">Counted</option>
        <option value="RECONCILED">Reconciled</option>
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
    </div>
  );

  return (
    <div className="space-y-4">
      {filteredCounts.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck className="h-5 w-5" />}
          title={counts.length === 0 ? "No stock counts yet" : "No counts match the filter"}
          description="Create a stock count to reconcile physical inventory against system quantities."
          action={canCreate ? <Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" /> New Stock Count</Button> : undefined}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border/60">
          <DataTable
            columns={countColumns}
            data={filteredCounts}
            onRowClick={(c) => setDetailTarget(c)}
            searchable
            searchPlaceholder="Search by date, location…"
            hideable
            pageSize={50}
            onAddRow={canCreate ? () => setFormOpen(true) : undefined}
            addRowLabel="New Stock Count"
            toolbarLeading={statusSelect}
          />
        </div>
      )}

      <StockCountFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        locations={locations}
        projects={projects}
      />

      <StockCountDetailDialog
        count={detailTarget}
        onOpenChange={(o) => { if (!o) setDetailTarget(null); }}
        canManage={canManage}
        onAction={doAction}
        onPreviewGl={previewGl}
        previewing={previewing}
      />

      {delTarget && (
        <DeleteConfirmDialog
          open={delTarget !== null}
          onOpenChange={(o) => { if (!o) setDelTarget(null); }}
          endpoint={`/api/stock-counts/${delTarget.id}`}
          title="Delete draft stock count"
          description={`Delete the draft stock count for ${delTarget.locationName}? Only draft counts can be deleted.`}
          successMessage="Stock count deleted"
          onSuccess={() => { setDelTarget(null); }}
        />
      )}

      {showPreview && previewLines.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 w-96 max-w-[calc(100vw-2rem)]">
          <GlPreviewPanel
            lines={previewLines}
            title="GL Impact — Stock Reconciliation"
            description="These journal entries will be posted when you reconcile the stock count."
            defaultOpen
          />
        </div>
      )}
    </div>
  );
}

function StockCountFormDialog({
  open,
  onOpenChange,
  locations,
  projects,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  locations: LocationWithStock[];
  projects: ProjectOption[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [locationId, setLocationId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<CountLine[]>([]);
  // Local copy so freshly created locations appear in the dropdown without
  // waiting for router.refresh.
  const [localLocations, setLocalLocations] = useState(locations);
  useEffect(() => { setLocalLocations(locations); }, [locations]);

  const selectedLocation = localLocations.find((l) => l.id === locationId);

  // Rebuild lines when location changes
  useEffect(() => {
    if (selectedLocation) {
      setLines(
        selectedLocation.stockItems.map((item) => ({
          materialId: item.materialId,
          materialCode: item.materialCode,
          materialName: item.materialName,
          unit: item.unit,
          systemQty: item.qty,
          countedQty: "",
        })),
      );
    } else {
      setLines([]);
    }
  }, [locationId]); // eslint-disable-line react-hooks/exhaustive-deps

  const countColumns: EditableColumn<CountLine>[] = useMemo(() => [
    {
      key: "materialName",
      label: "Material",
      type: "readonly",
      width: "1fr",
    },
    {
      key: "systemQty",
      label: "System Qty",
      type: "readonly",
      align: "right",
      format: (v) => formatNumber(v as number, 3),
    },
    {
      key: "countedQty",
      label: "Counted Qty",
      type: "number",
      align: "right",
      step: "0.001",
      min: 0,
      placeholder: "—",
      width: "120px",
      format: (v) => v ? String(v) : "",
    },
    {
      key: "variance",
      label: "Variance",
      type: "computed",
      align: "right",
      compute: (r) => {
        const counted = Number(r.countedQty);
        if (!r.countedQty || isNaN(counted)) return 0;
        return counted - r.systemQty;
      },
      format: (v) => {
        const n = v as number;
        if (n === 0) return "—";
        return n > 0 ? `+${formatNumber(n, 3)}` : formatNumber(n, 3);
      },
    },
  ], []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!locationId) {
      toast.error("Select a location");
      return;
    }
    const lineEntries = lines.filter((l) => l.countedQty.trim() !== "");
    if (lineEntries.length === 0) {
      toast.error("Enter at least one counted quantity");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/stock-counts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId,
          notes: notes.trim() || null,
          lines: lineEntries.map((l) => ({ materialId: l.materialId, countedQty: Number(l.countedQty) })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create stock count");
      toast.success("Stock count created", {
        description: "Review the counted quantities, then confirm to lock them in.",
      });
      onOpenChange(false);
      setLocationId("");
      setNotes("");
      setLines([]);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => { onOpenChange(o); if (!o) { setLocationId(""); setNotes(""); setLines([]); } }}
      title="New Stock Count"
      description="Count the physical stock at a location. System quantities are snapshotted for variance comparison."
      className="max-w-3xl"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Location</Label>
            <SelectWithCreate
              value={locationId}
              onChange={setLocationId}
              placeholder="Select location…"
              createLabel="location"
              options={localLocations.map((l) => ({ value: l.id, label: `${l.name} (${l.type.replace("_", " ").toLowerCase()})` }))}
              renderCreateDialog={({ open: o, onCreated, onClose }) => (
                <LocationFormDialog open={o} onOpenChange={onClose} projects={projects} location={null} onCreated={(e) => { setLocalLocations((p) => [...p, { id: e.id, type: "COMPANY_WAREHOUSE", name: e.label ?? "", stockItems: [] }]); onCreated(e); }} />
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Notes (optional)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Quarterly audit" />
          </div>
        </div>

        {selectedLocation && (
          lines.length > 0 ? (
            <div className="rounded-lg border border-border overflow-hidden">
              <EditableGrid
                rows={lines}
                onChange={setLines}
                columns={countColumns}
                getRowId={(r) => r.materialId}
                className="max-h-[45vh]"
              />
            </div>
          ) : (
            <div className="rounded-lg border border-border p-4 text-center text-muted-foreground">
              No stock at this location
            </div>
          )
        )}

        <p className="text-meta text-muted-foreground">
          Leave a row blank to keep the system quantity as the counted value. Variances are calculated on confirm/reconcile.
        </p>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={saving || !locationId}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
            Create Count
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function StockCountDetailDialog({
  count,
  onOpenChange,
  canManage,
  onAction,
  onPreviewGl,
  previewing,
}: {
  count: StockCountRow | null;
  onOpenChange: (o: boolean) => void;
  canManage: boolean;
  onAction: (id: string, action: "confirm" | "reconcile") => void;
  onPreviewGl: (count: StockCountRow) => void;
  previewing: boolean;
}) {
  if (!count) return null;

  return (
    <Dialog
      open={!!count}
      onOpenChange={onOpenChange}
      title={`Stock Count · ${count.locationName}`}
      description={`${formatDate(count.countDate)} · ${count.status}`}
      className="max-w-3xl"
    >
      <div className="space-y-4">
        {/* Status + actions */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <StatusPill status={count.status} />
          <div className="flex gap-2">
            {canManage && count.status === "DRAFT" && (
              <Button size="sm" onClick={() => onAction(count.id, "confirm")}>
                <Check className="h-4 w-4" /> Confirm Count
              </Button>
            )}
            {canManage && count.status === "COUNTED" && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onPreviewGl(count)}
                  disabled={previewing}
                >
                  {previewing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <BookOpen className="h-4 w-4" />
                  )}
                  Preview GL
                </Button>
                <Button size="sm" onClick={() => onAction(count.id, "reconcile")}>
                  <ArrowRight className="h-4 w-4" /> Reconcile
                </Button>
              </>
            )}
          </div>
        </div>

        {count.notes && (
          <p className="text-body text-muted-foreground rounded-md bg-muted/30 p-3">{count.notes}</p>
        )}

        {/* Lines table */}
        <div className="rounded-lg border border-border/60">
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>Material</TH>
                <TH className="text-right">System</TH>
                <TH className="text-right">Counted</TH>
                <TH className="text-right">Variance</TH>
              </TR>
            </THead>
            <TBody>
              {count.lines.map((l) => (
                <TR key={l.id}>
                  <TD>
                    <div className="font-medium">{l.materialName}</div>
                    <div className="font-mono text-caption text-muted-foreground">{l.materialCode} · {l.unit}</div>
                  </TD>
                  <TD className="tnum text-right">{formatNumber(l.systemQty, 3)}</TD>
                  <TD className="tnum text-right">{formatNumber(l.countedQty, 3)}</TD>
                  <TD className="tnum text-right">
                    {l.variance === 0 ? (
                      <span className="text-muted-foreground">0</span>
                    ) : l.variance > 0 ? (
                      <span className="text-success">+{formatNumber(l.variance, 3)}</span>
                    ) : (
                      <span className="text-danger">{formatNumber(l.variance, 3)}</span>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>

        {count.status === "COUNTED" && (
          <p className="text-meta text-muted-foreground">
            Reconciling will apply <strong>ADJUSTMENT_IN/OUT</strong> stock movements for each variance and post them to the stock ledger. This cannot be undone.
          </p>
        )}
      </div>
    </Dialog>
  );
}
