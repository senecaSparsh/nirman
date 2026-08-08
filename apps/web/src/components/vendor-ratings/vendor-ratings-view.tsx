"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { PageLoading } from "@/components/page-loading";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";
import { ShieldCheck } from "lucide-react";

type Ranking = {
  supplierId: string;
  supplierName: string;
  onTimeRate: number;
  qualityRate: number;
  priceCompetitiveness: number;
  overallScore: number;
  totalPos: number;
  totalReceipts: number;
  totalQuotes: number;
};

export function VendorRatingsView() {
  const [rankings, setRankings] = useState<Ranking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/vendor-ratings")
      .then((r) => r.json())
      .then((data) => setRankings(data ?? []))
      .catch(() => toast.error("Failed to load vendor ratings"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PageLoading label="Loading vendor ratings…" variant="default" />;

  if (rankings.length === 0) {
    return (
      <EmptyState
        icon={<ShieldCheck />}
        title="No vendor data"
        description="Vendor ratings are auto-computed from purchase orders, goods receipts, and quote comparisons. Create some transactions to see ratings."
      />
    );
  }

  return (
    <div className="rounded-lg border border-border overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 border-b border-border">
          <tr>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Rank</th>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Supplier</th>
            <th className="text-right px-3 py-2 font-medium text-muted-foreground">On-Time</th>
            <th className="text-right px-3 py-2 font-medium text-muted-foreground">Quality</th>
            <th className="text-right px-3 py-2 font-medium text-muted-foreground">Price</th>
            <th className="text-right px-3 py-2 font-medium text-muted-foreground">Overall</th>
            <th className="text-right px-3 py-2 font-medium text-muted-foreground">POs</th>
            <th className="text-right px-3 py-2 font-medium text-muted-foreground">Receipts</th>
            <th className="text-right px-3 py-2 font-medium text-muted-foreground">Quotes</th>
          </tr>
        </thead>
        <tbody>
          {rankings.map((r, idx) => (
            <tr key={r.supplierId} className="border-b border-border/50">
              <td className="px-3 py-2 font-medium">{idx + 1}</td>
              <td className="px-3 py-2">{r.supplierName}</td>
              <td className="text-right px-3 py-2">
                <ScoreBar value={r.onTimeRate} />
              </td>
              <td className="text-right px-3 py-2">
                <ScoreBar value={r.qualityRate} />
              </td>
              <td className="text-right px-3 py-2">
                <ScoreBar value={r.priceCompetitiveness} />
              </td>
              <td className="text-right px-3 py-2">
                <div className="flex items-center justify-end gap-2">
                  <ScoreBar value={r.overallScore} />
                  <Badge variant={r.overallScore >= 0.8 ? "default" : r.overallScore >= 0.5 ? "muted" : "danger"}>
                    {(r.overallScore * 100).toFixed(0)}
                  </Badge>
                </div>
              </td>
              <td className="text-right px-3 py-2 text-muted-foreground">{r.totalPos}</td>
              <td className="text-right px-3 py-2 text-muted-foreground">{r.totalReceipts}</td>
              <td className="text-right px-3 py-2 text-muted-foreground">{r.totalQuotes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScoreBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="inline-flex items-center gap-2">
      <div className="w-16 h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full",
            pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-destructive",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground w-8">{pct}%</span>
    </div>
  );
}
