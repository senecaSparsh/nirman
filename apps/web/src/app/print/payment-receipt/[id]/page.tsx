import { connection } from "next/server";
import { PrintButton } from "@/components/print/print-button";
import { prisma } from "@nirman/db";
import { toNum, getUserRole, getCompany } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { amountInWords } from "@nirman/services";
import { formatCurrency, formatDate } from "@/lib/utils";
import { notFound } from "next/navigation";

/**
 * Print-friendly Payment Receipt — for individual payments received against an asset sale.
 * Shows the receipt number, customer, amount, mode, date, and balance due.
 * Opened in a new tab from the Sale detail dialog's payment history.
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
          customer: { select: { name: true, phone: true, address: true } },
          project: { select: { name: true } },
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
  const gstAmount = toNum(sale.gstAmount);
  const total = salePrice + gstAmount;
  const totalPaid = sale.payments.reduce((s, p) => s + toNum(p.amount), 0);
  const balanceDue = total - totalPaid;

  const assetLabel = sale.assetType === "LAND" ? "Land Plot" : "Built Unit";

  return (
    <div className="mx-auto max-w-2xl bg-white p-8 text-black print:p-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b-2 border-black pb-3">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-wide">{company.name}</h1>
          <h2 className="text-lg font-bold uppercase tracking-wide text-gray-700">Payment Receipt</h2>
        </div>
        <div className="text-right text-sm">
          <div className="font-mono font-bold">RCP-{payment.id.slice(-8).toUpperCase()}</div>
          <div className="text-gray-600">{formatDate(payment.paymentDate)}</div>
        </div>
      </div>

      {/* Receipt body */}
      <div className="mt-6 space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs font-semibold uppercase text-gray-500">Received From</div>
            <div className="font-medium">{sale.customer.name}</div>
            {sale.customer.phone && <div className="text-gray-600">Ph: {sale.customer.phone}</div>}
          </div>
          <div>
            <div className="text-xs font-semibold uppercase text-gray-500">Against Sale</div>
            <div className="font-mono font-medium">{sale.saleNumber}</div>
            <div className="text-gray-600">{assetLabel} · {sale.project.name}</div>
          </div>
        </div>

        {/* Amount box */}
        <div className="rounded-md border-2 border-black p-4">
          <div className="text-xs font-semibold uppercase text-gray-500">Amount Received</div>
          <div className="mt-1 text-2xl font-bold tnum">{formatCurrency(amount)}</div>
          <div className="mt-1 text-sm italic text-gray-600">Rupees: {words}</div>
        </div>

        {/* Payment details */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs font-semibold uppercase text-gray-500">Payment Mode</div>
            <div className="font-medium">{payment.mode.replace(/_/g, " ")}</div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase text-gray-500">Reference</div>
            <div className="font-medium">{payment.reference ?? "—"}</div>
          </div>
        </div>

        {/* Running balance */}
        <div className="rounded-md border border-gray-300 p-3">
          <div className="mb-2 text-xs font-semibold uppercase text-gray-500">Account Summary</div>
          <table className="w-full text-sm">
            <tbody>
              <tr>
                <td className="py-0.5 text-gray-600">Total Sale Value (incl. GST)</td>
                <td className="py-0.5 text-right tnum">{formatCurrency(total)}</td>
              </tr>
              <tr>
                <td className="py-0.5 text-gray-600">Total Received Till Date</td>
                <td className="py-0.5 text-right tnum">{formatCurrency(totalPaid)}</td>
              </tr>
              <tr className="border-t border-gray-300">
                <td className="pt-1 font-semibold">Balance Due</td>
                <td className="pt-1 text-right font-bold tnum text-red-600">{formatCurrency(balanceDue)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Signature blocks */}
      <div className="mt-12 grid grid-cols-2 gap-12 text-center text-sm">
        <div className="border-t border-black pt-1">Customer Signature</div>
        <div className="border-t border-black pt-1">For {company.name}</div>
      </div>

      {/* Footer note */}
      <div className="mt-6 text-center text-xs text-gray-500">
        This is a computer-generated receipt and does not require a physical signature.
      </div>

      {/* Print button (hidden when printing) */}
      <div className="mt-8 text-center print:hidden">
        <PrintButton label="Print Receipt" />
      </div>
    </div>
  );
}
