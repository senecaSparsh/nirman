"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Label } from "@/components/ui/input";
import { formatCurrency, cn } from "@/lib/utils";

export type SaleExpenseRow = {
  head: "REGISTRY" | "STAMP_DUTY" | "TRANSFER" | "LEASE_RENT" | "GST" | "OTHER";
  label?: string | null;
  amount: string;
  borneBy: "CLIENT" | "SELLER" | "NA";
  isIncluded: boolean;
};

const EXPENSE_HEADS: { value: SaleExpenseRow["head"]; label: string }[] = [
  { value: "REGISTRY", label: "Registry Amount" },
  { value: "STAMP_DUTY", label: "Stamp Duty" },
  { value: "TRANSFER", label: "Transfer Amount" },
  { value: "LEASE_RENT", label: "Lease Rent" },
  { value: "GST", label: "GST" },
  { value: "OTHER", label: "Other" },
];

const DEFAULT_EXPENSES: SaleExpenseRow[] = EXPENSE_HEADS.slice(0, 5).map((h) => ({
  head: h.value,
  label: h.label,
  amount: "",
  borneBy: "NA",
  isIncluded: false,
}));

export function SaleExpenseGrid({
  expenses,
  onChange,
}: {
  expenses: SaleExpenseRow[];
  onChange: (expenses: SaleExpenseRow[]) => void;
}) {
  const rows = expenses.length > 0 ? expenses : DEFAULT_EXPENSES;

  function update(index: number, field: keyof SaleExpenseRow, value: string | boolean | null) {
    const next = [...rows];
    next[index] = { ...next[index]!, [field]: value };
    onChange(next);
  }

  function addRow() {
    onChange([
      ...rows,
      { head: "OTHER", label: "", amount: "", borneBy: "NA", isIncluded: false },
    ]);
  }

  function removeRow(index: number) {
    onChange(rows.filter((_, i) => i !== index));
  }

  const totalSellerBorne = rows.reduce(
    (sum, r) => sum + (r.borneBy === "SELLER" ? Number(r.amount) || 0 : 0),
    0,
  );
  const totalClientBorne = rows.reduce(
    (sum, r) => sum + (r.borneBy === "CLIENT" ? Number(r.amount) || 0 : 0),
    0,
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Expense Heads</Label>
        <Button type="button" variant="ghost" size="sm" onClick={addRow}>
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </div>
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-[1fr_100px_90px_24px] gap-2 items-center">
            <div className="space-y-0">
              <Select
                value={row.head}
                onChange={(e) => {
                  const head = e.target.value as SaleExpenseRow["head"];
                  const headMeta = EXPENSE_HEADS.find((h) => h.value === head);
                  update(i, "head", head);
                  update(i, "label", headMeta?.label ?? "");
                }}
                className="text-sm"
              >
                {EXPENSE_HEADS.map((h) => (
                  <option key={h.value} value={h.value}>{h.label}</option>
                ))}
              </Select>
              {row.head === "OTHER" && (
                <Input
                  className="mt-1 text-sm"
                  placeholder="Custom label (e.g. Fire NOC)"
                  value={row.label ?? ""}
                  onChange={(e) => update(i, "label", e.target.value)}
                />
              )}
            </div>
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="Amount"
              value={row.amount}
              onChange={(e) => update(i, "amount", e.target.value)}
              className="text-sm tnum"
            />
            <Select
              value={row.borneBy}
              onChange={(e) => update(i, "borneBy", e.target.value as SaleExpenseRow["borneBy"])}
              className="text-sm"
            >
              <option value="NA">N/A</option>
              <option value="CLIENT">Client</option>
              <option value="SELLER">Seller</option>
            </Select>
            <button
              type="button"
              onClick={() => removeRow(i)}
              className="text-muted-foreground hover:text-danger"
              aria-label="Remove expense"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      {(totalSellerBorne > 0 || totalClientBorne > 0) && (
        <div className="flex justify-between text-caption text-muted-foreground border-t pt-2">
          <span>Seller bears: <span className="tnum text-foreground">{formatCurrency(totalSellerBorne)}</span></span>
          <span>Client bears: <span className="tnum text-foreground">{formatCurrency(totalClientBorne)}</span></span>
        </div>
      )}
    </div>
  );
}
