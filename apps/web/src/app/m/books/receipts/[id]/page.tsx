import { Suspense } from "react";
import { connection } from "next/server";
import { Wallet, Printer } from "lucide-react";
import { MobileSkeletonDetail } from "@/components/mobile/mobile-skeleton";
import { MobileEmptyState } from "@/components/mobile/v2/primitives";
import { prisma } from "@nirman/db";
import { amountInWords } from "@nirman/services";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatCurrency, formatDate } from "@/lib/utils";
import { notFound } from "next/navigation";
import { ReceiptActions } from "./ReceiptActions";
import { PageContextProvider } from "@/components/mobile/v2/page-context";
import {
  DetailHeroCard,
  DetailProgress,
  DetailKeyValue,
  DetailKeyValueCard,
} from "@/components/mobile/v2/detail-primitives";

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
    <Suspense fallback={<MobileSkeletonDetail sections={6} />}>
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

function HistoryTable({
  payments,
  currentId,
}: {
  payments: { id: string; date: string; mode: string; ref: string | null; amount: number }[];
  currentId: string;
}) {
  return (
    <div className="overflow-hidden rounded-[0.5rem] border" style={{ borderColor: "var(--color-line)" }}>
      <table className="w-full text-m-body">
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

  // ── Build detail card entries (conditional on customer fields) ──
  const receivedFromEntries: { label: string; value: string; mono?: boolean }[] = [
    { label: "Customer", value: sale.customer.name },
    ...(sale.customer.address ? [{ label: "Address", value: sale.customer.address }] : []),
    ...(sale.customer.phone ? [{ label: "Phone", value: sale.customer.phone }] : []),
    ...(sale.customer.gstin ? [{ label: "GSTIN", value: sale.customer.gstin, mono: true }] : []),
  ];

  const againstSaleEntries: { label: string; value: string; mono?: boolean }[] = [
    { label: "Sale No.", value: sale.saleNumber, mono: true },
    { label: "Project", value: sale.project?.name ?? "Standalone" },
    { label: "Property", value: propertyDesc },
    { label: "Sale Date", value: formatDate(sale.saleDate) },
  ];

  const paymentEntries: { label: string; value: string; mono?: boolean }[] = [
    { label: "Date / Time", value: `${formatDate(payment.paymentDate)} · ${timeStr}` },
    { label: "Mode", value: payment.mode.replace(/_/g, " ") },
    ...(payment.reference ? [{ label: "Reference", value: payment.reference, mono: true }] : []),
  ];

  return (
    <PageContextProvider value={{
      entityType: "assetReceipt",
      label: receiptNo,
      subtitle: sale.customer.name,
      recordId: payment.id,
    }}>
    <DetailShell
      receiptNo={receiptNo}
      kindLabel="Property Sale"
      amount={amount}
      printUrl={`/print/payment-receipt/${payment.id}`}
      shareTitle={`Receipt ${receiptNo} — ${companyName}`}
      shareText={`Payment receipt ${receiptNo} for ${formatCurrency(amount)} from ${sale.customer.name}`}
    >
      <DetailKeyValueCard title="Received From" entries={receivedFromEntries} />

      <DetailKeyValueCard title="Against Sale" entries={againstSaleEntries} />

      <DetailKeyValueCard title="Payment" entries={paymentEntries} />

      {/* Account Summary — key/value rows + progress bar in one card */}
      <div
        className="rounded-[0.625rem] border p-3 mb-3"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <p className="text-m-caption font-bold uppercase tracking-wider mb-1" style={{ color: "var(--color-steel)" }}>
          Account Summary
        </p>
        <dl className="divide-y" style={{ borderColor: "var(--color-line)" }}>
          <DetailKeyValue label="Sale Value" value={formatCurrency(salePrice)} />
          {gstAmount > 0 && <DetailKeyValue label={`GST @ ${gstRate}%`} value={formatCurrency(gstAmount)} />}
          <DetailKeyValue label="Total Payable (incl. GST)" value={formatCurrency(total)} />
          <DetailKeyValue label="Total Received Till Date" value={formatCurrency(totalPaid)} />
          <DetailKeyValue label="Balance Due" value={formatCurrency(balanceDue)} tone="stop" />
        </dl>
        <DetailProgress
          label="Payment Progress"
          value={`${pctPaid.toFixed(1)}%`}
          pct={pctPaid}
          tone="go"
        />
      </div>

      {/* Payment History */}
      <div
        className="rounded-[0.625rem] border p-3 mb-3"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <p className="text-m-caption font-bold uppercase tracking-wider mb-2" style={{ color: "var(--color-steel)" }}>
          {`Payment History (${sale.payments.length})`}
        </p>
        <HistoryTable payments={history} currentId={payment.id} />
      </div>
    </DetailShell>
    </PageContextProvider>
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

  // ── Build detail card entries (conditional on party/customer fields) ──
  const receivedFromEntries: { label: string; value: string; mono?: boolean }[] = [
    { label: "Party", value: partyName },
    ...(!sale.partyName && sale.customer.address ? [{ label: "Address", value: sale.customer.address }] : []),
    ...(!sale.partyName && sale.customer.phone ? [{ label: "Phone", value: sale.customer.phone }] : []),
    ...(!sale.partyName && sale.customer.gstin ? [{ label: "GSTIN", value: sale.customer.gstin, mono: true }] : []),
  ];

  const againstSaleEntries: { label: string; value: string; mono?: boolean }[] = [
    { label: "Sale No.", value: sale.saleNumber, mono: true },
    { label: "Sale Date", value: formatDate(sale.saleDate) },
    ...(sale.project ? [{ label: "Project", value: sale.project.name }] : []),
  ];

  const paymentEntries: { label: string; value: string; mono?: boolean }[] = [
    { label: "Date / Time", value: `${formatDate(payment.paymentDate)} · ${timeStr}` },
    { label: "Mode", value: payment.paymentMode.replace(/_/g, " ") },
    ...(payment.referenceNo ? [{ label: "Reference", value: payment.referenceNo, mono: true }] : []),
  ];

  return (
    <PageContextProvider value={{
      entityType: "materialReceipt",
      label: receiptNo,
      subtitle: partyName,
      recordId: payment.id,
    }}>
    <DetailShell
      receiptNo={receiptNo}
      kindLabel="Material Sale"
      amount={amount}
      printUrl={`/print/material-sale-receipt/${payment.id}`}
      shareTitle={`Receipt ${receiptNo} — ${companyName}`}
      shareText={`Payment receipt ${receiptNo} for ${formatCurrency(amount)} from ${partyName}`}
    >
      <DetailKeyValueCard title="Received From" entries={receivedFromEntries} />

      <DetailKeyValueCard title="Against Sale" entries={againstSaleEntries} />

      {/* Line Items */}
      <div
        className="rounded-[0.625rem] border p-3 mb-3"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <p className="text-m-caption font-bold uppercase tracking-wider mb-2" style={{ color: "var(--color-steel)" }}>
          Line Items
        </p>
        <div className="overflow-hidden rounded-[0.5rem] border" style={{ borderColor: "var(--color-line)" }}>
          <table className="w-full text-m-body">
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
      </div>

      <DetailKeyValueCard title="Payment" entries={paymentEntries} />

      {/* Account Summary — key/value rows + progress bar in one card */}
      <div
        className="rounded-[0.625rem] border p-3 mb-3"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <p className="text-m-caption font-bold uppercase tracking-wider mb-1" style={{ color: "var(--color-steel)" }}>
          Account Summary
        </p>
        <dl className="divide-y" style={{ borderColor: "var(--color-line)" }}>
          <DetailKeyValue label="Subtotal" value={formatCurrency(subtotal)} />
          {gstTotal > 0 && <DetailKeyValue label="GST" value={formatCurrency(gstTotal)} />}
          <DetailKeyValue label="Total Sale Value (incl. GST)" value={formatCurrency(total)} />
          <DetailKeyValue label="Total Received Till Date" value={formatCurrency(totalPaid)} />
          <DetailKeyValue label="Balance Due" value={formatCurrency(balanceDue)} tone="stop" />
        </dl>
        <DetailProgress
          label="Payment Progress"
          value={`${pctPaid.toFixed(1)}%`}
          pct={pctPaid}
          tone="go"
        />
      </div>

      {/* Payment History */}
      <div
        className="rounded-[0.625rem] border p-3 mb-3"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <p className="text-m-caption font-bold uppercase tracking-wider mb-2" style={{ color: "var(--color-steel)" }}>
          {`Payment History (${sale.payments.length})`}
        </p>
        <HistoryTable payments={history} currentId={payment.id} />
      </div>
    </DetailShell>
    </PageContextProvider>
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
      <DetailHeroCard
        icon={Wallet}
        title={receiptNo}
        titleMono
        status={kindLabel}
      >
        <div className="mt-3 flex items-baseline justify-between">
          <span className="text-m-label font-semibold uppercase" style={{ color: "var(--color-ink-300)" }}>Amount Received</span>
          <span className="text-m-section font-bold tabular-nums" style={{ color: "var(--color-go)" }}>{formatCurrency(amount)}</span>
        </div>
        <div className="mt-1 text-m-body italic" style={{ color: "var(--color-ink-500)" }}>In words: {words} only</div>
      </DetailHeroCard>

      {children}

      {/* Actions */}
      <div className="mt-3 mb-6">
        <ReceiptActions printUrl={printUrl} shareTitle={shareTitle} shareText={shareText} />
      </div>
    </div>
  );
}
