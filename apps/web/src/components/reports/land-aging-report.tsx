"use client";

import { Download, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { downloadCSV, type ColumnDef } from "@/lib/export";

export type LandAgingRow = {
  parcelNumber: string;
  location: string | null;
  projectName: string | null;
  sellerName: string | null;
  area: number;
  areaUnit: string;
  acquisitionCost: number;
  currentValuation: number;
  askingPrice: number | null;
  purchaseDate: string;
  ageYears: number;
  bucket: string;
  isStale: boolean;
  potentialLoss: number;
};

const BUCKETS = ["<1yr", "1-2yr", "2-5yr", "5+yr"] as const;

export function LandAgingReport({ rows }: { rows: LandAgingRow[] }) {
  const bucketValue = BUCKETS.map((b) => ({
    bucket: b,
    value: rows.filter((r) => r.bucket === b).reduce((s, r) => s + r.currentValuation, 0),
    count: rows.filter((r) => r.bucket === b).length,
  }));

  const exportRows = () =>
    rows.map((r) => ({
      parcel: r.parcelNumber,
      location: r.location ?? "",
      project: r.projectName ?? "",
      seller: r.sellerName ?? "",
      area: r.area,
      unit: r.areaUnit,
      cost: r.acquisitionCost,
      valuation: r.currentValuation,
      asking: r.askingPrice ?? "",
      purchaseDate: r.purchaseDate.slice(0, 10),
      ageYears: r.ageYears,
      bucket: r.bucket,
      potentialLoss: r.potentialLoss,
    }));

  const exportCols: ColumnDef[] = [
    { key: "parcel", label: "Parcel" },
    { key: "location", label: "Location" },
    { key: "project", label: "Project" },
    { key: "seller", label: "Bought From" },
    { key: "area", label: "Area" },
    { key: "unit", label: "Unit" },
    { key: "cost", label: "Cost (₹)" },
    { key: "valuation", label: "Valuation (₹)" },
    { key: "asking", label: "Asking (₹)" },
    { key: "purchaseDate", label: "Purchased" },
    { key: "ageYears", label: "Age (yrs)" },
    { key: "bucket", label: "Bucket" },
    { key: "potentialLoss", label: "Below-cost gap (₹)" },
  ];

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<MapPin />}
        title="No unsold land"
        description="Parcels appear here while they sit AVAILABLE or HOLD — the aging clock starts at purchase date."
      />
    );
  }

  const totalLoss = rows.reduce((s, r) => s + r.potentialLoss, 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        {bucketValue.map((b) => (
          <div key={b.bucket} className={`rounded-lg border p-3 ${b.bucket === "5+yr" ? "border-danger/40 bg-danger/5" : "border-border bg-card"}`}>
            <p className="text-caption text-muted-foreground">{b.bucket}</p>
            <p className="text-figure text-lg">{formatCurrency(b.value)}</p>
            <p className="text-caption text-muted-foreground">{b.count} parcel{b.count === 1 ? "" : "s"}</p>
          </div>
        ))}
      </div>

      {totalLoss > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 text-sm text-warning-foreground">
          {formatCurrency(totalLoss)} of parcels are valued below cost — run the NRV sweep from Books Health if these valuations are real.
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" type="button" onClick={() => window.print()} className="print:hidden">
          Print
        </Button>
        <Button variant="outline" size="sm" className="print:hidden" onClick={() => downloadCSV("land-aging.csv", exportRows(), exportCols)}>
          <Download className="mr-1.5 h-3.5 w-3.5" /> Export CSV
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <THead>
            <TR>
              <TH>Parcel</TH>
              <TH>Location</TH>
              <TH className="text-right">Area</TH>
              <TH className="text-right">Cost</TH>
              <TH className="text-right">Valuation</TH>
              <TH className="text-right">Asking</TH>
              <TH className="text-right">Age</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.parcelNumber} className={r.isStale ? "bg-danger/5" : undefined}>
                <TD>
                  <span className="font-medium">{r.parcelNumber}</span>
                  {r.projectName && <span className="ml-1.5 text-caption text-muted-foreground">{r.projectName}</span>}
                </TD>
                <TD>{r.location ?? "—"}</TD>
                <TD className="text-right">{formatNumber(r.area)} {r.areaUnit.toLowerCase()}</TD>
                <TD className="text-right">{formatCurrency(r.acquisitionCost)}</TD>
                <TD className="text-right">
                  {formatCurrency(r.currentValuation)}
                  {r.potentialLoss > 0 && <span className="ml-1 text-danger">(−{formatCurrency(r.potentialLoss)})</span>}
                </TD>
                <TD className="text-right">{r.askingPrice ? formatCurrency(r.askingPrice) : "—"}</TD>
                <TD className="text-right">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.isStale ? "bg-danger/10 text-danger" : "bg-muted text-muted-foreground"}`}>
                    {r.ageYears}yr
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
