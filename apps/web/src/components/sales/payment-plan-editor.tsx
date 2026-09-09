"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, CalendarClock, Wand2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Label } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";

export type PaymentPlanItem = {
  installmentNo: number;
  description: string;
  percentage: string;
  amount: string;
  dueDate: string;
  wbsNodeId?: string;
};

type WbsNodeOption = {
  id: string;
  code: string;
  name: string;
  type: string;
  progressPct: number;
};

export function PaymentPlanEditor({
  items,
  onChange,
  scheduleType,
  onScheduleTypeChange,
  salePrice,
  gstAmount,
  advanceAmount,
  dealMaturityMonths,
  projectId,
}: {
  items: PaymentPlanItem[];
  onChange: (items: PaymentPlanItem[]) => void;
  scheduleType: "TLP" | "DPP" | "CLP";
  onScheduleTypeChange: (type: "TLP" | "DPP" | "CLP") => void;
  salePrice: number;
  gstAmount: number;
  advanceAmount: number;
  dealMaturityMonths: number;
  projectId?: string;
}) {
  const totalCollectible = salePrice + gstAmount;
  const [wbsNodes, setWbsNodes] = useState<WbsNodeOption[]>([]);
  const [loadingWbs, setLoadingWbs] = useState(false);

  // Fetch WBS milestone nodes when CLP is selected and we have a project
  useEffect(() => {
    if (scheduleType !== "CLP" || !projectId) {
      setWbsNodes([]);
      return;
    }
    setLoadingWbs(true);
    fetch(`/api/wbs/nodes?projectId=${encodeURIComponent(projectId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          // Flatten the tree and pick milestone-type nodes (or all leaf nodes)
          const flat: WbsNodeOption[] = [];
          function walk(nodes: WbsNodeOption[]) {
            for (const n of nodes) {
              if (n.type === "MILESTONE" || n.type === "ACTIVITY") {
                flat.push(n);
              }
            }
          }
          walk(data);
          setWbsNodes(flat.length > 0 ? flat : data);
        }
      })
      .catch(() => setWbsNodes([]))
      .finally(() => setLoadingWbs(false));
  }, [scheduleType, projectId]);

  function update(index: number, field: keyof PaymentPlanItem, value: string) {
    const next = [...items];
    next[index] = { ...next[index]!, [field]: value };
    // Auto-renumber
    next.forEach((item, i) => { item.installmentNo = i + 1; });
    onChange(next);
  }

  function addRow() {
    onChange([
      ...items,
      {
        installmentNo: items.length + 1,
        description: "",
        percentage: "",
        amount: "",
        dueDate: "",
        wbsNodeId: "",
      },
    ]);
  }

  function removeRow(index: number) {
    const next = items.filter((_, i) => i !== index);
    next.forEach((item, i) => { item.installmentNo = i + 1; });
    onChange(next);
  }

  function autoGenerate() {
    if (totalCollectible <= 0) return;

    if (scheduleType === "CLP" && wbsNodes.length > 0) {
      // CLP: generate one installment per WBS milestone, evenly distributed
      const balance = totalCollectible - advanceAmount;
      if (balance <= 0) return;
      const newItems: PaymentPlanItem[] = [];

      if (advanceAmount > 0) {
        newItems.push({
          installmentNo: 1,
          description: "Booking Advance",
          percentage: ((advanceAmount / totalCollectible) * 100).toFixed(2),
          amount: advanceAmount.toFixed(2),
          dueDate: new Date().toISOString().split("T")[0]!,
          wbsNodeId: "",
        });
      }

      const milestoneNodes = wbsNodes.filter((n) => n.type === "MILESTONE");
      const nodes = milestoneNodes.length > 0 ? milestoneNodes : wbsNodes;
      const perInstallment = balance / nodes.length;
      const perPct = (perInstallment / totalCollectible) * 100;
      const startNo = advanceAmount > 0 ? 2 : 1;

      nodes.forEach((node, i) => {
        newItems.push({
          installmentNo: startNo + i,
          description: `${node.code} — ${node.name}`,
          percentage: perPct.toFixed(2),
          amount: perInstallment.toFixed(2),
          dueDate: "",
          wbsNodeId: node.id,
        });
      });

      // Fix rounding on last item
      const totalPct = newItems.reduce((s, item) => s + Number(item.percentage), 0);
      const diff = 100 - totalPct;
      if (Math.abs(diff) > 0.001 && newItems.length > 0) {
        const last = newItems[newItems.length - 1]!;
        last.percentage = (Number(last.percentage) + diff).toFixed(2);
      }

      onChange(newItems);
      return;
    }

    // TLP / DPP: monthly installments
    if (dealMaturityMonths <= 0) return;
    const balance = totalCollectible - advanceAmount;
    if (balance <= 0) return;

    const perInstallment = balance / dealMaturityMonths;
    const perPct = (perInstallment / totalCollectible) * 100;
    const newItems: PaymentPlanItem[] = [];

    if (advanceAmount > 0) {
      newItems.push({
        installmentNo: 1,
        description: "Booking Advance",
        percentage: ((advanceAmount / totalCollectible) * 100).toFixed(2),
        amount: advanceAmount.toFixed(2),
        dueDate: new Date().toISOString().split("T")[0]!,
        wbsNodeId: "",
      });
    }

    const startNo = advanceAmount > 0 ? 2 : 1;
    for (let i = 0; i < dealMaturityMonths; i++) {
      const due = new Date();
      due.setMonth(due.getMonth() + i + 1);
      newItems.push({
        installmentNo: startNo + i,
        description: `Installment ${startNo + i} (Month ${i + 1})`,
        percentage: perPct.toFixed(2),
        amount: perInstallment.toFixed(2),
        dueDate: due.toISOString().split("T")[0]!,
        wbsNodeId: "",
      });
    }

    // Fix rounding on last item
    const totalPct = newItems.reduce((s, item) => s + Number(item.percentage), 0);
    const diff = 100 - totalPct;
    if (Math.abs(diff) > 0.001 && newItems.length > 0) {
      const last = newItems[newItems.length - 1]!;
      last.percentage = (Number(last.percentage) + diff).toFixed(2);
    }

    onChange(newItems);
  }

  const totalPct = items.reduce((s, item) => s + (Number(item.percentage) || 0), 0);
  const totalAmt = items.reduce((s, item) => s + (Number(item.amount) || 0), 0);
  const pctValid = Math.abs(totalPct - 100) < 0.01;
  const isCLP = scheduleType === "CLP";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Payment Plan</Label>
        <div className="flex items-center gap-2">
          <Select
            value={scheduleType}
            onChange={(e) => onScheduleTypeChange(e.target.value as "TLP" | "DPP" | "CLP")}
            className="text-sm w-32"
          >
            <option value="TLP">Time-Linked</option>
            <option value="DPP">Down Payment</option>
            <option value="CLP">Construction-Linked</option>
          </Select>
          {((isCLP && wbsNodes.length > 0) || (!isCLP && dealMaturityMonths > 0)) && (
            <Button type="button" variant="ghost" size="sm" onClick={autoGenerate}>
              <Wand2 className="h-3.5 w-3.5" /> Auto
            </Button>
          )}
        </div>
      </div>

      {isCLP && (
        <div className="flex items-center gap-2 text-caption text-muted-foreground rounded-md border border-dashed border-border p-3">
          {loadingWbs ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" /> Loading construction milestones…</>
          ) : wbsNodes.length === 0 ? (
            <CalendarClock className="h-3.5 w-3.5 shrink-0" />
          ) : null}
          <span>
            {wbsNodes.length > 0
              ? `${wbsNodes.length} construction milestones available. Click "Auto" to generate installments linked to milestones, or add manually.`
              : projectId
                ? "No WBS milestones found for this project. Create milestones in the WBS builder first."
                : "Select a project to load construction milestones."}
          </span>
        </div>
      )}

      {!isCLP && items.length === 0 && (
        <div className="flex items-center gap-2 text-caption text-muted-foreground rounded-md border border-dashed border-border p-3">
          <CalendarClock className="h-4 w-4 shrink-0" />
          <span>
            {dealMaturityMonths > 0
              ? `Click "Auto" to generate ${dealMaturityMonths} monthly installments, or add manually.`
              : "Set deal maturity months above, then click Auto to generate installments."}
          </span>
        </div>
      )}

      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className={isCLP ? "grid grid-cols-[24px_1fr_60px_100px_140px_24px] gap-2 items-center" : "grid grid-cols-[24px_1fr_60px_100px_120px_24px] gap-2 items-center"}>
            <span className="text-caption text-muted-foreground tnum text-right">{item.installmentNo}.</span>
            <Input
              placeholder="Description"
              value={item.description}
              onChange={(e) => update(i, "description", e.target.value)}
              className="text-sm"
            />
            <Input
              type="number"
              step="0.01"
              placeholder="%"
              value={item.percentage}
              onChange={(e) => update(i, "percentage", e.target.value)}
              className="text-sm tnum"
            />
            <Input
              type="number"
              step="0.01"
              placeholder="Amount"
              value={item.amount}
              onChange={(e) => update(i, "amount", e.target.value)}
              className="text-sm tnum"
            />
            {isCLP ? (
              <Select
                value={item.wbsNodeId ?? ""}
                onChange={(e) => update(i, "wbsNodeId", e.target.value)}
                className="text-sm"
              >
                <option value="">— Milestone —</option>
                {wbsNodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.code} · {n.name}
                  </option>
                ))}
              </Select>
            ) : (
              <Input
                type="date"
                value={item.dueDate}
                onChange={(e) => update(i, "dueDate", e.target.value)}
                className="text-sm"
              />
            )}
            <button
              type="button"
              onClick={() => removeRow(i)}
              className="text-muted-foreground hover:text-danger"
              aria-label="Remove installment"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" size="sm" onClick={addRow}>
          <Plus className="h-3.5 w-3.5" /> Add Installment
        </Button>
        {items.length > 0 && (
          <div className="flex items-center gap-3 text-caption">
            <span className={pctValid ? "text-muted-foreground" : "text-danger"}>
              Total: {totalPct.toFixed(2)}%
            </span>
            <span className="text-muted-foreground tnum">
              {formatCurrency(totalAmt)} / {formatCurrency(totalCollectible)}
            </span>
          </div>
        )}
      </div>
      {items.length > 0 && !pctValid && (
        <p className="text-caption text-danger">Installment percentages must sum to 100%.</p>
      )}
    </div>
  );
}
