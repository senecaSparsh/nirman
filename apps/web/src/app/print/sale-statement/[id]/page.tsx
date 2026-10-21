import { connection } from "next/server";
import { notFound } from "next/navigation";
import { prisma } from "@nirman/db";
import { getCompany, getCurrentUser, toNum, getUserPermissions, scopeWhere } from "@/lib/server";
import { getPortalCustomer } from "@/lib/portal-auth";
import { PERM } from "@/lib/roles";
import { PrintToolbar } from "@/components/print/print-button";
import { PrintHeader } from "@/components/print/print-header";
import { formatCurrency, formatDate, formatEnumLabel } from "@/lib/utils";
import { amountInWords, computeLateInterest } from "@nirman/services";

/**
 * Allottee Statement — the buyer's account statement: the full installment
 * schedule (paid / due / waived), the payment ledger, accrued late interest,
 * and the net balance. Printable to PDF; open to staff AND the logged-in
 * portal customer (their own sale only).
 */
export default async function SaleStatementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;

  const saleInclude = {
    customer: { select: { name: true, phone: true, email: true, address: true } },
    project: { select: { name: true } },
    builtUnit: { select: { unitNumber: true } },
    landParcel: { select: { number: true } },
    paymentSchedule: { include: { items: { orderBy: { installmentNo: "asc" as const } } } },
    payments: { where: { status: { not: "VOID" as const } }, orderBy: { paymentDate: "asc" as const } },
  } as const;

  let company: { id: string; name: string; address: string | null; gstin: string | null; phone: string | null; email: string | null; upiId?: string | null } | null = null;
  let sale = null;

  const user = await getCurrentUser();
  if (user) {
    const __effPerms = await getUserPermissions();
    if (!__effPerms.includes(PERM.SALES_VIEW)) {
      return <div className="p-8 text-center text-muted-foreground">No access</div>;
    }
    company = await getCompany();
    sale = await prisma.assetSale.findFirst({
      where: { id, companyId: company.id, ...(await scopeWhere("AssetSale")) },
      include: saleInclude,
    });
  } else {
    // Portal: the statement belongs to the logged-in customer's sale only.
    const customer = await getPortalCustomer();
    if (customer) {
      sale = await prisma.assetSale.findFirst({
        where: { id, customerId: customer.id },
        include: saleInclude,
      });
      if (sale?.companyId) {
        company = await prisma.company.findUnique({
          where: { id: sale.companyId },
          select: { id: true, name: true, address: true, gstin: true, phone: true, email: true, upiId: true },
        });
      }
    }
  }

  if (!sale || !company) notFound();

  const items = sale.paymentSchedule?.items ?? [];
  const scheduleTotal = items.reduce((s, i) => s + toNum(i.totalAmount), 0);
  const clearedPayments = sale.payments.filter((p) => p.chequeStatus !== "PENDING" && p.chequeStatus !== "BOUNCED");
  const totalPaid = clearedPayments.reduce((s, p) => s + toNum(p.amount) - toNum(p.interestAmount), 0);
  const totalAccrued = items.reduce(
    (s, i) => s + (i.status === "PAID" || i.status === "WAIVED" ? 0 : Number(computeLateInterest({ totalAmount: i.totalAmount, paidAmount: i.paidAmount, dueDate: i.dueDate })?.interest ?? 0)),
    0,
  );
  const balanceDue = Math.max(0, scheduleTotal > 0 ? scheduleTotal - totalPaid : toNum(sale.salePrice) + toNum(sale.gstAmount) - toNum(sale.tdsAmount) - totalPaid);
  const unit = sale.builtUnit?.unitNumber ?? sale.landParcel?.number ?? "—";

  return (
    <div className="mx-auto max-w-[21cm] bg-white p-8 font-serif text-[13px] leading-relaxed text-slate-900 print:p-0">
      <PrintToolbar title="Allottee Statement" />
      <PrintHeader company={company} title="Statement of Account" docNumber={`STMT-${sale.saleNumber}`} date={new Date()} />

      <div className="mt-4 rounded border border-slate-200 p-3 text-[12px]">
        <div><strong>Allottee:</strong> {sale.customer.name}</div>
        <div><strong>Unit:</strong> {unit} · <strong>Project:</strong> {sale.project?.name ?? "—"} · <strong>Sale:</strong> {sale.saleNumber}</div>
        <div><strong>Statement date:</strong> {formatDate(new Date())}</div>
      </div>

      {items.length > 0 && (
        <table className="mt-4 w-full border-collapse text-[11.5px]">
          <thead>
            <tr className="border-b-2 border-slate-800 text-left">
              <th className="py-1.5">#</th>
              <th className="py-1.5">Installment</th>
              <th className="py-1.5 text-right">Due Date</th>
              <th className="py-1.5 text-right">Amount</th>
              <th className="py-1.5 text-right">Paid</th>
              <th className="py-1.5 text-right">Interest*</th>
              <th className="py-1.5 text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => {
              const accrued = i.status === "PAID" || i.status === "WAIVED" ? 0 : Number(computeLateInterest({ totalAmount: i.totalAmount, paidAmount: i.paidAmount, dueDate: i.dueDate })?.interest ?? 0);
              return (
                <tr key={i.id} className="border-b border-slate-200">
                  <td className="py-1.5">{i.installmentNo}</td>
                  <td className="py-1.5">{i.description}</td>
                  <td className="py-1.5 text-right">{i.dueDate ? formatDate(i.dueDate) : "—"}</td>
                  <td className="py-1.5 text-right">{formatCurrency(toNum(i.totalAmount))}</td>
                  <td className="py-1.5 text-right">{formatCurrency(toNum(i.paidAmount))}</td>
                  <td className="py-1.5 text-right">{accrued > 0 ? formatCurrency(accrued) : "—"}</td>
                  <td className={`py-1.5 text-right font-medium ${i.status === "PAID" ? "text-emerald-700" : i.status === "WAIVED" ? "text-slate-500" : "text-red-700"}`}>
                    {formatEnumLabel(i.status)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <table className="mt-4 w-full border-collapse text-[11.5px]">
        <thead>
          <tr className="border-b-2 border-slate-800 text-left">
            <th className="py-1.5">Date</th>
            <th className="py-1.5">Mode</th>
            <th className="py-1.5">Reference</th>
            <th className="py-1.5 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {clearedPayments.map((p) => {
            const interest = toNum(p.interestAmount);
            const principal = toNum(p.amount) - interest;
            return (
              <tr key={p.id} className="border-b border-slate-200">
                <td className="py-1.5">{formatDate(p.paymentDate)}</td>
                <td className="py-1.5">{formatEnumLabel(p.mode)}</td>
                <td className="py-1.5">
                  {p.reference ?? "—"}
                  {interest > 0 && (
                    <span className="text-slate-500"> · principal {formatCurrency(principal)} + interest {formatCurrency(interest)}</span>
                  )}
                </td>
                <td className="py-1.5 text-right">{formatCurrency(toNum(p.amount))}</td>
              </tr>
            );
          })}
          {clearedPayments.length === 0 && (
            <tr><td colSpan={4} className="py-3 text-center text-slate-500">No payments received yet</td></tr>
          )}
        </tbody>
      </table>

      <div className="mt-4 flex justify-end">
        <div className="w-72 text-[12px]">
          <div className="flex justify-between py-1"><span>Total paid</span><span>{formatCurrency(totalPaid)}</span></div>
          {totalAccrued > 0 && (
            <div className="flex justify-between py-1 text-red-700"><span>Accrued late interest</span><span>{formatCurrency(totalAccrued)}</span></div>
          )}
          <div className="flex justify-between border-t-2 border-slate-800 py-1 font-bold">
            <span>Balance due</span><span>{formatCurrency(balanceDue + totalAccrued)}</span>
          </div>
          <div className="text-[10px] text-slate-500">{amountInWords(balanceDue + totalAccrued)}</div>
        </div>
      </div>

      <p className="mt-4 text-[10px] text-slate-500">
        *Late interest accrues at SBI MCLR + 2% p.a. on overdue installments per the agreement terms.
        This statement is system-generated and true to the seller&apos;s books as of {formatDate(new Date())}.
      </p>
    </div>
  );
}
