import { connection } from "next/server";
import { PrintButton } from "@/components/print/print-button";
import { prisma } from "@nirman/db";
import { toNum, getUserRole, getCompany } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { amountInWords } from "@nirman/services";
import { formatCurrency, formatDate } from "@/lib/utils";
import { notFound } from "next/navigation";

type AssetPaymentSummary = { id: string; paymentDate: Date; mode: string; reference: string | null; amount: unknown };

/**
 * Print-friendly Payment Receipt — for individual payments received against an
 * asset sale (property / land). Industry-grade layout matching Indian
 * construction / real-estate receipt vouchers:
 *  - Company letterhead (name, address, GSTIN, PAN)
 *  - Sequential receipt no + date/time
 *  - Received-from party block (name, address, phone, GSTIN)
 *  - Property particulars (project, unit/plot, type, area, floor, wing)
 *  - Amount received box + amount in words
 *  - Payment mode + instrument reference (cheque / UTR / UPI)
 *  - Account summary (sale value, GST, total, received till date, balance, % paid)
 *  - Full payment history table for the sale
 *  - Terms & conditions + signature blocks
 *
 * Opened in a new tab from the Sale detail dialog (desktop) or the mobile
 * receipt detail page (/m/books/receipts/[id]).
 */
export default async function PaymentReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;

  const role = await getUserRole();
  if (!hasPermission(role, PERM.SALES_VIEW)) {
    notFound();
  }
  const company = await getCompany();

  const payment = await prisma.assetSalePayment.findFirst({
    where: { id },
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

  if (!payment || !payment.assetSale) notFound();

  // Guard against cross-company access
  if (payment.assetSale.companyId !== company.id) notFound();

  const sale = payment.assetSale;
  const amount = toNum(payment.amount);
  const words = amountInWords(amount);
  const salePrice = toNum(sale.salePrice);
  const gstRate = toNum(sale.gstRate);
  const gstAmount = toNum(sale.gstAmount);
  const total = salePrice + gstAmount;
  const totalPaid = (sale.payments ?? []).reduce((s, p: AssetPaymentSummary) => s + toNum(p.amount), 0);
  const balanceDue = total - totalPaid;
  const pctPaid = total > 0 ? Math.min(100, (totalPaid / total) * 100) : 0;

  // Stable, human-readable receipt number derived from payment date + id tail.
  const d = new Date(payment.paymentDate);
  const yymmdd = `${String(d.getFullYear()).slice(-2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const receiptNo = `RCP-${yymmdd}-${payment.id.slice(-4).toUpperCase()}`;

  const assetLabel = sale.assetType === "LAND" ? "Land Plot" : "Built Unit";

  // Fetch land parcel separately because the Prisma relation is not declared.
  const landParcel =
    sale.assetType === "LAND" && sale.landParcelId
      ? await prisma.landParcel.findUnique({
          where: { id: sale.landParcelId },
          select: { number: true, area: true, areaUnit: true },
        })
      : null;

  // Property particulars
  let propertyLines: string[] = [];
  if (sale.assetType === "BUILT_UNIT" && sale.builtUnit) {
    const u = sale.builtUnit;
    propertyLines = [
      `${assetLabel} · ${u.unitNumber}`,
      `Type: ${u.unitType.replace(/_/g, " ")}`,
      u.floor != null ? `Floor: ${u.floor}` : "",
      u.wing ? `Wing: ${u.wing}` : "",
      `Area: ${toNum(u.area)} ${u.areaUnit}`,
    ].filter(Boolean);
  } else if (sale.assetType === "LAND" && landParcel) {
    const p = landParcel;
    propertyLines = [
      `${assetLabel} · Plot ${p.number}`,
      `Area: ${toNum(p.area)} ${p.areaUnit}`,
    ];
  } else {
    propertyLines = [assetLabel];
  }

  const timeStr = d.toLocaleString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  return (
    <div className="print-page mx-auto max-w-2xl bg-white p-8 text-black print:p-4">
      {/* ── Letterhead ── */}
      <div className="flex items-start justify-between border-b-2 border-black pb-3">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-wide">{company.name}</h1>
          {company.address && <div className="text-xs text-gray-600">{company.address}</div>}
          <div className="mt-0.5 text-xs text-gray-700">
            {company.gstin && <span className="mr-3">GSTIN: {company.gstin}</span>}
            {company.pan && <span>PAN: {company.pan}</span>}
          </div>
        </div>
        <div className="text-right text-sm">
          <div className="text-xs font-semibold uppercase text-gray-500">Receipt No.</div>
          <div className="font-mono font-bold">{receiptNo}</div>
          <div className="mt-1 text-gray-600">{formatDate(payment.paymentDate)} · {timeStr}</div>
        </div>
      </div>

      <h2 className="mt-3 text-center text-lg font-bold uppercase tracking-widest text-gray-700">
        Money Receipt
      </h2>

      {/* ── Party + property blocks ── */}
      <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div className="border border-gray-300 p-2.5">
          <div className="text-xs font-semibold uppercase text-gray-500">Received From</div>
          <div className="font-medium">{sale.customer.name}</div>
          {sale.customer.address && <div className="text-gray-600">{sale.customer.address}</div>}
          {sale.customer.phone && <div className="text-gray-600">Ph: {sale.customer.phone}</div>}
          {sale.customer.gstin && <div className="text-gray-600">GSTIN: {sale.customer.gstin}</div>}
        </div>
        <div className="border border-gray-300 p-2.5">
          <div className="text-xs font-semibold uppercase text-gray-500">Against Sale</div>
          <div className="font-mono font-medium">{sale.saleNumber}</div>
          <div className="text-gray-600">Project: {sale.project.name}</div>
          {propertyLines.map((l, i) => (
            <div key={i} className="text-gray-600">{l}</div>
          ))}
        </div>
      </div>

      {/* ── Amount received box ── */}
      <div className="mt-4 rounded-md border-2 border-black p-4">
        <div className="flex items-baseline justify-between">
          <div className="text-xs font-semibold uppercase text-gray-500">Amount Received</div>
          <div className="text-2xl font-bold tnum">{formatCurrency(amount)}</div>
        </div>
        <div className="mt-1 text-sm italic text-gray-600">Rupees (in words): {words} only</div>
      </div>

      {/* ── Payment instrument ── */}
      <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-xs font-semibold uppercase text-gray-500">Payment Mode</div>
          <div className="font-medium">{payment.mode.replace(/_/g, " ")}</div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase text-gray-500">Instrument / Reference</div>
          <div className="font-medium font-mono">{payment.reference ?? "—"}</div>
        </div>
      </div>

      {/* ── Account summary ── */}
      <div className="mt-4 rounded-md border border-gray-300 p-3">
        <div className="mb-2 text-xs font-semibold uppercase text-gray-500">Account Summary</div>
        <table className="w-full text-sm">
          <tbody>
            <tr>
              <td className="py-0.5 text-gray-600">Sale Value</td>
              <td className="py-0.5 text-right tnum">{formatCurrency(salePrice)}</td>
            </tr>
            {gstAmount > 0 && (
              <tr>
                <td className="py-0.5 text-gray-600">GST @ {gstRate}%</td>
                <td className="py-0.5 text-right tnum">{formatCurrency(gstAmount)}</td>
              </tr>
            )}
            <tr className="border-t border-gray-300">
              <td className="py-0.5 font-semibold">Total Payable (incl. GST)</td>
              <td className="py-0.5 text-right font-semibold tnum">{formatCurrency(total)}</td>
            </tr>
            <tr>
              <td className="py-0.5 text-gray-600">Total Received Till Date</td>
              <td className="py-0.5 text-right tnum">{formatCurrency(totalPaid)}</td>
            </tr>
            <tr className="border-t border-gray-300">
              <td className="pt-1 font-semibold">Balance Due</td>
              <td className="pt-1 text-right font-bold tnum text-red-600">{formatCurrency(balanceDue)}</td>
            </tr>
            <tr>
              <td className="py-0.5 text-gray-600">Payment Progress</td>
              <td className="py-0.5 text-right tnum">{pctPaid.toFixed(1)}%</td>
            </tr>
          </tbody>
        </table>
        {/* Progress bar */}
        <div className="mt-2 h-1.5 w-full rounded-full bg-gray-200">
          <div className="h-1.5 rounded-full bg-black" style={{ width: `${pctPaid}%` }} />
        </div>
      </div>

      {/* ── Payment history ── */}
      <div className="mt-4">
        <div className="mb-1 text-xs font-semibold uppercase text-gray-500">Payment History</div>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-black">
              <th className="px-2 py-1 text-left font-semibold">#</th>
              <th className="px-2 py-1 text-left font-semibold">Date</th>
              <th className="px-2 py-1 text-left font-semibold">Mode</th>
              <th className="px-2 py-1 text-left font-semibold">Reference</th>
              <th className="px-2 py-1 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {(sale.payments ?? []).map((p: AssetPaymentSummary, i: number) => (
              <tr key={p.id} className={`border-b border-gray-200 ${p.id === payment.id ? "bg-gray-100 font-semibold" : ""}`}>
                <td className="px-2 py-1 text-center">{i + 1}</td>
                <td className="px-2 py-1">{formatDate(p.paymentDate)}</td>
                <td className="px-2 py-1">{p.mode.replace(/_/g, " ")}</td>
                <td className="px-2 py-1 font-mono">{p.reference ?? "—"}</td>
                <td className="px-2 py-1 text-right tnum">{formatCurrency(toNum(p.amount))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-black">
              <td colSpan={4} className="px-2 py-1.5 text-right font-bold">Total Received:</td>
              <td className="px-2 py-1.5 text-right font-bold tnum">{formatCurrency(totalPaid)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ── Terms ── */}
      <div className="mt-4 border-t border-gray-300 pt-2 text-xs text-gray-600">
        <div className="font-semibold text-gray-700">Terms &amp; Conditions:</div>
        <ol className="ml-4 list-decimal space-y-0.5">
          <li>This receipt acknowledges receipt of payment towards the sale mentioned above.</li>
          <li>Final sale deed / title transfer is subject to full payment as per the agreed schedule.</li>
          <li>Any discrepancy must be reported within 7 days of receipt date.</li>
          <li>Subject to local jurisdiction; this is a computer-generated receipt and does not require a physical signature.</li>
        </ol>
      </div>

      {/* ── Signature blocks ── */}
      <div className="mt-12 grid grid-cols-2 gap-12 text-center text-sm">
        <div className="border-t border-black pt-1">Customer Signature</div>
        <div className="border-t border-black pt-1">For {company.name}</div>
      </div>

      {/* Print button (hidden when printing) */}
      <div className="mt-8 text-center print:hidden">
        <PrintButton label="Print Receipt" />
      </div>
    </div>
  );
}
