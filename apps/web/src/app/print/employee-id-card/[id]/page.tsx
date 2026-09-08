import { connection } from "next/server";
import { notFound } from "next/navigation";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PrintToolbar } from "@/components/print/print-button";
import { formatDate } from "@/lib/utils";

/**
 * Employee ID Card — a printable identification card with employee
 * details, company branding, and emergency contact information.
 *
 * Designed to be printed on standard card stock or laminated.
 * Auto-attached to the employee profile as an EntityAttachment with
 * category = "id-card".
 */
export default async function EmployeeIdCardPage({
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
          id: true, name: true, email: true, phone: true,
          employeeCode: true, designation: true, department: true,
        },
      },
      activeProject: { select: { name: true } },
      reportingLocation: { select: { name: true } },
    },
  });

  if (!employee) notFound();

  const companyDetails = await prisma.company.findFirst({
    where: { id: company.id },
    select: { name: true, address: true, phone: true, email: true },
  });

  const employeeName = employee.user?.name ?? employee.name;
  const employeeDesignation = employee.user?.designation ?? employee.designation ?? "Employee";
  const employeeCode = employee.user?.employeeCode ?? `EMP-${employee.id.slice(-6).toUpperCase()}`;
  const employeePhone = employee.user?.phone ?? employee.phone ?? "—";
  const bloodGroup = employee.bloodGroup ?? "—";
  const issueDate = employee.idCardIssuedAt ?? new Date();
  // eslint-disable-next-line react-hooks/purity
  const validThru = employee.contractEndDate ?? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

  // Format DOB as DD/MM/YYYY for the ID card.
  const dobFormatted = employee.dateOfBirth
    ? `${String(employee.dateOfBirth.getDate()).padStart(2, "0")}/${String(employee.dateOfBirth.getMonth() + 1).padStart(2, "0")}/${employee.dateOfBirth.getFullYear()}`
    : "—";

  return (
    <>
      <PrintToolbar title="Employee ID Card" />
      <div className="print-page mx-auto my-8 flex items-center justify-center bg-white print:my-0">
        <style>{`
          @media print {
            @page { size: 85mm 54mm; margin: 0; }
            .id-card { width: 85mm; height: 54mm; }
          }
        `}</style>

        {/* ════════ FRONT SIDE ════════ */}
        <div className="flex flex-col items-center gap-6">
          <div
            className="id-card relative overflow-hidden rounded-xl border-2 shadow-xl"
            style={{
              width: "85mm",
              height: "54mm",
              borderColor: "#1e293b",
              backgroundColor: "#fff",
            }}
          >
            {/* ── Header band ── */}
            <div
              className="flex items-center justify-between px-2 py-1"
              style={{ backgroundColor: "#0f172a", color: "#fff" }}
            >
              <span className="text-[7px] font-bold uppercase tracking-wider">
                {companyDetails?.name ?? company.name}
              </span>
              <span className="text-[6px] opacity-80">EMPLOYEE ID CARD</span>
            </div>

            {/* ── Body ── */}
            <div className="flex gap-2 px-2 py-1.5">
              {/* Photo — real photo if available, else initial-based placeholder */}
              <div
                className="flex shrink-0 items-center justify-center overflow-hidden rounded border"
                style={{
                  width: "20mm",
                  height: "26mm",
                  borderColor: "#cbd5e1",
                  backgroundColor: "#f1f5f9",
                }}
              >
                {employee.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={employee.photoUrl}
                    alt={employeeName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="text-center">
                    <div
                      className="mx-auto mb-0.5 flex items-center justify-center rounded-full"
                      style={{
                        width: "10mm",
                        height: "10mm",
                        backgroundColor: "#94a3b8",
                      }}
                    >
                      <span className="text-[8px] font-bold text-white">
                        {employeeName.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <p className="text-[5px] text-gray-400">PHOTO</p>
                  </div>
                )}
              </div>

              {/* Details */}
              <div className="flex flex-1 flex-col justify-between text-[7px] leading-tight">
                <div>
                  <p className="text-[8px] font-bold text-gray-900">{employeeName}</p>
                  <p className="text-[6px] text-gray-600">{employeeDesignation}</p>
                  {employee.trade && (
                    <p className="text-[6px] text-gray-500">Trade: {employee.trade}</p>
                  )}
                  <div className="mt-1 space-y-0.5">
                    <div className="flex gap-1">
                      <span className="font-semibold text-gray-500">Code:</span>
                      <span className="font-mono font-bold text-gray-900">{employeeCode}</span>
                    </div>
                    {employeePhone !== "—" && (
                      <div className="flex gap-1">
                        <span className="font-semibold text-gray-500">Ph:</span>
                        <span className="text-gray-800">{employeePhone}</span>
                      </div>
                    )}
                    {employee.activeProject && (
                      <div className="flex gap-1">
                        <span className="font-semibold text-gray-500">Project:</span>
                        <span className="text-gray-800">{employee.activeProject.name}</span>
                      </div>
                    )}
                    {employee.reportingLocation && (
                      <div className="flex gap-1">
                        <span className="font-semibold text-gray-500">Location:</span>
                        <span className="text-gray-800">{employee.reportingLocation.name}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex justify-between text-[5px] text-gray-400">
                  <span>Issued: {formatDate(issueDate)}</span>
                  <span>Valid thru: {formatDate(validThru)}</span>
                </div>
              </div>
            </div>

            {/* ── Footer band ── */}
            <div
              className="absolute bottom-0 left-0 right-0 px-2 py-0.5 text-center"
              style={{ backgroundColor: "#0f172a", color: "#94a3b8" }}
            >
              <p className="text-[5px]">
                {companyDetails?.address ? companyDetails.address.slice(0, 60) : ""}
                {companyDetails?.phone ? ` · Ph: ${companyDetails.phone}` : ""}
              </p>
            </div>
          </div>

          {/* ════════ BACK SIDE ════════ */}
          <div
            className="id-card relative overflow-hidden rounded-xl border-2 shadow-xl"
            style={{
              width: "85mm",
              height: "54mm",
              borderColor: "#1e293b",
              backgroundColor: "#fff",
            }}
          >
            {/* ── Emergency contact ── */}
            <div className="px-2 py-1.5">
              <div
                className="mb-1 rounded px-1 py-0.5 text-center text-[6px] font-bold uppercase tracking-wider text-white"
                style={{ backgroundColor: "#dc2626" }}
              >
                In Case of Emergency
              </div>
              <div className="space-y-0.5 text-[7px] leading-tight">
                {employee.emergencyContactName ? (
                  <>
                    <div className="flex gap-1">
                      <span className="font-semibold text-gray-500">Contact:</span>
                      <span className="text-gray-900">{employee.emergencyContactName}</span>
                    </div>
                    {employee.emergencyContactPhone && (
                      <div className="flex gap-1">
                        <span className="font-semibold text-gray-500">Phone:</span>
                        <span className="font-bold text-gray-900">{employee.emergencyContactPhone}</span>
                      </div>
                    )}
                    {employee.emergencyContactRelation && (
                      <div className="flex gap-1">
                        <span className="font-semibold text-gray-500">Relation:</span>
                        <span className="text-gray-700">{employee.emergencyContactRelation}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-gray-400">Not configured</p>
                )}
              </div>
            </div>

            {/* ── Personal & emergency info (statutory IDs redacted) ── */}
            <div className="border-t border-gray-200 px-2 py-1">
              <p className="mb-0.5 text-[6px] font-bold uppercase tracking-wider text-gray-500">
                Personal & Emergency
              </p>
              <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[6px] leading-tight">
                {/* Sensitive statutory IDs (PAN, PF, ESI, UAN) are intentionally
                    NOT printed on the ID card — only masked indicators are shown
                    so the holder can confirm enrollment without exposing the
                    numbers. */}
                <div className="flex gap-1">
                  <span className="font-semibold text-gray-500">PAN:</span>
                  <span className="text-gray-800">{employee.panNumber ? "****" : "—"}</span>
                </div>
                <div className="flex gap-1">
                  <span className="font-semibold text-gray-500">PF:</span>
                  <span className="text-gray-800">{employee.pfNumber ? "****" : "—"}</span>
                </div>
                <div className="flex gap-1">
                  <span className="font-semibold text-gray-500">ESI:</span>
                  <span className="text-gray-800">{employee.esiNumber ? "****" : "—"}</span>
                </div>
                <div className="flex gap-1">
                  <span className="font-semibold text-gray-500">UAN:</span>
                  <span className="text-gray-800">{employee.uan ? "****" : "—"}</span>
                </div>
                <div className="flex gap-1">
                  <span className="font-semibold text-gray-500">Blood:</span>
                  <span className="text-gray-800">{bloodGroup}</span>
                </div>
                <div className="flex gap-1">
                  <span className="font-semibold text-gray-500">DOB:</span>
                  <span className="text-gray-800">{dobFormatted}</span>
                </div>
              </div>
            </div>

            {/* ── QR code placeholder (for verification) ── */}
            <div className="border-t border-gray-200 px-2 py-1">
              <div className="flex items-center gap-2">
                <div
                  className="flex shrink-0 items-center justify-center rounded border"
                  style={{
                    width: "12mm",
                    height: "12mm",
                    borderColor: "#cbd5e1",
                    backgroundColor: "#f8fafc",
                  }}
                >
                  {/* Simple QR-code placeholder grid — replace with a real
                      generated QR (e.g. linking to the employee profile) later. */}
                  <div
                    className="grid grid-cols-5 gap-px"
                    style={{ width: "9mm", height: "9mm" }}
                  >
                    {Array.from({ length: 25 }).map((_, i) => (
                      <div
                        key={i}
                        style={{
                          backgroundColor: (i * 7 + 3) % 3 === 0 ? "#0f172a" : "transparent",
                        }}
                      />
                    ))}
                  </div>
                </div>
                <div className="text-[5px] leading-tight text-gray-500">
                  <p className="font-semibold">Scan to verify</p>
                  <p>Employee ID & status</p>
                  <p className="font-mono text-gray-700">{employeeCode}</p>
                </div>
              </div>
            </div>

            {/* ── Address ── */}
            <div className="border-t border-gray-200 px-2 py-1">
              <p className="mb-0.5 text-[6px] font-bold uppercase tracking-wider text-gray-500">
                Address
              </p>
              <p className="text-[6px] leading-tight text-gray-700">
                {employee.permanentAddress ?? "Not provided"}
              </p>
            </div>

            {/* ── Footer ── */}
            <div
              className="absolute bottom-0 left-0 right-0 px-2 py-0.5 text-center"
              style={{ backgroundColor: "#0f172a", color: "#64748b" }}
            >
              <p className="text-[5px]">
                If found, please return to: {companyDetails?.name ?? company.name}
                {companyDetails?.phone ? ` · ${companyDetails.phone}` : ""}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Screen-only instructions ── */}
      <div className="mx-auto mt-4 max-w-2xl text-center text-sm text-gray-500 print:hidden">
        <p>
          Print on 85mm × 54mm card stock (standard ID card size). Use the print button above,
          then cut along the card borders and laminate.
        </p>
      </div>
    </>
  );
}
