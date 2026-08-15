import { Suspense } from "react";
import { connection } from "next/server";
import { Wallet, Printer, Building2, User, FileText, IndianRupee, CalendarDays, Hash } from "lucide-react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { MobileEmptyState } from "@/components/mobile/v2/primitives";
import { prisma } from "@nirman/db";
import { amountInWords } from "@nirman/services";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatCurrency, formatDate } from "@/lib/utils";
import { notFound } from "next/navigation";
import { ReceiptActions } from "./ReceiptActions";

type AssetPaymentSummary = { id: string; paymentDate: Date; mode: string; reference: string | null; amount: unknown };
type MaterialPaymentSummary = { id: string; paymentDate: Date; paymentMode: string; referenceNo: string | null; amount: unknown };

/**
 * /m/books/receipts/[id]?kind=ASSET|MATERIAL — mobile receipt detail.
 * Shows the full breakdown of a payment received (party, property/sale,
 * amount in words, account summary, payment history) and provides Print
 * + Share actions that open the industry-grade print receipt.
 */
export default function MobileReceiptDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ kind?: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileReceiptDetailContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function MobileReceiptDetailContent({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ kind?: string }>;
}) {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  if (!hasPermission(role, PERM.SALES_VIEW)) notFound();

  const { id } = await params;
  const { kind } = await searchParams;
  const isMaterial = (kind ?? "ASSET").toUpperCase() === "MATERIAL";

  if (isMaterial) {
    return <MaterialReceiptView id={id} companyId={company.id} companyName={company.name} />;
  }
  return <AssetReceiptView id={id} companyId={company.id} companyName={company.name} />;
}

// ── Shared UI helpers ───────────────────────────────────────────────────────

function FieldRow({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <Icon className="mt-0.5 size-3.5 shrink-0" style={{ color: "var(--color-ink-300)" }} />
      <div className="min-w-0 flex-1">
        <div className="text-[0.625rem] font-semibold uppercase" style={{ color: "var(--color-ink-300)" }}>{label}</div>
        <div className={`text-[0.8125rem] font-medium ${mono ? "font-mono" : ""}`} style={{ color: "var(--color-ink-950)" }}>{value}</div>
      </div>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[0.75rem] border p-3 mb-2.5" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
      <div className="mb-1.5 text-[0.625rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-300)" }}>{title}</div>
      {children}
    </div>
  );
}

function SummaryRow({ label, value, bold, danger }: { label: string; value: string; bold?: boolean; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-[0.75rem]" style={{ color: bold ? "var(--color-ink-950)" : "var(--color-ink-500)", fontWeight: bold ? 600 : 400 }}>{label}</span>
      <span className="text-[0.8125rem] tabular-nums font-semibold" style={{ color: danger ? "var(--color-stop)" : "var(--color-ink-950)" }}>{value}</span>
    </div>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--color-concrete)" }}>
      <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: "var(--color-go)" }} />
    </div>
  );
}

function HistoryTable({
  payments,
  currentId,
}: {
  payments: { id: string; date: string; mode: string; ref: string | null; amount: number }[];
  currentId: string;
}) {
  return (
    <div className="overflow-hidden rounded-[0.5rem] border" style={{ borderColor: "var(--color-line)" }}>
      <table className="w-full text-[0.6875rem]">
        <thead>
          <tr style={{ backgroundColor: "var(--color-concrete)" }}>
            <th className="px-2 py-1.5 text-left font-semibold" style={{ color: "var(--color-ink-500)" }}>Date</th>
            <th className="px-2 py-1.5 text-left font-semibold" style={{ color: "var(--color-ink-500)" }}>Mode</th>
            <th className="px-2 py-1.5 text-left font-semibold" style={{ color: "var(--color-ink-500)" }}>Ref</th>
            <th className="px-2 py-1.5 text-right font-semibold" style={{ color: "var(--color-ink-500)" }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.id} className="border-t" style={{ borderColor: "var(--color-line)", backgroundColor: p.id === currentId ? "var(--color-concrete)" : "transparent" }}>
              <td className="px-2 py-1.5" style={{ color: "var(--color-ink-900)" }}>{formatDate(p.date)}</td>
              <td className="px-2 py-1.5" style={{ color: "var(--color-ink-700)" }}>{p.mode.replace(/_/g, " ")}</td>
              <td className="px-2 py-1.5 font-mono" style={{ color: "var(--color-ink-500)" }}>{p.ref ?? "—"}</td>
              <td className="px-2 py-1.5 text-right tabular-nums font-semibold" style={{ color: "var(--color-ink-950)" }}>{formatCurrency(p.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Asset sale receipt view ─────────────────────────────────────────────────

async function AssetReceiptView({ id, companyId, companyName }: { id: string; companyId: string; companyName: string }) {
  const payment = await prisma.assetSalePayment.findFirst({
    where: { id, assetSale: { companyId } },
    include: {
      assetSale: {
        include: {
          customer: { select: { name: true, phone: true, address: true, gstin: true } },
          project: { select: { name: true } },
          builtUnit: { select: { unitNumber: true, unitType: true, floor: true, wing: true, area: true, areaUnit: true } },
          payments: { orderBy: { paymentDate: "asc" } },
        },
      },
    },
  });

  if (!payment) {
    return (
      <div>
        <MobileEmptyState icon={Wallet} title="Receipt not found" />
      </div>
    );
  }

  const sale = payment.assetSale;
  const amount = toNum(payment.amount);
  const salePrice = toNum(sale.salePrice);
  const gstRate = toNum(sale.gstRate);
  const gstAmount = toNum(sale.gstAmount);
  const total = salePrice + gstAmount;
  const totalPaid = (sale.payments ?? []).reduce((s, p: AssetPaymentSummary) => s + toNum(p.amount), 0);
  const balanceDue = total - totalPaid;
  const pctPaid = total > 0 ? Math.min(100, (totalPaid / total) * 100) : 0;

  const d = new Date(payment.paymentDate);
  const yymmdd = `${String(d.getFullYear()).slice(-2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const receiptNo = `RCP-${yymmdd}-${payment.id.slice(-4).toUpperCase()}`;
  const timeStr = d.toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });

  const assetLabel = sale.assetType === "LAND" ? "Land Plot" : "Built Unit";

  const landParcel =
    sale.assetType === "LAND" && sale.landParcelId
      ? await prisma.landParcel.findUnique({
          where: { id: sale.landParcelId },
          select: { number: true, area: true, areaUnit: true },
        })
      : null;

  const propertyDesc =
    sale.assetType === "BUILT_UNIT" && sale.builtUnit
      ? `${sale.builtUnit.unitNumber} · ${toNum(sale.builtUnit.area)} ${sale.builtUnit.areaUnit}${sale.builtUnit.floor != null ? ` · Fl ${sale.builtUnit.floor}` : ""}${sale.builtUnit.wing ? ` · ${sale.builtUnit.wing}` : ""}`
      : sale.assetType === "LAND" && landParcel
        ? `Plot ${landParcel.number} · ${toNum(landParcel.area)} ${landParcel.areaUnit}`
        : assetLabel;

  const history = (sale.payments ?? []).map((p: AssetPaymentSummary) => ({
    id: p.id,
    date: p.paymentDate.toISOString(),
    mode: p.mode,
    ref: p.reference,
    amount: toNum(p.amount),
  }));

  return (
    <DetailShell
      receiptNo={receiptNo}
      kindLabel="Property Sale"
      amount={amount}
      printUrl={`/print/payment-receipt/${payment.id}`}
      shareTitle={`Receipt ${receiptNo} — ${companyName}`}
      shareText={`Payment receipt ${receiptNo} for ${formatCurrency(amount)} from ${sale.customer.name}`}
    >
      <SectionCard title="Received From">
        <FieldRow icon={User} label="Customer" value={sale.customer.name} />
        {sale.customer.address && <FieldRow icon={Building2} label="Address" value={sale.customer.address} />}
        {sale.customer.phone && <FieldRow icon={FileText} label="Phone" value={sale.customer.phone} />}
        {sale.customer.gstin && <FieldRow icon={Hash} label="GSTIN" value={sale.customer.gstin} mono />}
      </SectionCard>

      <SectionCard title="Against Sale">
        <FieldRow icon={FileText} label="Sale No." value={sale.saleNumber} mono />
        <FieldRow icon={Building2} label="Project" value={sale.project.name} />
        <FieldRow icon={Building2} label="Property" value={propertyDesc} />
        <FieldRow icon={CalendarDays} label="Sale Date" value={formatDate(sale.saleDate)} />
      </SectionCard>

      <SectionCard title="Payment">
        <FieldRow icon={CalendarDays} label="Date / Time" value={`${formatDate(payment.paymentDate)} · ${timeStr}`} />
        <FieldRow icon={IndianRupee} label="Mode" value={payment.mode.replace(/_/g, " ")} />
        {payment.reference && <FieldRow icon={Hash} label="Reference" value={payment.reference} mono />}
      </SectionCard>

      <SectionCard title="Account Summary">
        <SummaryRow label="Sale Value" value={formatCurrency(salePrice)} />
        {gstAmount > 0 && <SummaryRow label={`GST @ ${gstRate}%`} value={formatCurrency(gstAmount)} />}
        <SummaryRow label="Total Payable (incl. GST)" value={formatCurrency(total)} bold />
        <SummaryRow label="Total Received Till Date" value={formatCurrency(totalPaid)} />
        <SummaryRow label="Balance Due" value={formatCurrency(balanceDue)} bold danger />
        <SummaryRow label="Payment Progress" value={`${pctPaid.toFixed(1)}%`} />
        <ProgressBar pct={pctPaid} />
      </SectionCard>

      <SectionCard title={`Payment History (${sale.payments.length})`}>
        <HistoryTable payments={history} currentId={payment.id} />
      </SectionCard>
    </DetailShell>
  );
}

// ── Material sale receipt view ──────────────────────────────────────────────

async function MaterialReceiptView({ id, companyId, companyName }: { id: string; companyId: string; companyName: string }) {
  const payment = await prisma.materialSalePayment.findFirst({
    where: { id, sale: { companyId } },
    include: {
      sale: {
        include: {
          customer: { select: { name: true, phone: true, address: true, gstin: true } },
          project: { select: { name: true } },
          lines: { include: { material: { select: { name: true, code: true, unit: true } } }, orderBy: { material: { name: "asc" } } },
          payments: { orderBy: { paymentDate: "asc" } },
        },
      },
    },
  });

  if (!payment) {
    return (
      <div>
        <MobileEmptyState icon={Printer} title="Receipt not found" />
      </div>
    );
  }

  const sale = payment.sale;
  const amount = toNum(payment.amount);
  const subtotal = toNum(sale.subtotal);
  const gstTotal = toNum(sale.gstTotal);
  const total = toNum(sale.totalAmount);
  const totalPaid = sale.payments.reduce((s, p: MaterialPaymentSummary) => s + toNum(p.amount), 0);
  const balanceDue = total - totalPaid;
  const pctPaid = total > 0 ? Math.min(100, (totalPaid / total) * 100) : 0;
  const partyName = sale.partyName ?? sale.customer.name;

  const d = new Date(payment.paymentDate);
  const yymmdd = `${String(d.getFullYear()).slice(-2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const receiptNo = `MSR-${yymmdd}-${payment.id.slice(-4).toUpperCase()}`;
  const timeStr = d.toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });

  const history = sale.payments.map((p: MaterialPaymentSummary) => ({
    id: p.id,
    date: p.paymentDate.toISOString(),
    mode: p.paymentMode,
    ref: p.referenceNo,
    amount: toNum(p.amount),
  }));

  return (
    <DetailShell
      receiptNo={receiptNo}
      kindLabel="Material Sale"
      amount={amount}
      printUrl={`/print/material-sale-receipt/${payment.id}`}
      shareTitle={`Receipt ${receiptNo} — ${companyName}`}
      shareText={`Payment receipt ${receiptNo} for ${formatCurrency(amount)} from ${partyName}`}
    >
      <SectionCard title="Received From">
        <FieldRow icon={User} label="Party" value={partyName} />
        {!sale.partyName && sale.customer.address && <FieldRow icon={Building2} label="Address" value={sale.customer.address} />}
        {!sale.partyName && sale.customer.phone && <FieldRow icon={FileText} label="Phone" value={sale.customer.phone} />}
        {!sale.partyName && sale.customer.gstin && <FieldRow icon={Hash} label="GSTIN" value={sale.customer.gstin} mono />}
      </SectionCard>

      <SectionCard title="Against Sale">
        <FieldRow icon={FileText} label="Sale No." value={sale.saleNumber} mono />
        <FieldRow icon={CalendarDays} label="Sale Date" value={formatDate(sale.saleDate)} />
        {sale.project && <FieldRow icon={Building2} label="Project" value={sale.project.name} />}
      </SectionCard>

      <SectionCard title="Line Items">
        <div className="overflow-hidden rounded-[0.5rem] border" style={{ borderColor: "var(--color-line)" }}>
          <table className="w-full text-[0.6875rem]">
            <thead>
              <tr style={{ backgroundColor: "var(--color-concrete)" }}>
                <th className="px-2 py-1.5 text-left font-semibold" style={{ color: "var(--color-ink-500)" }}>Item</th>
                <th className="px-2 py-1.5 text-right font-semibold" style={{ color: "var(--color-ink-500)" }}>Qty</th>
                <th className="px-2 py-1.5 text-right font-semibold" style={{ color: "var(--color-ink-500)" }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {sale.lines.map((l) => (
                <tr key={l.id} className="border-t" style={{ borderColor: "var(--color-line)" }}>
                  <td className="px-2 py-1.5" style={{ color: "var(--color-ink-900)" }}>{l.material.name}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: "var(--color-ink-700)" }}>{toNum(l.qty)} {l.material.unit}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: "var(--color-ink-950)" }}>{formatCurrency(toNum(l.qty) * toNum(l.unitPrice))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Payment">
        <FieldRow icon={CalendarDays} label="Date / Time" value={`${formatDate(payment.paymentDate)} · ${timeStr}`} />
        <FieldRow icon={IndianRupee} label="Mode" value={payment.paymentMode.replace(/_/g, " ")} />
        {payment.referenceNo && <FieldRow icon={Hash} label="Reference" value={payment.referenceNo} mono />}
      </SectionCard>

      <SectionCard title="Account Summary">
        <SummaryRow label="Subtotal" value={formatCurrency(subtotal)} />
        {gstTotal > 0 && <SummaryRow label="GST" value={formatCurrency(gstTotal)} />}
        <SummaryRow label="Total Sale Value (incl. GST)" value={formatCurrency(total)} bold />
        <SummaryRow label="Total Received Till Date" value={formatCurrency(totalPaid)} />
        <SummaryRow label="Balance Due" value={formatCurrency(balanceDue)} bold danger />
        <SummaryRow label="Payment Progress" value={`${pctPaid.toFixed(1)}%`} />
        <ProgressBar pct={pctPaid} />
      </SectionCard>

      <SectionCard title={`Payment History (${sale.payments.length})`}>
        <HistoryTable payments={history} currentId={payment.id} />
      </SectionCard>
    </DetailShell>
  );
}

// ── Shared shell (hero + amount + actions + children) ───────────────────────

function DetailShell({
  receiptNo,
  kindLabel,
  amount,
  printUrl,
  shareTitle,
  shareText,
  children,
}: {
  receiptNo: string;
  kindLabel: string;
  amount: number;
  printUrl: string;
  shareTitle: string;
  shareText: string;
  children: React.ReactNode;
}) {
  const words = amountInWords(amount);
  return (
    <div>
      <div className="mb-3">
      </div>

      {/* Hero — receipt no + amount */}
      <div className="rounded-[0.875rem] border p-3.5 mb-2.5" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[0.625rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-300)" }}>Receipt No.</div>
            <div className="font-mono text-[0.9375rem] font-bold" style={{ color: "var(--color-ink-950)" }}>{receiptNo}</div>
          </div>
          <span className="rounded-full px-2 py-0.5 text-[0.5625rem] font-semibold uppercase" style={{ backgroundColor: "var(--color-concrete)", color: "var(--color-ink-500)" }}>{kindLabel}</span>
        </div>
        <div className="mt-3 flex items-baseline justify-between">
          <span className="text-[0.625rem] font-semibold uppercase" style={{ color: "var(--color-ink-300)" }}>Amount Received</span>
          <span className="text-[1.5rem] font-bold tabular-nums" style={{ color: "var(--color-go)" }}>{formatCurrency(amount)}</span>
        </div>
        <div className="mt-1 text-[0.6875rem] italic" style={{ color: "var(--color-ink-500)" }}>In words: {words} only</div>
      </div>

      {children}

      {/* Actions */}
      <div className="mt-3 mb-6">
        <ReceiptActions printUrl={printUrl} shareTitle={shareTitle} shareText={shareText} />
      </div>
    </div>
  );
}
