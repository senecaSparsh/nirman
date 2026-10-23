import { connection } from "next/server";
import { notFound } from "next/navigation";
import { prisma } from "@nirman/db";
import { getCompany, toNum, getUserPermissions, scopeWhere } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { PrintToolbar } from "@/components/print/print-button";
import { PrintHeader } from "@/components/print/print-header";
import { formatCurrency, formatDate } from "@/lib/utils";
import { projectEscrowLedgerBalance } from "@nirman/services";

/**
 * RERA Escrow Statement — the quarterly designated-account reconciliation a
 * RERA-registered project files (S.4(2)(l)(D) + Form 3 practice): cleared
 * collections, the 70% held, every certified withdrawal with its three
 * signatories, and the closing ledger balance from account 1060.
 *
 * Optional ?from=&to= window; defaults to the current FY quarter.
 */
export default async function EscrowStatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await connection();
  const { id } = await params;
  const { from, to } = await searchParams;
  const __effPerms = await getUserPermissions();
  if (!__effPerms.includes(PERM.FINANCE_VIEW) && !__effPerms.includes(PERM.PROJECTS_VIEW)) {
    return <div className="p-8 text-center text-muted-foreground">No access</div>;
  }
  const company = await getCompany();
  const project = await prisma.project.findFirst({
    where: { id, companyId: company.id, ...(await scopeWhere("Project")) },
  });
  if (!project || !project.escrowAccountNo) notFound();

  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;

  // Cleared collections in the window — same rule as the ledger: non-void,
  // non-pending, non-bounced, and principal-only (interest is income, not escrowed principal... it physically lands in escrow, but the 70% rule
  // is computed on allotment consideration — keep the statutory base clean).
  const payments = await prisma.assetSalePayment.findMany({
    where: {
      assetSale: { projectId: id },
      status: { not: "VOID" },
      OR: [{ chequeStatus: null }, { chequeStatus: { notIn: ["PENDING", "BOUNCED"] } }],
      ...(fromDate ? { paymentDate: { gte: fromDate } } : {}),
      ...(toDate ? { paymentDate: { lte: toDate } } : {}),
    },
    orderBy: { paymentDate: "asc" },
    select: { paymentDate: true, amount: true, interestAmount: true, mode: true, assetSale: { select: { saleNumber: true, customer: { select: { name: true } } } } },
  });

  const withdrawals = await prisma.escrowWithdrawal.findMany({
    where: {
      projectId: id, status: { not: "VOID" },
      ...(fromDate ? { createdAt: { gte: fromDate } } : {}),
      ...(toDate ? { createdAt: { lte: toDate } } : {}),
    },
    orderBy: { withdrawalNo: "asc" },
  });

  const collected = payments.reduce((s, p) => s + toNum(p.amount) - toNum(p.interestAmount), 0);
  const withdrawn = withdrawals.reduce((s, w) => s + toNum(w.amount), 0);
  const required = collected * 0.7;
  const ledgerBalance = (await projectEscrowLedgerBalance(prisma, company.id, id)).toNumber();

  const periodLabel = fromDate && toDate
    ? `${formatDate(fromDate)} → ${formatDate(toDate)}`
    : "All recorded periods";

  return (
    <div className="mx-auto max-w-3xl bg-white p-8 text-black print:p-0">
      <PrintToolbar />
      <PrintHeader company={company} title="RERA Escrow Statement" docNumber={`ESC-${project.name} — ${periodLabel}`} date={new Date()} />

      <div className="mt-4 text-sm">
        <div className="grid grid-cols-2 gap-2 rounded-md border border-gray-300 p-3">
          <div><span className="text-gray-500">Project</span> <b>{project.name}</b>{project.reraNumber ? ` · RERA ${project.reraNumber}` : ""}</div>
          <div><span className="text-gray-500">Designated account</span> <b>{project.escrowBankName ?? "—"} · A/C {project.escrowAccountNo}</b></div>
          <div><span className="text-gray-500">Period</span> <b>{periodLabel}</b></div>
          <div><span className="text-gray-500">Statutory hold</span> <b>70% of allottee collections</b></div>
        </div>
      </div>

      <h3 className="mt-5 border-b border-black pb-1 text-xs font-bold uppercase">Collections received in the period</h3>
      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="border-b border-gray-300 text-left text-xs uppercase text-gray-500">
            <th className="py-1">Date</th><th className="py-1">Sale</th><th className="py-1">Buyer</th><th className="py-1">Mode</th><th className="py-1 text-right">Principal</th>
          </tr>
        </thead>
        <tbody>
          {payments.length === 0 && <tr><td colSpan={5} className="py-3 text-center text-gray-500">No collections in the period</td></tr>}
          {payments.map((p, i) => (
            <tr key={i} className="border-b border-gray-100">
              <td className="py-1">{formatDate(p.paymentDate)}</td>
              <td className="py-1 font-mono text-xs">{p.assetSale.saleNumber}</td>
              <td className="py-1">{p.assetSale.customer.name}</td>
              <td className="py-1 text-xs">{p.mode.replace(/_/g, " ")}</td>
              <td className="py-1 text-right tnum">{formatCurrency(toNum(p.amount) - toNum(p.interestAmount))}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-black font-semibold">
            <td colSpan={4} className="py-1">Total collections</td>
            <td className="py-1 text-right tnum">{formatCurrency(collected)}</td>
          </tr>
        </tfoot>
      </table>

      <h3 className="mt-5 border-b border-black pb-1 text-xs font-bold uppercase">Certified withdrawals</h3>
      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="border-b border-gray-300 text-left text-xs uppercase text-gray-500">
            <th className="py-1">#</th><th className="py-1">Purpose</th><th className="py-1">Engineer / Architect / CA</th><th className="py-1 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {withdrawals.length === 0 && <tr><td colSpan={4} className="py-3 text-center text-gray-500">No withdrawals in the period</td></tr>}
          {withdrawals.map((w) => (
            <tr key={w.id} className="border-b border-gray-100">
              <td className="py-1 font-mono text-xs">{w.withdrawalNo}</td>
              <td className="py-1">{w.purpose}</td>
              <td className="py-1 text-xs">{w.engineerName} · {w.architectName} · {w.caName}</td>
              <td className="py-1 text-right tnum">{formatCurrency(toNum(w.amount))}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-black font-semibold">
            <td colSpan={3} className="py-1">Total withdrawn</td>
            <td className="py-1 text-right tnum">{formatCurrency(withdrawn)}</td>
          </tr>
        </tfoot>
      </table>

      <div className="mt-5 rounded-md border-2 border-black p-3 text-sm">
        <div className="flex justify-between"><span>Collections in period (principal)</span><b className="tnum">{formatCurrency(collected)}</b></div>
        <div className="flex justify-between"><span>70% statutory hold required</span><b className="tnum">{formatCurrency(required)}</b></div>
        <div className="flex justify-between"><span>Certified withdrawals in period</span><b className="tnum">{formatCurrency(withdrawn)}</b></div>
        <div className="mt-1 flex justify-between border-t border-black pt-1 font-bold">
          <span>Escrow ledger balance (A/C 1060)</span><span className="tnum">{formatCurrency(ledgerBalance)}</span>
        </div>
      </div>

      <p className="mt-4 text-xs text-gray-500">
        Generated from the general ledger — escrow receipts and withdrawals post to account 1060
        RERA Escrow against this project&apos;s designated account. The 70% hold is computed on
        cleared allottee collections; interest legs are excluded as income, not consideration.
      </p>
    </div>
  );
}
