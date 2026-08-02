"use client";

import { useMemo, useState } from "react";
import { Plus, Search, Package, ArrowRight, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { IssueMaterialsDialog } from "./issue-materials-dialog";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import { downloadCSV } from "@/lib/export";
import type { ProjectOption, StockLocationRow, StockMovementRow, DepartmentOption } from "@/lib/types";

const MOVEMENT_VARIANT: Record<string, "default" | "success" | "warning" | "muted" | "danger"> = {
  PURCHASE_RECEIPT: "success",
  TRANSFER_IN: "default",
  TRANSFER_OUT: "warning",
  ISSUE_TO_PROJECT: "warning",
  ISSUE_TO_DEPARTMENT: "warning",
  ADJUSTMENT_IN: "success",
  ADJUSTMENT_OUT: "danger",
  RETURN: "muted",
  SALE: "default",
};

export function StockMovementsView({
  movements,
  locations,
  projects,
  departments,
  permissions,
}: {
  movements: StockMovementRow[];
  locations: StockLocationRow[];
  projects: ProjectOption[];
  departments: DepartmentOption[];
  permissions?: { canTransfer?: boolean; canIssue?: boolean };
}) {
  const canIssue = permissions?.canIssue ?? true;
  const [typeFilter, setTypeFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [query, setQuery] = useState("");
  const [issueOpen, setIssueOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return movements.filter((m) => {
      if (typeFilter && m.movementType !== typeFilter) return false;
      if (locationFilter && m.fromLocationId !== locationFilter && m.toLocationId !== locationFilter) return false;
      if (!q) return true;
      return (
        m.materialName.toLowerCase().includes(q) ||
        m.materialCode.toLowerCase().includes(q)
      );
    });
  }, [movements, typeFilter, locationFilter, query]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row">
          <div className="relative sm:max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search material…" className="pl-8" />
          </div>
          <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="sm:max-w-[180px]">
            <option value="">All types</option>
            <option value="PURCHASE_RECEIPT">Receipt</option>
            <option value="TRANSFER_IN">Transfer In</option>
            <option value="TRANSFER_OUT">Transfer Out</option>
            <option value="ISSUE_TO_PROJECT">Issue to Project</option>
            <option value="ISSUE_TO_DEPARTMENT">Issue to Dept</option>
            <option value="ADJUSTMENT_IN">Adjustment (+)</option>
            <option value="ADJUSTMENT_OUT">Adjustment (−)</option>
            <option value="RETURN">Return</option>
            <option value="SALE">Sale</option>
          </Select>
          <Select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} className="sm:max-w-[180px]">
            <option value="">All locations</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </Select>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => downloadCSV(`stock-movements-${new Date().toISOString().slice(0,10)}.csv`, filtered as unknown as Record<string, unknown>[], [
            { key: "timestamp", label: "Date", format: (v) => formatDate(String(v)) },
            { key: "movementLabel", label: "Type" },
            { key: "materialName", label: "Material" },
            { key: "materialCode", label: "Code" },
            { key: "fromLocationName", label: "From" },
            { key: "toLocationName", label: "To" },
            { key: "qty", label: "Qty" },
            { key: "unit", label: "Unit" },
            { key: "unitCost", label: "Unit Cost", format: (v) => formatCurrency(Number(v)) },
            { key: "balanceAfter", label: "Balance After" },
            { key: "reason", label: "Reason" },
          ])} disabled={filtered.length === 0}>
            <Download className="h-4 w-4" /> Export
          </Button>
          {canIssue && (
            <Button onClick={() => setIssueOpen(true)} disabled={locations.length === 0 || (projects.length === 0 && departments.length === 0)}>
              <Plus className="h-4 w-4" /> Issue Materials
            </Button>
          )}
        </div>
      </div>

      <div className="text-body text-muted-foreground">
        {filtered.length} movements
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Package className="h-5 w-5" />}
          title={movements.length === 0 ? "No stock movements yet" : "No movements match the filters"}
          description={
            movements.length === 0
              ? "Receipts, transfers and issues will be logged here automatically as you use the procurement module."
              : "Try different filters."
          }
        />
      ) : (
        /* ── Timeline feed — stock movements as a chronological stream ──
           Not a table. Stock movements are an immutable audit log —
           inherently temporal. A timeline makes the flow of materials
           visible: receipts (green, in), issues (amber, out), transfers
           (blue, move), adjustments (red/green). Each event shows the
           material, from→to, qty, and resulting balance. */
        <div className="relative">
          {/* Vertical timeline line */}
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />

          <div className="space-y-0.5">
            {filtered.map((m) => {
              const isIn = ["PURCHASE_RECEIPT", "TRANSFER_IN", "ADJUSTMENT_IN", "RETURN"].includes(m.movementType);
              const isOut = ["TRANSFER_OUT", "ISSUE_TO_PROJECT", "ISSUE_TO_DEPARTMENT", "ADJUSTMENT_OUT", "SALE"].includes(m.movementType);
              const dotColor =
                m.movementType === "PURCHASE_RECEIPT" || m.movementType === "ADJUSTMENT_IN" ? "bg-success" :
                m.movementType === "ADJUSTMENT_OUT" ? "bg-danger" :
                m.movementType === "ISSUE_TO_PROJECT" || m.movementType === "ISSUE_TO_DEPARTMENT" || m.movementType === "TRANSFER_OUT" ? "bg-warning" :
                "bg-foreground/40";
              return (
                <div
                  key={m.id}
                  className="group relative flex items-start gap-4 rounded-lg p-2.5 pl-0 transition-colors hover:bg-muted/30"
                >
                  {/* Timeline dot */}
                  <span className={`relative z-10 mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-background ${dotColor}`} />

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="min-w-0">
                        <span className="text-body font-medium text-foreground">{m.materialName}</span>
                        <span className="ml-2 font-mono text-micro text-muted-foreground">{m.materialCode}</span>
                      </div>
                      <span className={`shrink-0 text-body font-semibold tnum ${isIn ? "text-success" : isOut ? "text-foreground" : "text-muted-foreground"}`}>
                        {isIn ? "+" : isOut ? "−" : ""}{formatNumber(m.qty, 3)} <span className="text-caption font-normal text-muted-foreground">{m.unit}</span>
                      </span>
                    </div>

                    <div className="mt-0.5 flex items-baseline gap-2 text-caption text-muted-foreground">
                      <Badge variant={MOVEMENT_VARIANT[m.movementType] ?? "muted"}>{m.movementLabel}</Badge>
                      <span className="truncate">
                        {m.fromLocationName ?? "—"}
                        <ArrowRight className="mx-1 inline h-3 w-3" />
                        {m.toLocationName ?? "—"}
                      </span>
                    </div>

                    <div className="mt-1 flex items-baseline gap-3 text-micro text-muted-foreground">
                      <span className="tnum">{formatDate(m.timestamp)}</span>
                      {m.unitCost > 0 && <span className="tnum">@ {formatCurrency(m.unitCost)}</span>}
                      <span className="tnum">bal: {formatNumber(m.balanceAfter, 3)} {m.unit}</span>
                      {m.reason && <span className="truncate">· {m.reason}</span>}
                      {m.refType && !m.reason && <span className="truncate">· {m.refType}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <IssueMaterialsDialog open={issueOpen} onOpenChange={setIssueOpen} locations={locations} projects={projects} departments={departments} />
    </div>
  );
}
