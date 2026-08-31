"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {Input, Select} from "@/components/ui/input";
import { Field } from "@/components/field";
import {Plus, AlertTriangle, Package} from "lucide-react";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";
import type { MaterialRow } from "@/lib/types";

type LotRow = {
  id: string;
  lotNumber: string;
  batchCode: string | null;
  receivedDate: string;
  expiryDate: string | null;
  initialQty: number;
  currentQty: number;
  unitCost: number;
  supplierId: string | null;
  supplierName: string | null;
  notes: string | null;
  movementCount: number;
};

export function LotTrackingDialog({
  open,
  onOpenChange,
  material,
  suppliers,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  material: MaterialRow | null;
  suppliers: { id: string; name: string }[];
}) {
  const [lots, setLots] = useState<LotRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    lotNumber: "",
    batchCode: "",
    receivedDate: new Date().toISOString().slice(0, 10),
    expiryDate: "",
    initialQty: "",
    unitCost: "",
    supplierId: "",
    notes: "",
  });

  const fetchLots = useCallback(async () => {
    if (!material) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/materials/${material.id}/lots`);
      if (!res.ok) throw new Error("Failed to fetch lots");
      const data = await res.json();
      setLots(data.lots ?? []);
    } catch {
      toast.error("Failed to load lots");
    } finally {
      setLoading(false);
    }
  }, [material]);

  useEffect(() => {
    if (open && material) {
      fetchLots();
      setShowForm(false);
    }
  }, [open, material, fetchLots]);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!material) return;
    if (!form.lotNumber.trim() || !form.initialQty) {
      toast.error("Lot number and initial quantity are required");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        lotNumber: form.lotNumber.trim(),
        receivedDate: new Date(form.receivedDate).toISOString(),
        initialQty: Number(form.initialQty),
        unitCost: form.unitCost ? Number(form.unitCost) : 0,
      };
      if (form.batchCode.trim()) payload.batchCode = form.batchCode.trim();
      if (form.expiryDate) payload.expiryDate = new Date(form.expiryDate).toISOString();
      if (form.supplierId) payload.supplierId = form.supplierId;
      if (form.notes.trim()) payload.notes = form.notes.trim();

      const res = await fetch(`/api/materials/${material.id}/lots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to create lot");
      }
      toast.success(`Lot ${form.lotNumber} created`);
      setForm({
        lotNumber: "",
        batchCode: "",
        receivedDate: new Date().toISOString().slice(0, 10),
        expiryDate: "",
        initialQty: "",
        unitCost: "",
        supplierId: "",
        notes: "",
      });
      setShowForm(false);
      fetchLots();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create lot");
    } finally {
      setSaving(false);
    }
  }

  const [now] = useState(() => Date.now());
  const { expiredLots, expiringSoon } = useMemo(() => {
    const expired = lots.filter((l) => l.expiryDate && new Date(l.expiryDate).getTime() < now && l.currentQty > 0);
    const soon = lots.filter((l) => {
      if (!l.expiryDate || l.currentQty <= 0) return false;
      const days = Math.ceil((new Date(l.expiryDate).getTime() - now) / (1000 * 60 * 60 * 24));
      return days >= 0 && days <= 30;
    });
    return { expiredLots: expired, expiringSoon: soon };
  }, [lots, now]);

  if (!material) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`Lots — ${material.code}`} description={`${material.name} · ${material.unit}`}>
      <div className="space-y-4">
        {/* Alerts */}
        {(expiredLots.length > 0 || expiringSoon.length > 0) && (
          <div className="space-y-1.5">
            {expiredLots.length > 0 && (
              <div className="flex items-center gap-2 rounded-lg bg-danger/10 p-2 text-body text-danger">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{expiredLots.length} lot{expiredLots.length !== 1 ? "s" : ""} expired with stock remaining</span>
              </div>
            )}
            {expiringSoon.length > 0 && (
              <div className="flex items-center gap-2 rounded-lg bg-warning/10 p-2 text-body text-warning">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{expiringSoon.length} lot{expiringSoon.length !== 1 ? "s" : ""} expiring within 30 days</span>
              </div>
            )}
          </div>
        )}

        {/* Add lot button / form */}
        {material.isLotTracked && (
          <>
            {!showForm ? (
              <Button size="sm" onClick={() => setShowForm(true)}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Add Lot
              </Button>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-border p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Lot Number" required>
                    <Input value={form.lotNumber} onChange={(e) => set("lotNumber", e.target.value)} placeholder="LOT-001" required />
                  </Field>
                  <Field label="Batch Code">
                    <Input value={form.batchCode} onChange={(e) => set("batchCode", e.target.value)} placeholder="Optional" />
                  </Field>
                  <Field label="Received Date" required>
                    <Input type="date" value={form.receivedDate} onChange={(e) => set("receivedDate", e.target.value)} required />
                  </Field>
                  <Field label="Expiry Date">
                    <Input type="date" value={form.expiryDate} onChange={(e) => set("expiryDate", e.target.value)} />
                  </Field>
                  <Field label="Initial Quantity" required>
                    <Input type="number" step="0.001" min="0" value={form.initialQty} onChange={(e) => set("initialQty", e.target.value)} placeholder="0" required />
                  </Field>
                  <Field label="Unit Cost">
                    <Input type="number" step="0.01" min="0" value={form.unitCost} onChange={(e) => set("unitCost", e.target.value)} placeholder="0.00" />
                  </Field>
                  <Field label="Supplier">
                    <Select value={form.supplierId} onChange={(e) => set("supplierId", e.target.value)}>
                      <option value="">— None —</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Notes">
                    <Input value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Optional" />
                  </Field>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
                  <Button type="submit" size="sm" disabled={saving}>{saving ? "Saving…" : "Create Lot"}</Button>
                </div>
              </form>
            )}
          </>
        )}

        {/* Lots table */}
        {loading ? (
          <p className="text-center text-body text-muted-foreground py-4">Loading lots…</p>
        ) : lots.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <Package className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-2 font-medium">No lots recorded</p>
            <p className="text-sm text-muted-foreground">
              {material.isLotTracked ? "Create a lot to start tracking batches." : "This material is not lot-tracked."}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Lot #</th>
                  <th className="text-left px-3 py-2 font-semibold">Batch</th>
                  <th className="text-left px-3 py-2 font-semibold">Received</th>
                  <th className="text-left px-3 py-2 font-semibold">Expiry</th>
                  <th className="text-right px-3 py-2 font-semibold">Initial</th>
                  <th className="text-right px-3 py-2 font-semibold">Current</th>
                  <th className="text-right px-3 py-2 font-semibold">Unit Cost</th>
                  <th className="text-left px-3 py-2 font-semibold">Supplier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lots.map((lot) => {
                  const isExpired = lot.expiryDate && new Date(lot.expiryDate).getTime() < now && lot.currentQty > 0;
                  const isExpiringSoon = lot.expiryDate && !isExpired && lot.currentQty > 0 &&
                    Math.ceil((new Date(lot.expiryDate).getTime() - now) / (1000 * 60 * 60 * 24)) <= 30;
                  return (
                    <tr key={lot.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2 font-mono text-caption font-medium">
                        {lot.lotNumber}
                        {lot.movementCount > 0 && (
                          <span className="ml-1 text-micro text-muted-foreground">({lot.movementCount} mvts)</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground text-caption">{lot.batchCode ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground text-caption">{formatDate(lot.receivedDate)}</td>
                      <td className="px-3 py-2 text-caption">
                        {lot.expiryDate ? (
                          <span className={isExpired ? "text-danger font-medium" : isExpiringSoon ? "text-warning font-medium" : "text-muted-foreground"}>
                            {formatDate(lot.expiryDate)}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tnum text-muted-foreground">{formatNumber(lot.initialQty, 3)}</td>
                      <td className="px-3 py-2 text-right tnum font-medium">
                        {formatNumber(lot.currentQty, 3)}
                        {lot.currentQty <= 0 && <span className="ml-1 text-micro text-muted-foreground">depleted</span>}
                      </td>
                      <td className="px-3 py-2 text-right tnum text-muted-foreground">{formatCurrency(lot.unitCost)}</td>
                      <td className="px-3 py-2 text-caption text-muted-foreground">{lot.supplierName ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Dialog>
  );
}
