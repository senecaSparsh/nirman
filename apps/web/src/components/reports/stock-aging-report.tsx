"use client";

import { Download, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { downloadCSV } from "@/lib/export";
import type { ColumnDef } from "@/lib/export";

export type AgingRow = {
  materialCode: string;
  materialName: string;
  unit: string;
  locationName: string;
  qty: number;
  value: number;
  lastInboundDate: string | null;
  ageDays: number;
  bucket: string;
  isSlowMoving: boolean;
};

const BUCKETS = ["<30d", "30-60d", "60-90d", ">90d"] as const;

export function StockAgingReport({ rows }: { rows: AgingRow[] }) {
  const grandValue = rows.reduce((s, r) => s + r.value, 0);
  const slowValue = rows.filter((r) => r.isSlowMoving).reduce((s, r) => s + r.value, 0);
  const bucketValue = BUCKETS.map((b) => ({
    bucket: b,
    value: rows.filter((r) => r.bucket === b).reduce((s, r) => s + r.value, 0),
  }));

  const exportRows = () =>
    rows.map((r) => ({
      code: r.materialCode,
      material: r.materialName,
      location: r.locationName,
      qty: r.qty,
      unit: r.unit,
      value: r.value,
      lastInbound: r.lastInboundDate?.slice(0, 10) ?? "",
      ageDays: r.ageDays,
      bucket: r.bucket,
      slowMoving: r.isSlowMoving ? "YES" : "",
    }));

  const exportCols: ColumnDef[] = [
    { key: "code", label: "Code" },
    { key: "material", label: "Material" },
    { key: "location", label: "Location" },
    { key: "qty", label: "Qty" },
    { key: "unit", label: "Unit" },
    { key: "value", label: "Value (₹)" },
    { key: "lastInbound", label: "Last Inbound" },
    { key: "ageDays", label: "Age (days)" },
    { key: "bucket", label: "Bucket" },
    { key: "slowMoving", label: "Slow Moving" },
  ];

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Package />}
        title="No stock aging data"
        description="Stock appears here once materials have moved at least once — receipts, transfers and issues build the aging clock."
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Bucket totals */}
      <div className="grid gap-3 sm:grid-cols-4">
        {bucketValue.map((b) => (
          <div key={b.bucket} className={`rounded-lg border p-3 ${b.bucket === ">90d" ? "border-danger/40 bg-danger/5" : "border-border bg-card"}`}>
            <p className="text-caption text-muted-foreground">{b.bucket}</p>
            <p className="text-figure text-lg">{formatCurrency(b.value)}</p>
          </div>
        ))}
      </div>

      {slowValue > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 text-sm text-warning-foreground">
          {formatCurrency(slowValue)} of {formatCurrency(grandValue)} stock value hasn&rsquo;t moved in 90+ days — transfer it where it&rsquo;s needed or write it off before it rots.
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => downloadCSV("stock-aging.csv", exportRows(), exportCols)}>
          <Download className="mr-1.5 h-3.5 w-3.5" /> Export CSV
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <THead>
            <TR>
              <TH>Material</TH>
              <TH>Location</TH>
              <TH className="text-right">Qty</TH>
              <TH className="text-right">Value</TH>
              <TH className="text-right">Last Inbound</TH>
              <TH className="text-right">Age</TH>
              <TH>Bucket</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r, i) => (
              <TR key={`${r.materialCode}-${r.locationName}-${i}`} className={r.isSlowMoving ? "bg-danger/5" : undefined}>
                <TD>
                  <span className="font-medium">{r.materialName}</span>
                  <span className="ml-1.5 text-caption text-muted-foreground">{r.materialCode}</span>
                </TD>
                <TD>{r.locationName}</TD>
                <TD className="text-right">{formatNumber(r.qty)} {r.unit.toLowerCase()}</TD>
                <TD className="text-right">{formatCurrency(r.value)}</TD>
                <TD className="text-right">{r.lastInboundDate ? new Date(r.lastInboundDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}</TD>
                <TD className="text-right font-medium">{r.ageDays}d</TD>
                <TD>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.isSlowMoving ? "bg-danger/10 text-danger" : "bg-muted text-muted-foreground"}`}>
                    {r.bucket}
                  </span>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
    </div>
  );
}
