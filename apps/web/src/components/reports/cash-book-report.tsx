"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, IndianRupee } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency } from "@/lib/utils";
import { downloadCSV, type ColumnDef } from "@/lib/export";

export type CashBookLine = {
  id: string;
  date: string;
  entryNumber: string;
  accountName: string;
  narration: string;
  debit: number;
  credit: number;
  balance: number;
};

export function CashBookView({
  lines,
  openingBalance,
  closingBalance,
  defaultFrom,
  defaultTo,
}: {
  lines: CashBookLine[];
  openingBalance: number;
  closingBalance: number;
  defaultFrom: string;
  defaultTo: string;
}) {
  const router = useRouter();
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);

  function apply(e: React.FormEvent) {
    e.preventDefault();
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    router.push(`/reports/cash-book?${p.toString()}`);
  }

  const exportCols: ColumnDef[] = [
    { key: "date", label: "Date" },
    { key: "entry", label: "Entry #" },
    { key: "account", label: "Account" },
    { key: "narration", label: "Narration" },
    { key: "debit", label: "Debit (₹)" },
    { key: "credit", label: "Credit (₹)" },
    { key: "balance", label: "Balance (₹)" },
  ];
  const exportRows = () =>
    [
      {
        date: "", entry: "", account: "", narration: "Opening balance",
        debit: "", credit: "", balance: openingBalance,
      },
      ...lines.map((l) => ({
        date: l.date.slice(0, 10),
        entry: l.entryNumber,
        account: l.accountName,
        narration: l.narration,
        debit: l.debit || "",
        credit: l.credit || "",
        balance: l.balance,
      })),
      {
        date: "", entry: "", account: "", narration: "Closing balance",
        debit: "", credit: "", balance: closingBalance,
      },
    ];

  return (
    <div className="space-y-4">
      {/* Date range */}
      <form onSubmit={apply} className="flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-caption text-muted-foreground">From</label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-auto" />
        </div>
        <div>
          <label className="mb-1 block text-caption text-muted-foreground">To</label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-auto" />
        </div>
        <Button type="submit" size="sm">Apply</Button>
        <Button variant="outline" size="sm" type="button" onClick={() => downloadCSV("cash-book.csv", exportRows(), exportCols)}>
          <Download className="mr-1.5 h-3.5 w-3.5" /> Export CSV
        </Button>
      </form>

      {lines.length === 0 ? (
        <EmptyState
          icon={<IndianRupee />}
          title="No cash movements in this period"
          description="Every receipt and payment touching cash, petty cash or the escrow account lands here once posted."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Entry</TH>
                <TH>Account</TH>
                <TH>Narration</TH>
                <TH className="text-right">Debit</TH>
                <TH className="text-right">Credit</TH>
                <TH className="text-right">Balance</TH>
              </TR>
            </THead>
            <TBody>
              <TR className="bg-muted/40 font-medium">
                <TD colSpan={6}>Opening balance</TD>
                <TD className="text-right">{formatCurrency(openingBalance)}</TD>
              </TR>
              {lines.map((l) => (
                <TR key={l.id}>
                  <TD>{new Date(l.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })}</TD>
                  <TD className="text-muted-foreground">{l.entryNumber}</TD>
                  <TD className="text-muted-foreground">{l.accountName.split(" — ")[0]}</TD>
                  <TD className="max-w-[280px] truncate">{l.narration}</TD>
                  <TD className="text-right font-medium text-success">{l.debit > 0 ? formatCurrency(l.debit) : ""}</TD>
                  <TD className="text-right font-medium text-danger">{l.credit > 0 ? formatCurrency(l.credit) : ""}</TD>
                  <TD className={`text-right font-medium ${l.balance < 0 ? "text-danger" : ""}`}>{formatCurrency(l.balance)}</TD>
                </TR>
              ))}
              <TR className="bg-muted/40 font-medium">
                <TD colSpan={6}>Closing balance</TD>
                <TD className="text-right">{formatCurrency(closingBalance)}</TD>
              </TR>
            </TBody>
          </Table>
        </div>
      )}
    </div>
  );
}
