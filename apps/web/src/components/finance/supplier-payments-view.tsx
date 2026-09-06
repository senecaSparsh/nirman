"use client";

import { useState, useMemo } from "react";
import { Plus, Search, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { SupplierPaymentFormDialog } from "@/components/procurement/supplier-payment-form-dialog";
import { formatCurrency, cn } from "@/lib/utils";
import type { SupplierRow } from "@/lib/types";

type PaymentRow = {
  id: string;
  paymentNumber: string;
  supplierId: string;
  supplierName: string;
  purchaseOrderId: string | null;
  poNumber: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  amount: number;
  tdsAmount: number;
  tdsSection: string | null;
  netPaidAmount: number;
  paymentDate: string;
  paymentMode: string;
  referenceNo: string | null;
  chequePhotoUrl: string | null;
  notes: string | null;
  createdByName: string | null;
};

const PAYMENT_MODE_COLORS: Record<string, string> = {
  CASH: "bg-muted text-muted-foreground",
  BANK_TRANSFER: "bg-blue-100 text-blue-700",
  CHEQUE: "bg-amber-100 text-amber-700",
  UPI: "bg-purple-100 text-purple-700",
  NEFT: "bg-blue-100 text-blue-700",
  RTGS: "bg-blue-100 text-blue-700",
};

export function SupplierPaymentsView({
  payments,
  suppliers,
}: {
  payments: PaymentRow[];
  suppliers: SupplierRow[];
}) {
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [modeFilter, setModeFilter] = useState<string>("");

  const filtered = useMemo(() => {
    return payments.filter((p) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        p.supplierName.toLowerCase().includes(q) ||
        p.paymentNumber.toLowerCase().includes(q) ||
        p.referenceNo?.toLowerCase().includes(q) ||
        p.poNumber?.toLowerCase().includes(q) ||
        p.invoiceNumber?.toLowerCase().includes(q);
      const matchesMode = !modeFilter || p.paymentMode === modeFilter;
      return matchesSearch && matchesMode;
    });
  }, [payments, search, modeFilter]);

  const columns: Column<PaymentRow>[] = [
    {
      key: "paymentNumber",
      label: "Payment #",
      render: (p) => <span className="font-mono text-xs font-medium">{p.paymentNumber}</span>,
    },
    {
      key: "paymentDate",
      label: "Date",
      render: (p) => (
        <span className="text-sm text-muted-foreground">
          {new Date(p.paymentDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
        </span>
      ),
    },
    {
      key: "supplierName",
      label: "Supplier",
      render: (p) => (
        <div>
          <div className="font-medium">{p.supplierName}</div>
          {p.poNumber && <div className="text-xs text-muted-foreground">PO: {p.poNumber}</div>}
          {p.invoiceNumber && <div className="text-xs text-muted-foreground">Inv: {p.invoiceNumber}</div>}
        </div>
      ),
    },
    {
      key: "paymentMode",
      label: "Mode",
      render: (p) => (
        <Badge className={cn("text-xs", PAYMENT_MODE_COLORS[p.paymentMode] ?? "bg-muted")}>
          {p.paymentMode.replace("_", " ")}
        </Badge>
      ),
    },
    {
      key: "referenceNo",
      label: "Reference",
      render: (p) => p.referenceNo ? <span className="font-mono text-xs">{p.referenceNo}</span> : <span className="text-muted-foreground">—</span>,
    },
    {
      key: "amount",
      label: "Amount",
      align: "right",
      render: (p) => <span className="tnum font-medium">{formatCurrency(p.amount)}</span>,
    },
    {
      key: "tdsAmount",
      label: "TDS",
      align: "right",
      render: (p) => p.tdsAmount > 0 ? (
        <span className="tnum text-sm text-muted-foreground">{formatCurrency(p.tdsAmount)}{p.tdsSection && ` (${p.tdsSection})`}</span>
      ) : <span className="text-muted-foreground">—</span>,
    },
    {
      key: "netPaidAmount",
      label: "Net Paid",
      align: "right",
      render: (p) => <span className="tnum font-semibold">{formatCurrency(p.netPaidAmount)}</span>,
    },
  ];

  const modes = [...new Set(payments.map((p) => p.paymentMode))];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by supplier, payment #, reference, PO, invoice..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={modeFilter}
          onChange={(e) => setModeFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All modes</option>
          {modes.map((m) => (
            <option key={m} value={m}>{m.replace("_", " ")}</option>
          ))}
        </select>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="mr-1 h-3.5 w-3.5" />
          Print
        </Button>
        <Button size="sm" onClick={() => setShowForm(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Record Payment
        </Button>
      </div>

      {/* Payments table */}
      <DataTable
        data={filtered}
        columns={columns}
        emptyState={<div className="py-8 text-center text-sm text-muted-foreground">No supplier payments yet. Click &apos;Record Payment&apos; to add one.</div>}
      />

      {/* Payment form dialog */}
      <SupplierPaymentFormDialog
        open={showForm}
        onOpenChange={setShowForm}
        suppliers={suppliers}
      />
    </div>
  );
}
