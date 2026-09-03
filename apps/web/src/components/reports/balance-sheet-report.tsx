"use client";

import { Scale, CheckCircle2, AlertTriangle, Printer } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type Section = { code: string; name: string; balance: number };

export function BalanceSheetReport({
  assets,
  liabilities,
  equity,
  totalAssets,
  totalLiabilities,
  totalEquity,
  isBalanced,
}: {
  assets: Section[];
  liabilities: Section[];
  equity: Section[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  isBalanced: boolean;
}) {
  const totalLiabEquity = totalLiabilities + totalEquity;

  return (
    <div className="space-y-4">
      {/* Balance check banner */}
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border p-3 text-sm",
          isBalanced
            ? "border-success/30 bg-success/5 text-success"
            : "border-destructive/30 bg-destructive/5 text-destructive",
        )}
      >
        {isBalanced ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : (
          <AlertTriangle className="h-4 w-4" />
        )}
        <span className="font-medium">
          {isBalanced
            ? "Balance sheet is balanced — Assets = Liabilities + Equity"
            : `Balance sheet is out of balance by ${formatCurrency(Math.abs(totalAssets - totalLiabEquity))}`}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => window.print()}
        >
          <Printer className="mr-1 h-3.5 w-3.5" />
          Print
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Assets side */}
        <div className="rounded-lg border">
          <div className="border-b bg-muted/30 px-4 py-3">
            <h3 className="flex items-center gap-2 font-semibold">
              <Scale className="h-4 w-4" />
              Assets
            </h3>
          </div>
          <div className="divide-y">
            {assets.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                No asset balances
              </div>
            ) : (
              assets.map((a) => (
                <div key={a.code} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-muted-foreground">{a.code}</span>
                    <span>{a.name}</span>
                  </div>
                  <span className={cn("tnum font-medium", a.balance < 0 && "text-destructive")}>
                    {formatCurrency(a.balance)}
                  </span>
                </div>
              ))
            )}
          </div>
          <div className="flex items-center justify-between border-t-2 px-4 py-3 font-bold">
            <span>Total Assets</span>
            <span className="tnum">{formatCurrency(totalAssets)}</span>
          </div>
        </div>

        {/* Liabilities + Equity side */}
        <div className="space-y-4">
          <div className="rounded-lg border">
            <div className="border-b bg-muted/30 px-4 py-3">
              <h3 className="font-semibold">Liabilities</h3>
            </div>
            <div className="divide-y">
              {liabilities.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No liability balances
                </div>
              ) : (
                liabilities.map((l) => (
                  <div key={l.code} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs text-muted-foreground">{l.code}</span>
                      <span>{l.name}</span>
                    </div>
                    <span className={cn("tnum font-medium", l.balance < 0 && "text-destructive")}>
                      {formatCurrency(l.balance)}
                    </span>
                  </div>
                ))
              )}
            </div>
            <div className="flex items-center justify-between border-t px-4 py-3 font-semibold">
              <span>Total Liabilities</span>
              <span className="tnum">{formatCurrency(totalLiabilities)}</span>
            </div>
          </div>

          <div className="rounded-lg border">
            <div className="border-b bg-muted/30 px-4 py-3">
              <h3 className="font-semibold">Equity</h3>
            </div>
            <div className="divide-y">
              {equity.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No equity balances
                </div>
              ) : (
                equity.map((e) => (
                  <div key={e.code} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs text-muted-foreground">{e.code}</span>
                      <span>{e.name}</span>
                    </div>
                    <span className={cn("tnum font-medium", e.balance < 0 && "text-destructive")}>
                      {formatCurrency(e.balance)}
                    </span>
                  </div>
                ))
              )}
            </div>
            <div className="flex items-center justify-between border-t px-4 py-3 font-semibold">
              <span>Total Equity</span>
              <span className="tnum">{formatCurrency(totalEquity)}</span>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border-2 bg-muted/20 px-4 py-3 font-bold">
            <span>Total Liabilities + Equity</span>
            <span className="tnum">{formatCurrency(totalLiabEquity)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
