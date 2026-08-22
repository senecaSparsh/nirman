"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export type SaleTermRow = {
  description: string;
  extraAmount: string;
  isIncluded: boolean;
};

export function SaleTermsEditor({
  terms,
  onChange,
}: {
  terms: SaleTermRow[];
  onChange: (terms: SaleTermRow[]) => void;
}) {
  function update(index: number, field: keyof SaleTermRow, value: string | boolean) {
    const next = [...terms];
    next[index] = { ...next[index]!, [field]: value };
    onChange(next);
  }

  function addRow() {
    onChange([...terms, { description: "", extraAmount: "", isIncluded: true }]);
  }

  function removeRow(index: number) {
    onChange(terms.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Terms &amp; Conditions</Label>
        <Button type="button" variant="ghost" size="sm" onClick={addRow}>
          <Plus className="h-3.5 w-3.5" /> Add Condition
        </Button>
      </div>
      {terms.length === 0 && (
        <p className="text-caption text-muted-foreground">
          No custom conditions. Add conditions like &quot;Fire NOC to be obtained by seller&quot; or &quot;Airport Authority NOC ₹5L extra&quot;.
        </p>
      )}
      <div className="space-y-2">
        {terms.map((term, i) => (
          <div key={i} className="space-y-1.5 rounded-md border border-border p-2">
            <div className="flex items-start gap-2">
              <Textarea
                value={term.description}
                onChange={(e) => update(i, "description", e.target.value)}
                placeholder="e.g. Fire NOC to be obtained by seller before possession"
                rows={2}
                className="text-sm"
              />
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="text-muted-foreground hover:text-danger mt-1"
                aria-label="Remove condition"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Extra charge (optional)"
                  value={term.extraAmount}
                  onChange={(e) => update(i, "extraAmount", e.target.value)}
                  className="text-sm tnum"
                />
              </div>
              <label className="flex items-center gap-1.5 text-caption text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={term.isIncluded}
                  onChange={(e) => update(i, "isIncluded", e.target.checked)}
                  className="rounded"
                />
                {term.isIncluded ? "Included in deal" : "Extra on top"}
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
