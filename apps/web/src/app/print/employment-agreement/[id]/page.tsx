import { connection } from "next/server";
import { notFound } from "next/navigation";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PrintToolbar } from "@/components/print/print-button";
import { PrintHeader } from "@/components/print/print-header";
import { formatCurrency, formatDate } from "@/lib/utils";

/**
 * Employment Agreement — formal employment contract generated for each
 * employee on account creation. Covers employment type, wage, terms,
 * benefits, notice period, bank details, and signature blocks.
 *
 * Auto-attached to the employee profile as an EntityAttachment with
 * category = "contract". The print page can be re-opened any time.
 */
export default async function EmploymentAgreementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.HR_VIEW)) {
    return <div className="p-8 text-center text-muted-foreground">No access</div>;
  }

  const employee = await prisma.employee.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
    include: {
      user: {
        select: {
          id: true, name: true, email: true, phone: true, role: true,
          employeeCode: true, designation: true, department: true,
        },
      },
      benefits: {
        where: { active: true },
        orderBy: { type: "asc" },
      },
      salaryComponents: {
        where: { active: true },
        orderBy: [{ isDeduction: "asc" }, { type: "asc" }],
      },
      crew: { select: { name: true } },
      activeProject: { select: { name: true } },
    },
  });

  if (!employee) notFound();

  const companyDetails = await prisma.company.findFirst({
    where: { id: company.id },
    select: { name: true, address: true, gstin: true, phone: true, email: true, pan: true },
  });

  // ── Compute derived values ──
  const agreementNo = `EMP-AGR-${employee.id.slice(-8).toUpperCase()}`;
  const issueDate = employee.contractIssuedAt ?? new Date();
  const employmentTypeLabel: Record<string, string> = {
    PERMANENT: "Permanent Employment",
    CONTRACT: "Fixed-Term Contract",
    CASUAL: "Casual Employment",
    PROBATION: "Probationary Employment",
    INTERN: "Internship",
  };
  const typeLabel = employmentTypeLabel[employee.employmentType ?? "PERMANENT"] ?? "Employment";

  const wageText =
    employee.wageType === "DAILY"
      ? `Daily wage of ${formatCurrency(toNum(employee.dailyRate))} per working day`
      : employee.wageType === "MONTHLY"
        ? `Monthly salary of ${formatCurrency(toNum(employee.monthlySalary))} per month`
        : `Fixed contract amount of ${formatCurrency(toNum(employee.monthlySalary))}`;

  const benefitsText = employee.benefits.length > 0
    ? employee.benefits.map((b) => {
        const amountText = b.amount ? ` (${formatCurrency(toNum(b.amount))} ${b.frequency.toLowerCase()})` : "";
        return `${b.type.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}${amountText}`;
      }).join(", ")
    : "As per company policy";

  const noticeText = employee.noticePeriodDays != null
    ? employee.noticePeriodDays === 0
      ? "immediate termination (no notice period required)"
      : `${employee.noticePeriodDays} days written notice from either party`
    : "30 days written notice from either party (default)";

  const contractDurationText =
    employee.contractStartDate && employee.contractEndDate
      ? `from ${formatDate(employee.contractStartDate)} to ${formatDate(employee.contractEndDate)}`
      : employee.contractStartDate
        ? `from ${formatDate(employee.contractStartDate)} onwards`
        : "ongoing until terminated per the terms below";

  const probationText =
    employee.employmentType === "PROBATION"
      ? employee.probationEndDate
        ? `The employee is on probation until ${formatDate(employee.probationEndDate)}. Upon satisfactory performance, the employee will be confirmed as a permanent employee.`
        : `The employee is on probation. The probation end date is to be determined. Upon satisfactory performance, the employee will be confirmed as a permanent employee.`
      : "";

  const bankText = employee.bankAccountNumber
    ? `Salary shall be auto-deposited to the employee's bank account (${employee.bankName ?? "—"}, A/C: ****${employee.bankAccountNumber.slice(-4)}, IFSC: ${employee.bankIfsc ?? "—"}) on the ${employee.payDay ?? 7}th day of each month.`
    : `Salary shall be paid per company policy. Auto-deposit requires bank details to be configured.`;

  const employeeName = employee.user?.name ?? employee.name;
  const employeeDesignation = employee.user?.designation ?? employee.designation ?? "Employee";
  const employeePhone = employee.user?.phone ?? employee.phone ?? "—";
  const employeeEmail = employee.user?.email ?? employee.email ?? "—";
  const employeeCode = employee.user?.employeeCode ?? "—";

  return (
    <>
      <PrintToolbar title="Employment Agreement" />
      <div className="print-page mx-auto my-8 max-w-3xl bg-white p-8 shadow-lg print:my-0 print:shadow-none print:p-6">
        <PrintHeader
          company={{
            name: companyDetails?.name ?? company.name,
            address: companyDetails?.address,
            gstin: companyDetails?.gstin,
            phone: companyDetails?.phone,
            email: companyDetails?.email,
          }}
          title="Employment Agreement"
          docNumber={agreementNo}
          date={issueDate}
          extra={
            <div className="text-xs text-gray-500">
              Status: <span className="font-semibold">{employee.contractStatus ?? "DRAFT"}</span>
            </div>
          }
        />

        {/* ── Parties ── */}
        <div className="mt-6 grid grid-cols-2 gap-6">
          <div>
            <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-gray-500">Employer</h3>
            <p className="text-sm font-semibold">{companyDetails?.name ?? company.name}</p>
            <p className="text-xs text-gray-600">{companyDetails?.address ?? "—"}</p>
            {companyDetails?.gstin && <p className="text-xs text-gray-600">GSTIN: {companyDetails.gstin}</p>}
            {companyDetails?.pan && <p className="text-xs text-gray-600">PAN: {companyDetails.pan}</p>}
          </div>
          <div>
            <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-gray-500">Employee</h3>
            <p className="text-sm font-semibold">{employeeName}</p>
            <p className="text-xs text-gray-600">Designation: {employeeDesignation}</p>
            <p className="text-xs text-gray-600">Phone: {employeePhone}</p>
            {employeeEmail !== "—" && <p className="text-xs text-gray-600">Email: {employeeEmail}</p>}
            <p className="text-xs text-gray-600">Employee Code: {employeeCode}</p>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="mt-6 space-y-4 text-sm leading-relaxed text-gray-800">
          <p>
            This Employment Agreement (&quot;Agreement&quot;) is made on <strong>{formatDate(issueDate)}</strong> by and
            between <strong>{companyDetails?.name ?? company.name}</strong> (the &quot;Employer&quot;) and{" "}
            <strong>{employeeName}</strong> (the &quot;Employee&quot;).
          </p>

          {/* 1. Appointment */}
          <section>
            <h4 className="font-bold text-gray-900">1. Appointment &amp; Position</h4>
            <p>
              The Employer appoints the Employee as <strong>{employeeDesignation}</strong>
              {employee.user?.department ? ` in the ${employee.user.department} department` : ""}
              {employee.trade ? ` (Trade: ${employee.trade})` : ""}. The Employee shall perform duties
              as assigned by the Employer, reporting to the designated supervisor.
              {employee.activeProject ? ` The Employee's primary project assignment is ${employee.activeProject.name}.` : ""}
              {employee.crew ? ` The Employee is part of crew: ${employee.crew.name}.` : ""}
            </p>
          </section>

          {/* 2. Employment Type & Duration */}
          <section>
            <h4 className="font-bold text-gray-900">2. Employment Type &amp; Duration</h4>
            <p>
              This is a <strong>{typeLabel}</strong> position, {contractDurationText}.
            </p>
            {probationText && <p className="mt-1">{probationText}</p>}
          </section>

          {/* 3. Compensation */}
          <section>
            <h4 className="font-bold text-gray-900">3. Compensation</h4>
            <p>
              The Employee shall be compensated at the rate of <strong>{wageText}</strong>, subject to
              applicable deductions (PF, ESI, TDS, profession tax) as per statutory requirements.
            </p>

            {employee.salaryComponents.length > 0 && (
              <div className="mt-2 overflow-hidden rounded border border-gray-300">
                <table className="w-full text-xs">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-2 py-1 text-left font-bold">Component</th>
                      <th className="px-2 py-1 text-right font-bold">Amount (₹)</th>
                      <th className="px-2 py-1 text-left font-bold">Frequency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employee.salaryComponents.filter((c) => !c.isDeduction).map((c) => (
                      <tr key={c.id} className="border-t border-gray-200">
                        <td className="px-2 py-1">{c.type.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase())}</td>
                        <td className="px-2 py-1 text-right tabular-nums">
                          {c.isPercentage && c.percentageOfBasic
                            ? `${toNum(c.percentageOfBasic)}% of Basic`
                            : formatCurrency(toNum(c.amount))}
                        </td>
                        <td className="px-2 py-1 text-gray-600">{c.frequency.toLowerCase()}</td>
                      </tr>
                    ))}
                    {employee.salaryComponents.some((c) => c.isDeduction) && (
                      <>
                        <tr className="border-t border-gray-200 bg-gray-50">
                          <td colSpan={3} className="px-2 py-1 font-bold text-gray-600">Deductions</td>
                        </tr>
                        {employee.salaryComponents.filter((c) => c.isDeduction).map((c) => (
                          <tr key={c.id} className="border-t border-gray-200">
                            <td className="px-2 py-1 pl-4">— {c.type.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase())}</td>
                            <td className="px-2 py-1 text-right tabular-nums text-red-600">-{formatCurrency(toNum(c.amount))}</td>
                            <td className="px-2 py-1 text-gray-600">{c.frequency.toLowerCase()}</td>
                          </tr>
                        ))}
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            <p className="mt-1">{bankText}</p>
          </section>

          {/* 4. Benefits */}
          <section>
            <h4 className="font-bold text-gray-900">4. Benefits &amp; Allowances</h4>
            <p>The Employee is eligible for the following benefits: {benefitsText}.</p>
          </section>

          {/* 5. Working Hours */}
          <section>
            <h4 className="font-bold text-gray-900">5. Working Hours</h4>
            <p>
              The Employee shall work as per the project/site schedule, typically 8 hours per day,
              6 days per week. Overtime, if applicable, shall be compensated as per company policy
              and statutory requirements.
            </p>
          </section>

          {/* 6. Notice Period */}
          <section>
            <h4 className="font-bold text-gray-900">6. Termination &amp; Notice</h4>
            <p>
              Either party may terminate this Agreement by providing <strong>{noticeText}</strong>.
              The Employer may terminate this Agreement immediately for cause (misconduct, negligence,
              breach of terms). Upon termination, all company property must be returned and final
              settlement processed per statutory requirements.
            </p>
          </section>

          {/* 7. Confidentiality */}
          <section>
            <h4 className="font-bold text-gray-900">7. Confidentiality &amp; IP</h4>
            <p>
              The Employee shall maintain confidentiality of all proprietary information, project
              data, client information, and business processes. All intellectual property created
              during employment is the property of the Employer.
            </p>
          </section>

          {/* 8. Compliance */}
          <section>
            <h4 className="font-bold text-gray-900">8. Compliance &amp; Safety</h4>
            <p>
              The Employee shall comply with all company policies, safety regulations, and statutory
              requirements including the use of Personal Protective Equipment (PPE) at construction
              sites. Non-compliance may result in disciplinary action.
            </p>
          </section>

          {/* 9. Statutory IDs */}
          {(employee.panNumber || employee.pfNumber || employee.esiNumber || employee.uan) && (
            <section>
              <h4 className="font-bold text-gray-900">9. Statutory Identifications</h4>
              <ul className="ml-4 list-disc text-xs">
                {employee.panNumber && <li>PAN: {employee.panNumber}</li>}
                {employee.pfNumber && <li>PF Account: {employee.pfNumber}</li>}
                {employee.esiNumber && <li>ESI Number: {employee.esiNumber}</li>}
                {employee.uan && <li>UAN: {employee.uan}</li>}
                {employee.aadhaarNumber && <li>Aadhaar: ****{employee.aadhaarNumber.slice(-4)}</li>}
              </ul>
            </section>
          )}

          {/* 10. Acknowledgment */}
          <section>
            <h4 className="font-bold text-gray-900">10. Acknowledgment</h4>
            <p>
              By signing below, the Employee acknowledges that they have read, understood, and agree
              to the terms of this Agreement. The Employee confirms that all information provided
              to the Employer is accurate and complete.
            </p>
          </section>
        </div>

        {/* ── Signatures ── */}
        <div className="mt-10 grid grid-cols-2 gap-12">
          <div>
            <div className="border-t border-gray-400 pt-1">
              <p className="text-xs font-semibold text-gray-700">For {companyDetails?.name ?? company.name}</p>
              <p className="text-xs text-gray-500">Authorised Signatory</p>
              <p className="mt-2 text-xs text-gray-400">Date: ____________________</p>
            </div>
          </div>
          <div>
            <div className="border-t border-gray-400 pt-1">
              <p className="text-xs font-semibold text-gray-700">{employeeName}</p>
              <p className="text-xs text-gray-500">Employee Signature</p>
              <p className="mt-2 text-xs text-gray-400">Date: ____________________</p>
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="mt-8 border-t border-gray-200 pt-2 text-center text-xs text-gray-400">
          <p>
            This is a system-generated employment agreement ({agreementNo}) issued on {formatDate(issueDate)}.
            {employee.contractStatus === "CONFIRMED" && employee.contractConfirmedAt && (
              <> Confirmed on {formatDate(employee.contractConfirmedAt)}.</>
            )}
          </p>
        </div>
      </div>
    </>
  );
}
