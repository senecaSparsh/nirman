import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { prisma } from "@nirman/db";
import { CalendarDays, Plus } from "lucide-react";
import { getCompany, getUserRole, getActionPermissions, scopeWhere } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { ANNUAL_LEAVE_ENTITLEMENT } from "@nirman/services";
import {
  MobileEmptyState,
  MobileStatCard,
  MobileCta,
} from "@/components/mobile/v2/primitives";
import { MobileLeavesList } from "./MobileLeavesList";
import { MobileLeavesFab } from "./MobileLeavesFab";
import type { MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";

/**
 * /m/hr/leaves — mobile leave management.
 *
 * Purpose: an HR manager opens this to see who's on leave, approve
 * pending requests, and record new leave entries.
 */
export default function MobileLeavesPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileLeavesContent />
    </Suspense>
  );
}

async function MobileLeavesContent() {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  if (!hasPermission(role, PERM.HR_VIEW)) {
    redirect("/m");
  }
  const canManage = hasPermission(role, PERM.HR_MANAGE);
  // Scope-aware action permissions
  const actions = await getActionPermissions();

  const [leaves, employees] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { companyId: company.id, ...await scopeWhere("LeaveRequest", {}) },
      orderBy: { startDate: "desc" },
      take: 50,
      include: {
        employee: { select: { id: true, name: true, trade: true } },
      },
    }),
    actions.canRecordLeave
      ? prisma.employee.findMany({
          where: { companyId: company.id, active: true, deletedAt: null },
          orderBy: { name: "asc" },
          select: { id: true, name: true, trade: true },
        })
      : [],
  ]);

  const now = new Date();
  const onLeaveToday = leaves.filter(
    (l) => new Date(l.startDate) <= now && new Date(l.endDate) >= now,
  ).length;
  const pending = leaves.filter((l) => l.status === "PENDING").length;
  const approved = leaves.filter((l) => l.status === "APPROVED").length;

  // For each leave, the viewer should see the employee's used-vs-entitled
  // balance for that type+year — on pending cards it informs the approve
  // decision; on approved cards it shows the running balance. Sum approved
  // days per (employee, type) across the years the displayed leaves fall in.
  const usageYears = [...new Set(leaves.map((l) => new Date(l.startDate).getUTCFullYear()))];
  const usageRows = leaves.length > 0
    ? (await Promise.all(usageYears.map((y) =>
        prisma.leaveRequest.groupBy({
          by: ["employeeId", "type"],
          where: {
            companyId: company.id,
            status: "APPROVED",
            startDate: { gte: new Date(Date.UTC(y, 0, 1)), lte: new Date(Date.UTC(y, 11, 31, 23, 59, 59)) },
          },
          _sum: { days: true },
        }).then((rows) => rows.map((r) => ({ employeeId: r.employeeId, type: r.type, year: y, days: r._sum.days }))),
      ))).flat()
    : [];
  const usageByKey = new Map(usageRows.map((r) => [`${r.employeeId}:${r.type}:${r.year}`, Number(r.days ?? 0)]));

  const serialized = leaves.map((l) => ({
    id: l.id,
    employeeId: l.employeeId,
    employeeName: l.employee.name,
    employeeTrade: l.employee.trade ?? null,
    type: l.type,
    status: l.status,
    startDate: l.startDate.toISOString(),
    endDate: l.endDate.toISOString(),
    reason: l.reason ?? null,
    days: Math.ceil(
      (new Date(l.endDate).getTime() - new Date(l.startDate).getTime()) / (24 * 60 * 60 * 1000),
    ) + 1,
    usedDays: usageByKey.get(`${l.employeeId}:${l.type}:${new Date(l.startDate).getUTCFullYear()}`) ?? 0,
    entitlement: ANNUAL_LEAVE_ENTITLEMENT[l.type] ?? 0,
  }));

  const csvColumns: MobileColumnSpec[] = [
    { key: "employeeName", label: "Employee" },
    { key: "employeeTrade", label: "Trade" },
    { key: "type", label: "Leave Type" },
    { key: "startDate", label: "From Date", format: "date" },
    { key: "endDate", label: "To Date", format: "date" },
    { key: "days", label: "Days" },
    { key: "status", label: "Status" },
  ];

  return (
    <div>
      <div className="grid grid-cols-3 gap-1.5 mb-4">
        <MobileStatCard label="On Leave Today" value={String(onLeaveToday)} icon={CalendarDays} tone={onLeaveToday > 0 ? "signal" : "neutral"} />
        <MobileStatCard label="Pending" value={String(pending)} icon={CalendarDays} tone={pending > 0 ? "signal" : "neutral"} />
        <MobileStatCard label="Approved" value={String(approved)} icon={CalendarDays} tone="go" />
      </div>

      <MobileLeavesList
        items={serialized}
        canManage={canManage}
        exportTitle="Leaves"
        exportRows={serialized as unknown as Record<string, unknown>[]}
        exportColumns={csvColumns}
        exportSummary={`${serialized.length} leave records · ${pending} pending`}
      />

      {leaves.length === 0 && (
        <MobileEmptyState
          icon={CalendarDays}
          title="No leave records"
          hint={
            canManage
              ? employees.length === 0
                ? "Add employees first, then record their leave entries"
                : "Tap + to record a leave entry"
              : "Leave records will appear here"
          }
          action={
            canManage && employees.length === 0 ? (
              <MobileCta href="/m/hr/employees" icon={Plus} variant="primary">Go to Employees</MobileCta>
            ) : undefined
          }
        />
      )}

      {actions.canRecordLeave && employees.length > 0 && (
        <MobileLeavesFab employees={employees.map((e) => ({ id: e.id, name: e.name, trade: e.trade }))} />
      )}
    </div>
  );
}
