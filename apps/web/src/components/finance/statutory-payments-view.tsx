"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Landmark, Plus } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/field";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency, formatDate } from "@/lib/utils";

export type StatutoryOutstanding = {
  kind: "PF" | "ESI" | "TDS" | "GST" | "TDS_REFUND";
  outstanding: number;
  itcAvailable?: number;
  outputGst?: number;
};

export type StatutoryPaymentRow = {
  id: string;
  kind: string;
  amount: number;
  itcUtilized: number;
  period: string | null;
  paymentDate: string;
  referenceNo: string | null;
  notes: string | null;
  status: string;
};

// One row per sale where the buyer withheld TDS under §194-IA — the CA's
// reconciliation list for 26QB acknowledgements, Form 16B certificates, and
// the TDS_RECEIVABLE GL balance.
export type TdsSaleRow = {
  id: string;
  saleNumber: string;
  customerName: string;
  salePrice: number;
  stampDutyValue: number | null;
  tdsAmount: number;
  tdsCertificateNo: string | null;
  status: string;
};

const KIND_LABEL: Record<string, string> = {
  PF: "Provident Fund",
  ESI: "ESI",
  TDS: "TDS Payable",
  GST: "GST (net of ITC)",
  TDS_REFUND: "TDS Receivable",
};

const tdsSaleColumns: Column<TdsSaleRow>[] = [
  {
    key: "saleNumber",
    label: "Sale",
    render: (r) => <span className="font-mono text-sm">{r.saleNumber}</span>,
  },
  { key: "customerName", label: "Buyer", sortable: true },
  {
    key: "salePrice",
    label: "Sale Price",
    align: "right",
    sortable: true,
    render: (r) => <span className="tnum">{formatCurrency(r.salePrice)}</span>,
  },
  {
    key: "tdsAmount",
    label: "TDS Withheld",
    align: "right",
    sortable: true,
    render: (r) => {
      const expected = Math.round(Math.max(r.salePrice, r.stampDutyValue ?? 0) * 0.01 * 100) / 100;
      const mismatch = Math.abs(expected - r.tdsAmount) > 1;
      return (
        <span className={`tnum ${mismatch ? "text-danger" : ""}`}>
          {formatCurrency(r.tdsAmount)}
          {mismatch && <span className="block text-micro text-danger">expected {formatCurrency(expected)}</span>}
        </span>
      );
    },
  },
  {
    key: "tdsCertificateNo",
    label: "Form 16B",
    render: (r) =>
      r.tdsCertificateNo
        ? <Badge variant="success">{r.tdsCertificateNo}</Badge>
        : <Badge variant="muted">awaiting</Badge>,
  },
];

const columns: Column<StatutoryPaymentRow>[] = [
  {
    key: "kind",
    label: "Kind",
    render: (r) => <Badge variant="outline">{KIND_LABEL[r.kind] ?? r.kind}</Badge>,
  },
  {
    key: "amount",
    label: "Paid",
    align: "right",
    sortable: true,
    render: (r) => (
      <span className="tnum font-medium">
        {formatCurrency(r.amount)}
        {r.itcUtilized > 0 && (
          <span className="block text-micro text-muted-foreground">+ {formatCurrency(r.itcUtilized)} ITC offset</span>
        )}
      </span>
    ),
  },
  { key: "period", label: "Period", render: (r) => r.period ?? <span className="text-faint">—</span> },
  {
    key: "paymentDate",
    label: "Date",
    sortable: true,
    sortValue: (r) => new Date(r.paymentDate),
    render: (r) => <span className="tnum text-muted-foreground">{formatDate(r.paymentDate)}</span>,
  },
  { key: "referenceNo", label: "Challan / Ref", render: (r) => r.referenceNo ?? <span className="text-faint">—</span> },
  {
    key: "status",
    label: "Status",
    render: (r) => <Badge variant={r.status === "VOID" ? "muted" : "success"}>{r.status}</Badge>,
  },
];

const columnsWithVoid = (onVoid: (r: StatutoryPaymentRow) => void, canManage: boolean): Column<StatutoryPaymentRow>[] => [
  ...columns,
  ...(canManage ? [{
    key: "actions",
    label: "",
    render: (r: StatutoryPaymentRow) => r.status === "VOID" ? null : (
      <Button size="xs" variant="outline" className="text-danger" onClick={() => onVoid(r)}>Void</Button>
    ),
  } satisfies Column<StatutoryPaymentRow>] : []),
];

export function StatutoryPaymentsView({
  outstanding,
  payments,
  tdsSales = [],
  canManage,
}: {
  outstanding: StatutoryOutstanding[];
  payments: StatutoryPaymentRow[];
  tdsSales?: TdsSaleRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [payOpen, setPayOpen] = useState(false);
  const [kind, setKind] = useState<StatutoryOutstanding["kind"]>("PF");
  const [amount, setAmount] = useState("");
  const [period, setPeriod] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const selected = outstanding.find((o) => o.kind === kind);
  const parsedAmount = Number(amount) || 0;

  async function onVoid(r: StatutoryPaymentRow) {
    const reason = window.prompt(`Void ${KIND_LABEL[r.kind] ?? r.kind} payment of ${formatCurrency(r.amount)}? The payable re-opens. Reason:`);
    if (reason === null) return;
    try {
      const res = await fetch(`/api/statutory-payments/${r.id}/void`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Void failed");
      toast.success("Remittance voided — payable re-opened");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Void failed");
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (parsedAmount <= 0) { toast.error("Amount must be greater than zero"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/statutory-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          amount: parsedAmount,
          period: period || undefined,
          referenceNo: referenceNo || undefined,
          notes: notes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to record payment");
      toast.success(`${kind} remitted — ${formatCurrency(parsedAmount)}${toNum2(data.itcUtilized) > 0 ? ` + ${formatCurrency(toNum2(data.itcUtilized))} ITC offset` : ""}`);
      setPayOpen(false);
      setAmount(""); setPeriod(""); setReferenceNo(""); setNotes("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record payment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {outstanding.map((o) => (
          <Card key={o.kind} className="p-3">
            <p className="text-caption text-muted-foreground">{KIND_LABEL[o.kind]}</p>
            <p className={`tnum text-lg font-semibold ${o.outstanding > 0 ? "text-warning" : "text-foreground"}`}>
              {formatCurrency(o.outstanding)}
            </p>
            {o.kind === "GST" && (o.itcAvailable ?? 0) > 0 && (
              <p className="text-micro text-muted-foreground">ITC available: {formatCurrency(o.itcAvailable!)}</p>
            )}
            {o.kind === "PF" && (
              <button
                type="button"
                onClick={() => window.open("/api/export?type=pf-ecr", "_blank")}
                className="mt-1 text-micro text-brand hover:underline"
                title="Download EPFO ECR upload file for the latest payroll period"
              >
                ECR file ↓
              </button>
            )}
          </Card>
        ))}
      </div>

      <div className="flex justify-between">
        <p className="text-caption text-muted-foreground self-center">
          Payables accumulate from payroll, TDS deductions and GST filings — record each challan when remitted.
        </p>
        {canManage && (
          <Button size="sm" onClick={() => setPayOpen(true)}>
            <Plus className="h-4 w-4" /> Record Remittance
          </Button>
        )}
      </div>

      <DataTable
        columns={columnsWithVoid(onVoid, canManage)}
        data={payments}
        emptyState={
          <EmptyState
            icon={<Landmark className="h-5 w-5" />}
            title="No statutory payments yet"
            description="Remittances recorded here drain the PF/ESI/TDS/GST payable balances."
          />
        }
      />

      {tdsSales.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-label text-foreground">194-IA — TDS Withheld by Buyers</p>
              <p className="text-caption text-muted-foreground">
                1% of the higher of sale price or stamp-duty value. Verify each buyer filed 26QB and issued Form 16B — amounts sit in TDS Receivable until your 26AS claim.
              </p>
            </div>
            <Badge variant="outline" className="tnum">{formatCurrency(tdsSales.reduce((s, r) => s + r.tdsAmount, 0))}</Badge>
          </div>
          <DataTable
            columns={tdsSaleColumns}
            data={tdsSales}
            emptyState={<EmptyState icon={<Landmark className="h-5 w-5" />} title="No TDS sales" description="Sales above ₹50L appear here when a buyer withholds 194-IA TDS." />}
          />
        </div>
      )}

      <Dialog
        open={payOpen}
        onOpenChange={(o) => { setPayOpen(o); if (!o) { setAmount(""); setPeriod(""); setReferenceNo(""); setNotes(""); } }}
        title="Record Statutory Remittance"
        description="Drains the payable balance — the GST kind also offsets available ITC automatically."
        className="max-w-md"
      >
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kind" required>
              <Select value={kind} onChange={(e) => setKind(e.target.value as StatutoryOutstanding["kind"])}>
                {outstanding.map((o) => (
                  <option key={o.kind} value={o.kind}>{KIND_LABEL[o.kind]}</option>
                ))}
              </Select>
            </Field>
            <Field label={kind === "TDS_REFUND" ? "Refund Received" : "Cash Paid"} required>
              <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" required />
            </Field>
          </div>
          {selected && (
            <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-caption text-muted-foreground">
              Outstanding: <span className="tnum font-medium text-foreground">{formatCurrency(selected.outstanding)}</span>
              {kind === "GST" && (selected.itcAvailable ?? 0) > 0 && (
                <span className="ml-2">ITC auto-offset: <span className="tnum text-foreground">{formatCurrency(selected.itcAvailable!)}</span></span>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Challan Period">
              <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
            </Field>
            <Field label="Reference No.">
              <Input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} placeholder="Challan / UTR" />
            </Field>
          </div>
          <Field label="Notes">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setPayOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Recording…" : "Record"}</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

function toNum2(v: unknown): number { return typeof v === "string" ? Number(v) : Number(v ?? 0) || 0; }
