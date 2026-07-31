"use client";

import { useMemo, useState } from "react";
import { Plus, Search, Package, ArrowRight, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { IssueMaterialsDialog } from "./issue-materials-dialog";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import { downloadCSV } from "@/lib/export";
import type { ProjectOption, StockLocationRow, StockMovementRow } from "@/lib/types";

const MOVEMENT_VARIANT: Record<string, "default" | "success" | "warning" | "muted" | "danger"> = {
  PURCHASE_RECEIPT: "success",
  TRANSFER_IN: "default",
  TRANSFER_OUT: "warning",
  ISSUE_TO_PROJECT: "warning",
  ADJUSTMENT_IN: "success",
  ADJUSTMENT_OUT: "danger",
  RETURN: "muted",
  SALE: "default",
};

export function StockMovementsView({
  movements,
  locations,
  projects,
  permissions,
}: {
  movements: StockMovementRow[];
  locations: StockLocationRow[];
  projects: ProjectOption[];
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
      <PageHeader
        title="Stock Ledger"
        description="The immutable material ledger — receipts, transfers, issues, adjustments. Every quantity change is recorded here."
      />

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
            <Button onClick={() => setIssueOpen(true)} disabled={locations.length === 0 || projects.length === 0}>
              <Plus className="h-4 w-4" /> Issue to Project
            </Button>
          )}
        </div>
      </div>

      <div className="text-body text-muted-foreground">
        {filtered.length} movement{filtered.length !== 1 ? "s" : ""}
      </div>

      <Card>
        <CardContent className="p-0">
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
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Date</TH>
                  <TH>Type</TH>
                  <TH>Material</TH>
                  <TH>From → To</TH>
                  <TH className="text-right">Qty</TH>
                  <TH className="text-right">Unit Cost</TH>
                  <TH className="text-right">Balance After</TH>
                  <TH>Reason / Ref</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((m) => (
                  <TR key={m.id}>
                    <TD className="tnum whitespace-nowrap text-caption text-muted-foreground">{formatDate(m.timestamp)}</TD>
                    <TD><Badge variant={MOVEMENT_VARIANT[m.movementType] ?? "muted"}>{m.movementLabel}</Badge></TD>
                    <TD>
                      <div className="font-medium">{m.materialName}</div>
                      <div className="font-mono text-caption text-muted-foreground">{m.materialCode}</div>
                    </TD>
                    <TD className="text-caption">
                      <span className="text-muted-foreground">{m.fromLocationName ?? "—"}</span>
                      <ArrowRight className="mx-1 inline h-3 w-3 text-muted-foreground" />
                      <span className="text-muted-foreground">{m.toLocationName ?? "—"}</span>
                    </TD>
                    <TD className="tnum text-right">{formatNumber(m.qty, 3)} {m.unit}</TD>
                    <TD className="tnum text-right">{m.unitCost > 0 ? formatCurrency(m.unitCost) : "—"}</TD>
                    <TD className="tnum text-right">{formatNumber(m.balanceAfter, 3)} {m.unit}</TD>
                    <TD className="max-w-[200px] truncate text-caption text-muted-foreground">
                      {m.reason ?? m.refType ?? "—"}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <IssueMaterialsDialog open={issueOpen} onOpenChange={setIssueOpen} locations={locations} projects={projects} />
    </div>
  );
}
