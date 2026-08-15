import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { CalendarDays } from "lucide-react";
import { getCompany, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatDate } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileEmptyState,
  MobileStatCard,
  MobileStatusBadge,
} from "@/components/mobile/v2/primitives";
import { MobileLeavesList } from "./MobileLeavesList";
import { MobileLeavesFab } from "./MobileLeavesFab";

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
  const canManage = hasPermission(role, PERM.HR_MANAGE);

  const [leaves, employees] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { companyId: company.id },
      orderBy: { startDate: "desc" },
      take: 50,
      include: {
        employee: { select: { id: true, name: true, trade: true } },
      },
    }),
    canManage
      ? prisma.employee.findMany({
          where: { companyId: company.id, active: true },
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

  const serialized = leaves.map((l) => ({
    id: l.id,
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
  }));

  return (
    <div>
      <div className="grid grid-cols-3 gap-2.5 mb-4">
        <MobileStatCard label="On Leave Today" value={String(onLeaveToday)} icon={CalendarDays} tone={onLeaveToday > 0 ? "signal" : "neutral"} />
        <MobileStatCard label="Pending" value={String(pending)} icon={CalendarDays} tone={pending > 0 ? "signal" : "neutral"} />
        <MobileStatCard label="Approved" value={String(approved)} icon={CalendarDays} tone="go" />
      </div>

      <MobileLeavesList items={serialized} />

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
        />
      )}

      {canManage && employees.length > 0 && (
        <MobileLeavesFab employees={employees.map((e) => ({ id: e.id, name: e.name, trade: e.trade }))} />
      )}
    </div>
  );
}
