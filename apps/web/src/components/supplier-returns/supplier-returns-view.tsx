"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Undo2, Check, X, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { EditableGrid, type EditableColumn } from "@/components/ui/editable-grid";
import { StatusPill } from "@/components/page";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { SupplierReturnRow, SupplierRow, StockLocationRow, MaterialRow } from "@/lib/types";

export function SupplierReturnsView({
  returns,
  suppliers,
  locations,
  materials,
  permissions,
}: {
  returns: SupplierReturnRow[];
  suppliers: SupplierRow[];
  locations: StockLocationRow[];
  materials: MaterialRow[];
  permissions: { canCreate: boolean; canManage: boolean };
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [detail, setDetail] = useState<SupplierReturnRow | null>(null);
  const canCreate = permissions.canCreate;

  const returnColumns: Column<SupplierReturnRow>[] = [
    { key: "returnNumber", label: "Return No", render: (r) => <span className="font-mono text-caption">{r.returnNumber}</span>, sortValue: (r) => r.returnNumber },
    { key: "returnDate", label: "Date", render: (r) => <span className="tnum text-muted-foreground">{formatDate(r.returnDate)}</span>, sortValue: (r) => r.returnDate },
    { key: "supplierName", label: "Supplier", sortValue: (r) => r.supplierName },
    { key: "locationName", label: "Location", render: (r) => <span className="text-muted-foreground">{r.locationName}</span>, sortValue: (r) => r.locationName },
    { key: "lines", label: "Lines", align: "right", render: (r) => <span className="tnum text-muted-foreground">{r.lines.length}</span>, sortValue: (r) => r.lines.length },
    { key: "status", label: "Status", render: (r) => <StatusPill status={r.status} /> },
    { key: "creditNoteNo", label: "Credit Note", render: (r) => <span className="text-caption text-muted-foreground">{r.creditNoteNo ?? "—"}</span> },
  ];

  return (
    <div className="space-y-4">
      {returns.length === 0 ? (
        <EmptyState
          icon={<Undo2 className="h-5 w-5" />}
          title="No supplier returns"
          description="Returns will appear here once you create one."
          action={
            canCreate && suppliers.length > 0 ? (
              <Button onClick={() => setFormOpen(true)} size="sm">
                <Plus className="h-4 w-4" /> New Supplier Return
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border/60">
          <DataTable
            columns={returnColumns}
            data={returns}
            onRowClick={(r) => setDetail(r)}
            searchable
            searchPlaceholder="Search by return no, supplier…"
            hideable
            pageSize={50}
            onAddRow={canCreate && suppliers.length > 0 && locations.length > 0 ? () => setFormOpen(true) : undefined}
            addRowLabel="New Supplier Return"
          />
        </div>
      )}

      <SupplierReturnFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        suppliers={suppliers}
        locations={locations}
        materials={materials}
      />

      {detail && (
        <SupplierReturnDetailDialog
          ret={detail}
          onOpenChange={(o) => !o && setDetail(null)}
          canManage={permissions.canManage}
        />
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Form Dialog
// ───────────────────────────────────────────────────────────

function SupplierReturnFormDialog({
  open,
  onOpenChange,
  suppliers,
  locations,
  materials,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  suppliers: SupplierRow[];
  locations: StockLocationRow[];
  materials: MaterialRow[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<{ id: string; materialId: string; qty: string; unitCost: string; reason: string }[]>(
    [{ id: crypto.randomUUID(), materialId: "", qty: "", unitCost: "", reason: "" }],
  );

  const materialOptions = useMemo(
    () => materials.map((m) => ({ value: m.id, label: `${m.code} — ${m.name}` })),
    [materials],
  );

  const returnColumns: EditableColumn<typeof lines[number]>[] = useMemo(() => [
    {
      key: "materialId",
      label: "Material",
      type: "select",
      options: materialOptions,
      placeholder: "Select…",
      width: "1fr",
    },
    {
      key: "qty",
      label: "Qty",
      type: "number",
      align: "right",
      step: "any",
      min: 0,
      placeholder: "0",
      width: "90px",
      format: (v) => v ? String(v) : "",
    },
    {
      key: "unitCost",
      label: "Unit Cost (₹)",
      type: "number",
      align: "right",
      step: "any",
      min: 0,
      placeholder: "0",
      width: "110px",
      format: (v) => v ? formatCurrency(Number(v)) : "",
    },
    {
      key: "reason",
      label: "Reason",
      type: "text",
      placeholder: "Defective",
      width: "120px",
    },
    {
      key: "lineTotal",
      label: "Amount",
      type: "computed",
      align: "right",
      compute: (r) => (Number(r.qty) || 0) * (Number(r.unitCost) || 0),
      format: (v) => formatCurrency(v as number),
    },
  ], [materialOptions]);

  function addLine() {
    setLines((ls) => [...ls, { id: crypto.randomUUID(), materialId: "", qty: "", unitCost: "", reason: "" }]);
  }
  function removeLine(id: string) {
    setLines((ls) => ls.filter((l) => l.id !== id));
  }
  function updateLine(id: string, key: "materialId" | "qty" | "unitCost" | "reason", value: string) {
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, [key]: value } : l)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supplierId) return toast.error("Select a supplier");
    if (!locationId) return toast.error("Select a source location");
    const validLines = lines.filter((l) => l.materialId && Number(l.qty) > 0);
    if (validLines.length === 0) return toast.error("Add at least one line");

    setSaving(true);
    try {
      const res = await fetch("/api/supplier-returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId,
          locationId,
          notes: notes.trim() || null,
          lines: validLines.map((l) => ({
            materialId: l.materialId,
            qty: Number(l.qty),
            unitCost: Number(l.unitCost) || 0,
            reason: l.reason.trim() || null,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create return");
      toast.success(`Return ${data.returnNumber} created`);
      onOpenChange(false);
      setSupplierId(""); setLocationId(""); setNotes("");
      setLines([{ id: crypto.randomUUID(), materialId: "", qty: "", unitCost: "", reason: "" }]);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setSupplierId(""); setLocationId(""); setNotes("");
          setLines([{ id: crypto.randomUUID(), materialId: "", qty: "", unitCost: "", reason: "" }]);
        }
      }}
      title="New Supplier Return"
      description="Send materials back to a supplier. Stock leaves the location and a credit note is expected."
      className="max-w-2xl"
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Supplier *</Label>
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Select…</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>From Location *</Label>
            <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">Select…</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Materials to Return</Label>
            <Button type="button" variant="outline" size="sm" onClick={addLine}>
              <Plus className="h-3.5 w-3.5" /> Add Line
            </Button>
          </div>
          <div className="rounded-lg border border-border overflow-hidden">
            <EditableGrid
              rows={lines}
              onChange={setLines}
              columns={returnColumns}
              getRowId={(r) => r.id}
              sumColumns={["qty", "lineTotal"]}
              className="max-h-[40vh]"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Creating…" : "Create Return"}</Button>
        </div>
      </form>
    </Dialog>
  );
}

// ───────────────────────────────────────────────────────────
//  Detail Dialog — with action buttons for submit/complete/cancel
// ───────────────────────────────────────────────────────────

function SupplierReturnDetailDialog({
  ret,
  onOpenChange,
  canManage,
}: {
  ret: SupplierReturnRow;
  onOpenChange: (o: boolean) => void;
  canManage: boolean;
}) {
  const router = useRouter();
  const [acting, setActing] = useState(false);
  const [creditNoteNo, setCreditNoteNo] = useState(ret.creditNoteNo ?? "");

  async function doAction(action: "submit" | "complete" | "cancel") {
    setActing(true);
    try {
      const res = await fetch(`/api/supplier-returns/${ret.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "complete"
            ? { action, creditNoteNo: creditNoteNo.trim() || undefined }
            : { action },
        ),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Action failed");
      toast.success(`${action.charAt(0).toUpperCase() + action.slice(1)} succeeded`);
      onOpenChange(false);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActing(false);
    }
  }

  const totalValue = ret.lines.reduce((s, l) => s + l.qty, 0);

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title={ret.returnNumber}
      description={`${ret.supplierName} · ${ret.locationName} · ${formatDate(ret.returnDate)}`}
      className="max-w-2xl"
    >
      <div className="space-y-4">
        {/* Status + meta */}
        <div className="flex items-center gap-3">
          <StatusPill status={ret.status} />
          {ret.creditNoteNo && (
            <span className="text-body text-muted-foreground">
              Credit Note: <span className="font-mono text-foreground">{ret.creditNoteNo}</span>
            </span>
          )}
        </div>

        {/* Lines */}
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-body">
            <thead>
              <tr className="border-b border-border text-caption text-muted-foreground">
                <th className="px-2 py-1.5 text-left font-medium">Material</th>
                <th className="px-2 py-1.5 text-right font-medium">Qty</th>
                <th className="px-2 py-1.5 text-left font-medium">Reason</th>
              </tr>
            </thead>
            <tbody>
              {ret.lines.map((l) => (
                <tr key={l.id} className="border-b border-border/50">
                  <td className="px-2 py-1.5">
                    {l.materialName}
                    <span className="ml-1 text-caption text-muted-foreground">({l.materialCode})</span>
                  </td>
                  <td className="px-2 py-1.5 text-right tnum">
                    {l.qty} {l.materialUnit}
                  </td>
                  <td className="px-2 py-1.5 text-muted-foreground">{l.reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {ret.notes && (
          <div className="rounded-md bg-muted/40 px-3 py-2 text-body text-muted-foreground">
            {ret.notes}
          </div>
        )}

        {/* Actions */}
        {canManage && ret.status === "DRAFT" && (
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => doAction("cancel")} disabled={acting}>
              <X className="h-4 w-4" /> Cancel Return
            </Button>
            <Button onClick={() => doAction("submit")} disabled={acting}>
              <Send className="h-4 w-4" /> Submit for Processing
            </Button>
          </div>
        )}

        {canManage && ret.status === "SUBMITTED" && (
          <div className="space-y-2">
            <div className="space-y-1.5">
              <Label>Credit Note Number</Label>
              <Input
                value={creditNoteNo}
                onChange={(e) => setCreditNoteNo(e.target.value)}
                placeholder="Enter credit note number from supplier"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => doAction("cancel")} disabled={acting}>
                <X className="h-4 w-4" /> Cancel
              </Button>
              <Button onClick={() => doAction("complete")} disabled={acting}>
                <Check className="h-4 w-4" /> Mark Completed
              </Button>
            </div>
          </div>
        )}

        {ret.status === "COMPLETED" && (
          <div className="flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-body text-green-700">
            <Check className="h-4 w-4" /> Return completed — credit note received.
          </div>
        )}

        {ret.status === "CANCELLED" && (
          <div className="flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-body text-red-700">
            <X className="h-4 w-4" /> This return was cancelled.
          </div>
        )}
      </div>
    </Dialog>
  );
}
