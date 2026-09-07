import { connection } from "next/server";
import { notFound } from "next/navigation";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PrintToolbar } from "@/components/print/print-button";
import { PrintHeader } from "@/components/print/print-header";
import { formatCurrency, formatDate } from "@/lib/utils";

/**
 * Offer Letter — a formal job offer document generated for each employee.
 * Includes full CTC breakdown (Basic, HRA, DA, TA, etc.), comprehensive
 * terms & conditions, statutory compliance clauses, and acceptance block.
 *
 * Auto-attached to the employee profile as an EntityAttachment with
 * category = "offer-letter".
 */
export default async function OfferLetterPage({
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

  const [employee, companyDetails] = await Promise.all([
    prisma.employee.findFirst({
      where: { id, companyId: company.id, deletedAt: null },
      include: {
        user: {
          select: {
            id: true, name: true, email: true, phone: true, role: true,
            employeeCode: true, designation: true, department: true,
          },
        },
        activeProject: { select: { name: true } },
        salaryComponents: {
          where: { active: true },
          orderBy: [{ isDeduction: "asc" }, { type: "asc" }],
        },
        benefits: {
          where: { active: true },
          orderBy: { type: "asc" },
        },
      },
    }),
    prisma.company.findFirst({
      where: { id: company.id },
      select: { name: true, address: true, gstin: true, phone: true, email: true, pan: true },
    }),
  ]);

  if (!employee) notFound();

  // ── Compute derived values ──
  const offerNo = `EMP-OFR-${employee.id.slice(-8).toUpperCase()}`;
  const issueDate = employee.offerLetterIssuedAt ?? new Date();

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

  const startDateText = employee.joinDate
    ? formatDate(employee.joinDate)
    : employee.contractStartDate
      ? formatDate(employee.contractStartDate)
      : "a mutually agreed date";

  const employeeName = employee.user?.name ?? employee.name;
  const employeeDesignation = employee.user?.designation ?? employee.designation ?? "Employee";
  const employeePhone = employee.user?.phone ?? employee.phone ?? "—";
  const employeeEmail = employee.user?.email ?? employee.email ?? "—";

  // ── Salary components ──
  const components = employee.salaryComponents;
  const earnings = components.filter((c) => !c.isDeduction);
  const deductions = components.filter((c) => c.isDeduction);

  const monthlyEarnings = earnings
    .filter((c) => c.frequency === "MONTHLY")
    .reduce((sum, c) => sum + toNum(c.amount), 0);
  const monthlyDeductions = deductions
    .filter((c) => c.frequency === "MONTHLY")
    .reduce((sum, c) => sum + toNum(c.amount), 0);
  const monthlyNet = monthlyEarnings - monthlyDeductions;
  const annualCTC = earnings.reduce((sum, c) => {
    const amt = toNum(c.amount);
    if (c.frequency === "MONTHLY") return sum + amt * 12;
    if (c.frequency === "QUARTERLY") return sum + amt * 4;
    if (c.frequency === "HALF_YEARLY") return sum + amt * 2;
    if (c.frequency === "YEARLY") return sum + amt;
    if (c.frequency === "ONE_TIME") return sum + amt;
    return sum;
  }, 0);

  const componentLabel: Record<string, string> = {
    BASIC: "Basic Salary",
    HRA: "House Rent Allowance (HRA)",
    DA: "Dearness Allowance (DA)",
    TA: "Travelling Allowance (TA)",
    SPECIAL_ALLOWANCE: "Special Allowance",
    FOOD_ALLOWANCE: "Food Allowance",
    MEDICAL_ALLOWANCE: "Medical Allowance",
    UNIFORM_ALLOWANCE: "Uniform Allowance",
    WASHING_ALLOWANCE: "Washing Allowance",
    LTA: "Leave Travel Allowance (LTA)",
    PERFORMANCE_BONUS: "Performance Bonus",
    JOINING_BONUS: "Joining Bonus",
    RETENTION_BONUS: "Retention Bonus",
    EMPLOYER_PF: "Employer PF Contribution",
    EMPLOYEE_PF: "Employee PF Contribution",
    EMPLOYER_ESI: "Employer ESI Contribution",
    EMPLOYEE_ESI: "Employee ESI Contribution",
    GRATUITY: "Gratuity",
    PROFESSION_TAX: "Profession Tax",
    TDS: "Income Tax (TDS)",
    OTHER: "Other",
  };

  const frequencyLabel: Record<string, string> = {
    MONTHLY: "/month",
    QUARTERLY: "/quarter",
    HALF_YEARLY: "/half-year",
    YEARLY: "/year",
    ONE_TIME: " (one-time)",
  };

  const hasSalaryComponents = components.length > 0;

  // ── Benefits text ──
  const benefitsText = employee.benefits.length > 0
    ? employee.benefits.map((b) => {
        const amountText = b.amount ? ` (${formatCurrency(toNum(b.amount))} ${b.frequency.toLowerCase()})` : "";
        return `${b.type.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}${amountText}`;
      }).join(", ")
    : "As per company policy";

  return (
    <>
      <PrintToolbar title="Offer Letter" />
      <div className="print-page mx-auto my-8 max-w-3xl bg-white p-8 shadow-lg print:my-0 print:shadow-none print:p-6">
        <PrintHeader
          company={{
            name: companyDetails?.name ?? company.name,
            address: companyDetails?.address,
            gstin: companyDetails?.gstin,
            phone: companyDetails?.phone,
            email: companyDetails?.email,
          }}
          title="Offer Letter"
          docNumber={offerNo}
          date={issueDate}
          extra={
            <div className="text-xs text-gray-500">
              Status: <span className="font-semibold">{employee.offerLetterStatus ?? "DRAFT"}</span>
            </div>
          }
        />

        {/* ── Salutation ── */}
        <div className="mt-6 space-y-3 text-sm leading-relaxed text-gray-800">
          <p>
            Date: <strong>{formatDate(issueDate)}</strong>
          </p>
          <p>
            To,<br />
            <strong>{employeeName}</strong>
            {employeeDesignation !== "Employee" && <><br />{employeeDesignation}</>}
            {employeePhone !== "—" && <><br />Phone: {employeePhone}</>}
            {employeeEmail !== "—" && <><br />Email: {employeeEmail}</>}
          </p>

          <p>Subject: <strong>Offer of Employment</strong></p>

          <p>Dear {employeeName.split(" ")[0]},</p>

          <p>
            We are pleased to offer you the position of <strong>{employeeDesignation}</strong>
            {employee.trade ? ` (Trade: ${employee.trade})` : ""} at{" "}
            <strong>{companyDetails?.name ?? company.name}</strong>
            {employee.activeProject ? `, primarily assigned to the ${employee.activeProject.name} project` : ""}.
            We believe your skills and experience will be a valuable addition to our team.
          </p>

          {/* ════════ 1. EMPLOYMENT TYPE ════════ */}
          <section>
            <h4 className="font-bold text-gray-900">1. Employment Type &amp; Duration</h4>
            <p>
              This is a <strong>{typeLabel}</strong> position.
              {employee.contractStartDate && employee.contractEndDate
                ? ` The engagement period is from ${formatDate(employee.contractStartDate)} to ${formatDate(employee.contractEndDate)}.`
                : employee.contractStartDate
                  ? ` The engagement starts from ${formatDate(employee.contractStartDate)}.`
                  : ""}
              {employee.employmentType === "PROBATION" && employee.probationEndDate
                ? ` You will be on probation until ${formatDate(employee.probationEndDate)}. Upon satisfactory performance, you will be confirmed as a permanent employee.`
                : ""}
            </p>
          </section>

          {/* ════════ 2. COMPENSATION & CTC BREAKDOWN ════════ */}
          <section>
            <h4 className="font-bold text-gray-900">2. Compensation</h4>
            <p>
              You will be compensated at the rate of <strong>{wageText}</strong>, subject to
              applicable statutory deductions (PF, ESI, TDS, profession tax) as per government
              regulations.
            </p>

            {hasSalaryComponents && (
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
                    {earnings.map((c) => (
                      <tr key={c.id} className="border-t border-gray-200">
                        <td className="px-2 py-1">{componentLabel[c.type] ?? c.type}</td>
                        <td className="px-2 py-1 text-right tabular-nums">
                          {c.isPercentage && c.percentageOfBasic
                            ? `${toNum(c.percentageOfBasic)}% of Basic`
                            : formatCurrency(toNum(c.amount))}
                        </td>
                        <td className="px-2 py-1 text-gray-600">{frequencyLabel[c.frequency] ?? "/month"}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-gray-400 bg-gray-50 font-bold">
                      <td className="px-2 py-1">Gross Monthly Earnings</td>
                      <td className="px-2 py-1 text-right tabular-nums">{formatCurrency(monthlyEarnings)}</td>
                      <td className="px-2 py-1"></td>
                    </tr>
                    {deductions.length > 0 && (
                      <>
                        <tr className="border-t border-gray-200">
                          <td colSpan={3} className="px-2 py-1 font-bold text-gray-600">Deductions</td>
                        </tr>
                        {deductions.map((c) => (
                          <tr key={c.id} className="border-t border-gray-200">
                            <td className="px-2 py-1 pl-4">— {componentLabel[c.type] ?? c.type}</td>
                            <td className="px-2 py-1 text-right tabular-nums text-red-600">-{formatCurrency(toNum(c.amount))}</td>
                            <td className="px-2 py-1 text-gray-600">{frequencyLabel[c.frequency] ?? "/month"}</td>
                          </tr>
                        ))}
                        <tr className="border-t border-gray-200 font-bold">
                          <td className="px-2 py-1">Total Deductions</td>
                          <td className="px-2 py-1 text-right tabular-nums text-red-600">-{formatCurrency(monthlyDeductions)}</td>
                          <td className="px-2 py-1"></td>
                        </tr>
                        <tr className="border-t-2 border-gray-400 bg-gray-50 font-bold">
                          <td className="px-2 py-1">Net Monthly Pay</td>
                          <td className="px-2 py-1 text-right tabular-nums">{formatCurrency(monthlyNet)}</td>
                          <td className="px-2 py-1"></td>
                        </tr>
                      </>
                    )}
                    <tr className="border-t-2 border-gray-700 bg-gray-200 font-bold">
                      <td className="px-2 py-1.5">Annual CTC (Cost to Company)</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{formatCurrency(annualCTC)}</td>
                      <td className="px-2 py-1.5"></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {employee.bankAccountNumber && (
              <p className="mt-2">
                Salary will be credited to your bank account ({employee.bankName ?? "—"},
                A/C: ****{employee.bankAccountNumber.slice(-4)}, IFSC: {employee.bankIfsc ?? "—"})
                on the {employee.payDay ?? 7}th day of each month.
              </p>
            )}
          </section>

          {/* ════════ 3. BENEFITS & ALLOWANCES ════════ */}
          <section>
            <h4 className="font-bold text-gray-900">3. Benefits &amp; Allowances</h4>
            <p>
              In addition to the above compensation, you are eligible for the following benefits: {benefitsText}.
            </p>
          </section>

          {/* ════════ 4. JOINING DATE ════════ */}
          <section>
            <h4 className="font-bold text-gray-900">4. Joining Date &amp; Reporting</h4>
            <p>
              You are expected to join on <strong>{startDateText}</strong>. Please report to the
              designated office/project site by 9:00 AM on the joining date.
              {employee.activeProject ? ` Your primary project assignment is ${employee.activeProject.name}.` : ""}
              You shall report to the designated supervisor and follow the project/site schedule.
            </p>
          </section>

          {/* ════════ 5. WORKING HOURS ════════ */}
          <section>
            <h4 className="font-bold text-gray-900">5. Working Hours</h4>
            <p>
              Your working hours will be as per the project/site schedule, typically 8 hours per
              day, 6 days per week (Monday to Saturday). Overtime, if applicable, shall be
              compensated as per company policy and statutory requirements under the Minimum Wages
              Act, 1948 and the Factories Act, 1948.
            </p>
          </section>

          {/* ════════ 6. LEAVE POLICY ════════ */}
          <section>
            <h4 className="font-bold text-gray-900">6. Leave Policy</h4>
            <p>
              You are entitled to leaves as per company policy and the Shops and Establishments Act
              applicable to your state. This includes earned leave (EL), casual leave (CL), and
              sick leave (SL). Details of the leave policy are available in the employee handbook.
            </p>
          </section>

          {/* ════════ 7. PROBATION ════════ */}
          <section>
            <h4 className="font-bold text-gray-900">7. Probation &amp; Confirmation</h4>
            <p>
              {employee.employmentType === "PROBATION"
                ? `You will be on probation for a period ending ${employee.probationEndDate ? formatDate(employee.probationEndDate) : "as determined by the company"}. During probation, either party may terminate the employment with 7 days notice. Upon satisfactory completion of probation, you will be confirmed as a permanent employee.`
                : "If applicable, you may be required to undergo a probationary period as per company policy. During probation, your performance will be evaluated, and confirmation will be subject to satisfactory performance."}
            </p>
          </section>

          {/* ════════ 8. NOTICE PERIOD ════════ */}
          <section>
            <h4 className="font-bold text-gray-900">8. Notice Period &amp; Termination</h4>
            <p>
              {employee.noticePeriodDays != null
                ? employee.noticePeriodDays === 0
                  ? "Either party may terminate the employment with immediate effect."
                  : `Either party may terminate the employment by providing ${employee.noticePeriodDays} days written notice.`
                : "Either party may terminate the employment by providing 30 days written notice."}
              {" "}The company reserves the right to terminate employment immediately for cause,
              including but not limited to misconduct, negligence, breach of terms, absenteeism,
              or violation of company policies. Upon termination, all company property must be
              returned and final settlement processed per statutory requirements.
            </p>
          </section>

          {/* ════════ 9. CONFIDENTIALITY ════════ */}
          <section>
            <h4 className="font-bold text-gray-900">9. Confidentiality &amp; Intellectual Property</h4>
            <p>
              You shall maintain strict confidentiality of all proprietary information, project
              data, client information, financial details, business processes, and trade secrets
              of the company. All intellectual property created during your employment, including
              designs, drawings, reports, and software, is the exclusive property of the company.
              This obligation survives termination of employment.
            </p>
          </section>

          {/* ════════ 10. NON-COMPETE ════════ */}
          <section>
            <h4 className="font-bold text-gray-900">10. Non-Compete &amp; Non-Solicitation</h4>
            <p>
              During the course of employment and for a period of 6 months after termination, you
              shall not engage in any business or employment that directly competes with the
              company. You shall not solicit or induce any employee, client, or supplier of the
              company to terminate their relationship with the company.
            </p>
          </section>

          {/* ════════ 11. COMPLIANCE & SAFETY ════════ */}
          <section>
            <h4 className="font-bold text-gray-900">11. Compliance, Safety &amp; Code of Conduct</h4>
            <p>
              You shall comply with all company policies, safety regulations, and statutory
              requirements including the use of Personal Protective Equipment (PPE) at construction
              sites. You must adhere to the company&apos;s code of conduct and maintain professional
              behavior at all times. Non-compliance may result in disciplinary action including
              termination.
            </p>
          </section>

          {/* ════════ 12. STATUTORY COMPLIANCE ════════ */}
          <section>
            <h4 className="font-bold text-gray-900">12. Statutory Compliance</h4>
            <p>
              The company shall comply with all applicable labour laws including but not limited to
              the Employees&apos; Provident Funds Act, 1952; Employees&apos; State Insurance Act, 1948;
              Payment of Wages Act, 1936; Minimum Wages Act, 1948; Payment of Bonus Act, 1965;
              and Payment of Gratuity Act, 1972.
            </p>
            {(employee.panNumber || employee.pfNumber || employee.esiNumber || employee.uan) && (
              <div className="mt-1">
                <p className="font-semibold text-xs">Statutory Identifications:</p>
                <ul className="ml-4 list-disc text-xs">
                  {employee.panNumber && <li>PAN: {employee.panNumber}</li>}
                  {employee.pfNumber && <li>PF Account: {employee.pfNumber}</li>}
                  {employee.esiNumber && <li>ESI Number: {employee.esiNumber}</li>}
                  {employee.uan && <li>UAN: {employee.uan}</li>}
                  {employee.aadhaarNumber && <li>Aadhaar: ****{employee.aadhaarNumber.slice(-4)}</li>}
                </ul>
              </div>
            )}
          </section>

          {/* ════════ 13. DOCUMENTS REQUIRED ════════ */}
          <section>
            <h4 className="font-bold text-gray-900">13. Documents Required at Joining</h4>
            <ul className="ml-4 list-disc text-xs">
              <li>Original ID proof (Aadhaar/PAN/Driving License/Voter ID)</li>
              <li>Address proof (current and permanent)</li>
              <li>Passport-size photographs (4 copies)</li>
              <li>Bank account details (passbook/cancelled cheque)</li>
              <li>Educational/experience certificates (if applicable)</li>
              <li>PAN Card copy</li>
              <li>Aadhaar Card copy</li>
              <li>Previous employment relieving letter (if applicable)</li>
              <li>Medical fitness certificate (if required for site work)</li>
            </ul>
          </section>

          {/* ════════ 14. GRIEVANCE ════════ */}
          <section>
            <h4 className="font-bold text-gray-900">14. Grievance Redressal</h4>
            <p>
              Any grievance or dispute shall first be addressed to your immediate supervisor. If
              unresolved, it may be escalated to the HR department and thereafter to management.
              The company is committed to fair and timely resolution of all grievances.
            </p>
          </section>

          {/* ════════ 15. ACCEPTANCE ════════ */}
          <section>
            <h4 className="font-bold text-gray-900">15. Acceptance</h4>
            <p>
              If you accept this offer, please sign and return a copy of this letter to us on or
              before <strong>{startDateText}</strong>. This offer is valid for acceptance for 7 days
              from the date of issue. Your joining will be subject to satisfactory background
              verification and medical fitness (if applicable).
            </p>
          </section>

          <p className="mt-3">
            We look forward to welcoming you to the <strong>{companyDetails?.name ?? company.name}</strong> team.
          </p>

          <p className="mt-3">Sincerely,</p>
        </div>

        {/* ── Signatures ── */}
        <div className="mt-6 grid grid-cols-2 gap-12">
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
            This is a system-generated offer letter ({offerNo}) issued on {formatDate(issueDate)}.
            This offer letter is subject to the terms and conditions mentioned herein and the
            company&apos;s policies as in force from time to time.
          </p>
        </div>
      </div>
    </>
  );
}
