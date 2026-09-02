"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BookOpen, Loader2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { GlPreviewPanel } from "@/components/finance/gl-preview-panel";
import type { GlPreviewLine } from "@nirman/services/gl-preview";
import type { LandCostComponentRow } from "@/lib/types";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

const INTERVAL_LABELS: Record<string, string> = {
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  HALF_YEARLY: "Half-Yearly",
  YEARLY: "Yearly",
};

export function LandCostComponentDialog({
  open,
  onOpenChange,
  landPurchaseId,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  landPurchaseId: string;
  editing?: LandCostComponentRow | null;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewLines, setPreviewLines] = useState<GlPreviewLine[]>([]);
  const [form, setForm] = useState({
    label: "",
    amount: "",
    frequency: "ONE_TIME" as "ONE_TIME" | "RECURRING",
    interval: "YEARLY" as "MONTHLY" | "QUARTERLY" | "HALF_YEARLY" | "YEARLY",
    startDate: todayISO(),
    endDate: "",
    occurrences: "",
    notes: "",
  });

  useEffect(() => {
    if (open && editing) {
      setForm({
        label: editing.label,
        amount: String(editing.amount ?? ""),
        frequency: editing.frequency,
        interval: editing.interval ?? "YEARLY",
        startDate: editing.startDate ? editing.startDate.slice(0, 10) : todayISO(),
        endDate: editing.endDate ? editing.endDate.slice(0, 10) : "",
        occurrences: editing.occurrences != null ? String(editing.occurrences) : "",
        notes: editing.notes ?? "",
      });
    } else if (open && !editing) {
      setForm({
        label: "",
        amount: "",
        frequency: "ONE_TIME",
        interval: "YEARLY",
        startDate: todayISO(),
        endDate: "",
        occurrences: "",
        notes: "",
      });
    }
  }, [open, editing]);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function previewGl() {
    const amount = Number(form.amount);
    if (!form.amount || Number.isNaN(amount) || amount <= 0) {
      toast.error("Enter an amount to preview GL impact");
      return;
    }
    setPreviewing(true);
    try {
      const res = await fetch("/api/gl/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "landCostComponent", amount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to preview");
      setPreviewLines(data.lines);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setPreviewing(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.label.trim()) {
      toast.error("Label is required");
      return;
    }
    const amount = Number(form.amount);
    if (!form.amount || Number.isNaN(amount) || amount <= 0) {
      toast.error("Amount must be greater than 0");
      return;
    }
    if (form.frequency === "RECURRING" && !form.interval) {
      toast.error("Interval is required for recurring costs");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        label: form.label.trim(),
        amount,
        frequency: form.frequency,
        interval: form.frequency === "RECURRING" ? form.interval : null,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        occurrences: form.occurrences ? Number(form.occurrences) : null,
        notes: form.notes.trim() || null,
      };
      const res = await fetch(
        editing
          ? `/api/land-purchases/${landPurchaseId}/cost-components/${editing.id}`
          : `/api/land-purchases/${landPurchaseId}/cost-components`,
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save cost component");
      toast.success(editing ? "Cost component updated" : "Cost component added");
      onOpenChange(false);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!editing) return;
    if (!window.confirm(`Delete "${editing.label}"? This reverses its GL entries and reduces the land total.`)) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/land-purchases/${landPurchaseId}/cost-components/${editing.id}`,
        { method: "DELETE" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");
      toast.success("Cost component deleted");
      onOpenChange(false);
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
      onOpenChange={onOpenChange}
      title={editing ? "Edit Cost Component" : "Add Cost Component"}
      description="Add a one-off or recurring cost that accrues into the land's total cost over time."
      className="max-w-lg"
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="lcc-label">Label *</Label>
          <Input
            id="lcc-label"
            value={form.label}
            onChange={(e) => set("label", e.target.value)}
            placeholder="e.g. Yearly Lease Rent, EDC/IDC, Maintenance"
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="lcc-amount">Amount (₹) *</Label>
            <Input
              id="lcc-amount"
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={(e) => set("amount", e.target.value)}
              placeholder="e.g. 500000"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lcc-frequency">Frequency *</Label>
            <Select
              id="lcc-frequency"
              value={form.frequency}
              onChange={(e) => set("frequency", e.target.value as "ONE_TIME" | "RECURRING")}
            >
              <option value="ONE_TIME">One-time</option>
              <option value="RECURRING">Recurring</option>
            </Select>
          </div>
        </div>

        {form.frequency === "RECURRING" && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="lcc-interval">Interval *</Label>
              <Select
                id="lcc-interval"
                value={form.interval}
                onChange={(e) => set("interval", e.target.value as typeof form.interval)}
              >
                {Object.entries(INTERVAL_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lcc-occurrences">Occurrences</Label>
              <Input
                id="lcc-occurrences"
                type="number"
                min="1"
                step="1"
                value={form.occurrences}
                onChange={(e) => set("occurrences", e.target.value)}
                placeholder="Blank = until end date"
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="lcc-startDate">Start Date *</Label>
            <Input
              id="lcc-startDate"
              type="date"
              value={form.startDate}
              onChange={(e) => set("startDate", e.target.value)}
              required
            />
          </div>
          {form.frequency === "RECURRING" && (
            <div className="space-y-1.5">
              <Label htmlFor="lcc-endDate">End Date</Label>
              <Input
                id="lcc-endDate"
                type="date"
                value={form.endDate}
                onChange={(e) => set("endDate", e.target.value)}
                placeholder="Blank = indefinite"
              />
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="lcc-notes">Notes</Label>
          <Textarea
            id="lcc-notes"
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            rows={2}
            placeholder="Optional"
          />
        </div>

        {/* GL Impact Preview — collapsible inline panel before submit */}
        {!editing && previewLines.length > 0 && (
          <GlPreviewPanel
            lines={previewLines}
            title="GL Impact — Land Cost Component"
            description="This journal entry will be posted when you add the cost component."
            defaultOpen
          />
        )}

        <div className="flex justify-between gap-2 pt-2">
          <div>
            {editing && (
              <Button type="button" variant="destructive" onClick={onDelete} disabled={saving}>
                Delete
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            {!editing && (
              <Button
                type="button"
                variant="ghost"
                onClick={previewGl}
                disabled={previewing || saving || !form.amount}
              >
                {previewing ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <BookOpen className="mr-2 h-3.5 w-3.5" />
                )}
                Preview GL
              </Button>
            )}
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : editing ? "Save Changes" : "Add Cost"}
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
