import { connection } from "next/server";
import { notFound } from "next/navigation";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PrintToolbar } from "@/components/print/print-button";
import { PrintHeader } from "@/components/print/print-header";
import { formatCurrency, formatDate } from "@/lib/utils";

/**
 * Appointment Letter — a formal letter of appointment issued after the
 * employee joins. Unlike the offer letter (pre-joining) and the employment
 * agreement (the full contract), this is a concise, formal letter that
 * confirms the appointment — position, joining date, employment type,
 * compensation summary, probation, and notice period. Detailed terms
 * remain in the employment agreement.
 *
 * Auto-attached to the employee profile as an EntityAttachment with
 * category = "appointment-letter".
 */
export default async function AppointmentLetterPage({
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
        reportingLocation: { select: { name: true, address: true } },
        salaryComponents: { where: { active: true }, select: { amount: true, frequency: true, isDeduction: true } },
      },
    }),
    prisma.company.findFirst({
      where: { id: company.id },
      select: { name: true, address: true, gstin: true, phone: true, email: true, pan: true },
    }),
  ]);

  if (!employee) notFound();

  // ── Compute derived values ──
  const apptNo = `EMP-APT-${employee.id.slice(-8).toUpperCase()}`;
  const issueDate = employee.appointmentLetterIssuedAt ?? new Date();

  const employmentTypeLabel: Record<string, string> = {
    PERMANENT: "Permanent Employment",
    CONTRACT: "Fixed-Term Contract",
    CASUAL: "Casual Employment",
    PROBATION: "Probationary Employment",
    INTERN: "Internship",
  };
  const typeLabel = employmentTypeLabel[employee.employmentType ?? "PERMANENT"] ?? "Employment";

  // ── Compute monthly earnings from salary components ──
  const monthlyEarnings = employee.salaryComponents
    .filter((c) => !c.isDeduction && c.frequency === "MONTHLY")
    .reduce((sum, c) => sum + toNum(c.amount), 0);

  // Use Employee.wage fields if set, otherwise compute from salary components
  const computedMonthly = monthlyEarnings > 0 ? monthlyEarnings : null;
  const effectiveMonthly = toNum(employee.monthlySalary) > 0 ? toNum(employee.monthlySalary) : computedMonthly;
  const effectiveDaily = toNum(employee.dailyRate) > 0 ? toNum(employee.dailyRate) : (computedMonthly ? Math.round(computedMonthly / 30) : 0);

  const wageText =
    employee.wageType === "DAILY"
      ? `a daily wage of ${formatCurrency(effectiveDaily)} per working day`
      : employee.wageType === "MONTHLY"
        ? `a monthly salary of ${formatCurrency(effectiveMonthly ?? 0)} per month`
        : `a fixed contract amount of ${formatCurrency(effectiveMonthly ?? 0)}`;

  const startDateText = employee.joinDate
    ? formatDate(employee.joinDate)
    : employee.contractStartDate
      ? formatDate(employee.contractStartDate)
      : "a mutually agreed date";

  const employeeName = employee.user?.name ?? employee.name;
  const employeeDesignation = employee.user?.designation ?? employee.designation ?? "Employee";
  const employeeAddress = employee.permanentAddress ?? employee.currentAddress;

  const companyName = companyDetails?.name ?? company.name;

  const workLocation = employee.reportingLocation?.name
    ?? employee.activeProject?.name
    ?? "the company's designated office / project site";

  return (
    <>
      <PrintToolbar title="Appointment Letter" />
      <div
        className="print-page mx-auto my-8 max-w-3xl bg-white p-10 shadow-lg print:my-0 print:shadow-none print:p-8"
        style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}
      >
        <PrintHeader
          company={{
            name: companyName,
            address: companyDetails?.address,
            gstin: companyDetails?.gstin,
            phone: companyDetails?.phone,
            email: companyDetails?.email,
          }}
          title="Appointment Letter"
          docNumber={apptNo}
          date={issueDate}
          extra={
            <div className="text-xs text-gray-500">
              Status: <span className="font-semibold">{employee.appointmentLetterStatus ?? "DRAFT"}</span>
            </div>
          }
        />

        {/* ── Date & Reference ── */}
        <div className="mt-6 space-y-4 text-sm leading-relaxed text-gray-800">
          <div className="flex items-start justify-between">
            <div>
              <p>Ref No: <strong className="font-mono">{apptNo}</strong></p>
            </div>
            <div className="text-right">
              <p>Date: <strong>{formatDate(issueDate)}</strong></p>
            </div>
          </div>

          {/* ── Employee Name & Address ── */}
          <div>
            <p className="font-semibold">To,</p>
            <p className="font-semibold text-gray-900">{employeeName}</p>
            {employeeAddress && (
              <p className="whitespace-pre-line text-gray-700">{employeeAddress}</p>
            )}
            {employee.phone && <p>Phone: {employee.phone}</p>}
            {employee.email && <p>Email: {employee.email}</p>}
            {employee.dateOfBirth && (
              <p>Date of Birth: {formatDate(employee.dateOfBirth)}</p>
            )}
            {employee.bloodGroup && (
              <p>Blood Group: {employee.bloodGroup}</p>
            )}
          </div>

          {/* ── Subject ── */}
          <p>
            <strong>Subject: Appointment Letter</strong>
          </p>

          {/* ── Opening ── */}
          <p>
            Dear {employeeName.split(" ")[0]},
          </p>
          <p>
            We are pleased to appoint you as <strong>{employeeDesignation}</strong>
            {employee.trade ? ` (Trade: ${employee.trade})` : ""} at{" "}
            <strong>{companyName}</strong>, effective from{" "}
            <strong>{startDateText}</strong>. We believe your skills and experience
            will be a valuable addition to our team.
          </p>

          {/* ── Key Terms ── */}
          <div className="mt-2">
            <p className="font-semibold text-gray-900">Key Terms of Appointment:</p>
            <ul className="ml-5 list-disc space-y-1">
              <li>
                <strong>Position:</strong> {employeeDesignation}
                {employee.trade ? ` (Trade: ${employee.trade})` : ""}
              </li>
              <li>
                <strong>Joining Date:</strong> {startDateText}
              </li>
              <li>
                <strong>Employment Type:</strong> {typeLabel}
                {employee.contractStartDate && employee.contractEndDate
                  ? ` (from ${formatDate(employee.contractStartDate)} to ${formatDate(employee.contractEndDate)})`
                  : ""}
              </li>
              <li>
                <strong>Compensation:</strong> You will be compensated at {wageText},
                subject to applicable statutory deductions as per government regulations.
              </li>
              <li>
                <strong>Work Location:</strong> {workLocation}
                {employee.activeProject ? ` (Project: ${employee.activeProject.name})` : ""}
              </li>
            </ul>
          </div>

          {/* ── Probation (if applicable) ── */}
          {employee.employmentType === "PROBATION" && (
            <p>
              <strong>Probation:</strong> You will be on probation
              {employee.probationEndDate
                ? ` until ${formatDate(employee.probationEndDate)}`
                : " for a period as determined by the company"}
              . Upon satisfactory performance, you will be confirmed as a permanent employee.
            </p>
          )}

          {/* ── Notice Period ── */}
          <p>
            <strong>Notice Period:</strong>{" "}
            {employee.noticePeriodDays != null
              ? employee.noticePeriodDays === 0
                ? "Either party may terminate the employment with immediate effect."
                : `Either party may terminate the employment by providing ${employee.noticePeriodDays} days written notice.`
              : "Either party may terminate the employment by providing 30 days written notice."}
          </p>

          {/* ── Reference to detailed agreement ── */}
          <p>
            Detailed terms and conditions of your employment, including but not
            limited to confidentiality, intellectual property, code of conduct,
            safety regulations, and statutory compliance, are set out in the
            Employment Agreement issued separately. This appointment letter is
            issued in conjunction with and subject to the terms of that agreement.
          </p>

          {/* ── Closing ── */}
          <p>
            We look forward to your contribution to <strong>{companyName}</strong>{" "}
            and trust that your association with us will be mutually rewarding and
            productive.
          </p>

          <p className="pt-2">Yours sincerely,</p>
        </div>

        {/* ── Signature Block ── */}
        <div className="mt-8">
          <div className="inline-block">
            <p className="text-sm font-semibold text-gray-900">For {companyName}</p>
            <div className="mt-8 border-t border-gray-500 pt-1" style={{ width: "220px" }}>
              <p className="text-sm font-semibold text-gray-700">Authorised Signatory</p>
              <p className="text-xs text-gray-500">{companyDetails?.address ?? ""}</p>
              {companyDetails?.phone && (
                <p className="text-xs text-gray-500">Ph: {companyDetails.phone}</p>
              )}
              {companyDetails?.email && (
                <p className="text-xs text-gray-500">{companyDetails.email}</p>
              )}
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="mt-10 border-t border-gray-200 pt-2 text-center text-xs text-gray-400">
          <p>
            This is a system-generated appointment letter ({apptNo}) issued on{" "}
            {formatDate(issueDate)}. This letter is subject to the terms and
            conditions mentioned herein and the company employment agreement
            and policies as in force from time to time.
          </p>
        </div>
      </div>
    </>
  );
}
