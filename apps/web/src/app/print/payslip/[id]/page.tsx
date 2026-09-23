import { connection } from "next/server";
import { PrintToolbar } from "@/components/print/print-button";
import { PrintHeader } from "@/components/print/print-header";
import { prisma } from "@nirman/db";
import { toNum, getCompany, getUserPermissions, getCurrentUser, scopeWhere } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { amountInWords } from "@nirman/services";
import { formatCurrency, formatDate } from "@/lib/utils";
import { notFound } from "next/navigation";

const MONTHS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * Print-friendly Payslip — /print/payslip/[payrollLineId]
 *
 * The document an owner hands to a worker or a bank: earnings breakdown,
 * deductions breakdown, net pay in words, payment proof, signature blocks.
 *
 * Access (either):
 *   · payroll.view / payroll.manage / hr.manage + employee scope — HR prints
 *     anyone's slip inside their jurisdiction.
 *   · the employee themselves — self-service print from /m/me (own line only,
 *     same data the self-service view already exposes).
 */
export default async function PayslipPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;

  const [perms, user] = await Promise.all([getUserPermissions(), getCurrentUser()]);
  const canSeePayroll =
    perms.includes(PERM.PAYROLL_VIEW) || perms.includes(PERM.PAYROLL_MANAGE) || perms.includes(PERM.HR_MANAGE);
  const company = await getCompany();

  const line = await prisma.payrollLine.findFirst({
    where: {
      id,
      employee: { companyId: company.id, deletedAt: null },
      // PayrollLine scopes through the employee relation — scopeWhere("PayrollLine")
      // emits `employee.departmentId`/`employee.activeProjectId` + the H1 subject
      // wall nested under `employee`. (scopeWhere("Employee") emitted employee-level
      // fields like `activeProjectId`/`hierarchyLevel` onto the payrollLine where —
      // Prisma rejected it with a 500 for every scoped payroll viewer.)
      AND: canSeePayroll ? [await scopeWhere("PayrollLine")] : [],
    },
    include: {
      payrollPeriod: { select: { month: true, year: true, status: true } },
      components: { orderBy: [{ isDeduction: "asc" }, { createdAt: "asc" }] },
      employee: {
        select: {
          id: true, name: true, designation: true, trade: true,
          department: { select: { name: true } },
          bankAccountNumber: true, bankIfsc: true, bankName: true,
          panNumber: true, uan: true, pfNumber: true, esiNumber: true, userId: true,
          wageType: true, dailyRate: true, monthlySalary: true, payDay: true,
        },
      },
      paidBy: { select: { name: true } },
    },
  });
  if (!line) notFound();

  // Self-service: a logged-in employee can print their OWN slip even without
  // payroll.view — the line's data is already theirs (mirrors /m/me).
  if (!canSeePayroll) {
    if (!user || line.employee.userId !== user.id) notFound();
  }

  const e = line.employee;
  const period = `${MONTHS[line.payrollPeriod.month]} ${line.payrollPeriod.year}`;

  // ── Earnings rows: always the stored buckets (they're the paid truth);
  //    component rows give the itemized "why" underneath. ──
  const earnings = [
    { label: "Basic Pay", amount: toNum(line.basicAmount) },
    { label: "Overtime", amount: toNum(line.overtimeAmount) },
    { label: "Allowances (HRA, travel, food…)", amount: toNum(line.allowance) },
    { label: "Bonus", amount: toNum(line.bonus) },
  ].filter((r) => r.amount !== 0);
  const deductions = [
    { label: "Provident Fund (employee)", amount: toNum(line.pf) },
    { label: "ESI (employee)", amount: toNum(line.esi) },
    { label: "Profession Tax", amount: toNum(line.professionTax) },
    { label: "Income Tax / TDS", amount: toNum(line.tax) },
    { label: "Advance / loan recovery & other", amount: toNum(line.deductions) },
  ].filter((r) => r.amount !== 0);

  const earningComponents = line.components.filter((c) => !c.isDeduction);
  const deductionComponents = line.components.filter((c) => c.isDeduction);
  const compDetail = (c: (typeof line.components)[number]) =>
    c.calculationType === "UNIT_RATE" && c.quantity != null
      ? `${toNum(c.rate)} × ${toNum(c.quantity)} ${c.unitLabel ?? c.unitType ?? ""}`.trim()
      : c.calculationType === "PERCENTAGE_OF_BASIC" && c.quantity != null
        ? `${toNum(c.quantity)}% of basic`
        : "";

  return (
    <div className="print-page mx-auto max-w-2xl bg-white p-8 text-black print:p-4">
      <PrintToolbar title="Payslip" />

      <PrintHeader
        company={{ name: company.name, address: company.address, gstin: company.gstin, phone: company.phone }}
        title="Salary Payslip"
        docNumber={`PS-${line.payrollPeriod.year}${String(line.payrollPeriod.month).padStart(2, "0")}-${e.id.slice(-6).toUpperCase()}`}
        date={line.paymentDate ?? line.updatedAt}
      />

      {/* Employee block */}
      <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
        <div><span className="text-gray-500">Employee:</span> <span className="font-semibold">{e.name}</span></div>
        <div><span className="text-gray-500">Pay Period:</span> <span className="font-semibold">{period}</span></div>
        <div><span className="text-gray-500">Designation:</span> {e.designation ?? e.trade ?? "—"}</div>
        <div><span className="text-gray-500">Department:</span> {e.department?.name ?? "—"}</div>
        <div><span className="text-gray-500">Days Worked:</span> <span className="font-semibold">{toNum(line.daysWorked)}</span></div>
        <div><span className="text-gray-500">Pay Day:</span> {e.payDay ? `${e.payDay}${e.payDay === 1 ? "st" : e.payDay === 2 ? "nd" : e.payDay === 3 ? "rd" : "th"} of month` : "—"}</div>
        {e.panNumber && <div><span className="text-gray-500">PAN:</span> <span className="font-mono">{e.panNumber}</span></div>}
        {e.uan && <div><span className="text-gray-500">UAN:</span> <span className="font-mono">{e.uan}</span></div>}
        {e.pfNumber && <div><span className="text-gray-500">PF No.:</span> <span className="font-mono">{e.pfNumber}</span></div>}
        {e.esiNumber && <div><span className="text-gray-500">ESI No.:</span> <span className="font-mono">{e.esiNumber}</span></div>}
      </div>

      {/* Earnings + Deductions side by side */}
      <table className="mt-5 w-full border-collapse text-sm">
        <thead>
          <tr className="border-y-2 border-black">
            <th className="py-1.5 text-left font-semibold">Earnings</th>
            <th className="py-1.5 text-right font-semibold">Amount</th>
            <th className="py-1.5 pl-6 text-left font-semibold">Deductions</th>
            <th className="py-1.5 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: Math.max(earnings.length, deductionComponents.length ? deductionComponents.length : deductions.length, 1) }).map((_, i) => {
            const earn = earnings[i];
            const dedComp = deductionComponents[i];
            const ded = dedComp
              ? { label: dedComp.label + (compDetail(dedComp) ? ` (${compDetail(dedComp)})` : ""), amount: toNum(dedComp.amount) }
              : deductions[i - (deductionComponents.length - deductions.length)] ?? deductions[i];
            return (
              <tr key={i} className="border-b border-gray-200">
                <td className="py-1">{earn?.label ?? ""}</td>
                <td className="py-1 text-right tabular-nums">{earn ? formatCurrency(earn.amount) : ""}</td>
                <td className="py-1 pl-6">{ded?.label ?? ""}</td>
                <td className="py-1 text-right tabular-nums">{ded ? formatCurrency(ded.amount) : ""}</td>
              </tr>
            );
          })}
          <tr className="border-y border-black font-semibold">
            <td className="py-1.5">Gross Earnings</td>
            <td className="py-1.5 text-right tabular-nums">{formatCurrency(toNum(line.grossPay))}</td>
            <td className="py-1.5 pl-6">Total Deductions</td>
            <td className="py-1.5 text-right tabular-nums">{formatCurrency(toNum(line.totalDeductions))}</td>
          </tr>
        </tbody>
      </table>

      {/* Itemized earning detail — the "rate × qty" audit trail */}
      {earningComponents.length > 0 && (
        <table className="mt-4 w-full border-collapse text-xs text-gray-600">
          <tbody>
            {earningComponents.map((c) => (
              <tr key={c.id}>
                <td className="py-0.5 pl-4">{c.label}</td>
                <td className="py-0.5">{compDetail(c)}</td>
                <td className="py-0.5 text-right tabular-nums">{formatCurrency(toNum(c.amount))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Net pay */}
      <div className="mt-5 flex items-baseline justify-between border-2 border-black px-4 py-3">
        <span className="text-base font-bold">NET PAY</span>
        <span className="text-2xl font-bold tabular-nums">{formatCurrency(toNum(line.netPay))}</span>
      </div>
      <p className="mt-1 text-xs text-gray-600">
        {amountInWords(toNum(line.netPay))}
      </p>

      {/* Payment proof */}
      <div className="mt-4 text-xs text-gray-600 space-y-0.5">
        {line.paymentDate && (
          <div>
            Paid on <span className="font-semibold text-black">{formatDate(line.paymentDate)}</span>
            {line.paymentMode && <> via {line.paymentMode}</>}
            {line.paymentReference && <> · Ref: <span className="font-mono">{line.paymentReference}</span></>}
            {line.paidBy && <> · recorded by {line.paidBy.name}</>}
          </div>
        )}
        {!line.paymentDate && <div className="italic">Payment pending — {line.payrollPeriod.status.toLowerCase()} payroll.</div>}
        {e.bankAccountNumber && (
          <div>Salary account: {e.bankName ?? "Bank"} A/c ••••{e.bankAccountNumber.slice(-4)} {e.bankIfsc ? `· ${e.bankIfsc}` : ""}</div>
        )}
      </div>

      {/* Signatures */}
      <div className="mt-10 flex justify-between text-xs text-gray-600">
        <div className="w-40 border-t border-gray-400 pt-1 text-center">Employee signature</div>
        <div className="w-40 border-t border-gray-400 pt-1 text-center">Authorised signatory</div>
      </div>

      <p className="mt-6 text-center text-[10px] text-gray-400">
        This is a system-generated payslip from Nirman OS · {company.name}
      </p>
    </div>
  );
}
