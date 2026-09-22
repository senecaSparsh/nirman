/**
 * terminateEmployee — side-effect completeness.
 *
 * Terminating a member must not leave orphans:
 *   - direct reports re-parent to the terminated member's manager
 *     (approvals/org-chart continuity)
 *   - pending + future-dated approved leaves are cancelled (they'll never
 *     be taken) and their auto-written future PAID_LEAVE rows are removed
 *   - delegations pointing AT the terminated membership are cleared so the
 *     delegator's approvals resume flowing
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { resetDb, createTestFixture } from "./setup";

describe("terminateEmployee side-effects", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("re-parents reports, cancels future leaves, clears inbound delegation", async () => {
    const { company, user, project } = await createTestFixture();

    // Grand-manager → manager → subordinate chain.
    const grandManager = await prisma.user.create({
      data: { email: "gm@test.in", name: "Grand Manager", role: "ADMIN", active: true },
    });
    const manager = await prisma.user.create({
      data: { email: "mgr@test.in", name: "Manager", role: "HR_MANAGER", active: true },
    });
    const sub = await prisma.user.create({
      data: { email: "sub@test.in", name: "Subordinate", role: "SUPERVISOR", active: true },
    });

    const gmMembership = await prisma.userCompany.create({
      data: { userId: grandManager.id, companyId: company.id, role: "ADMIN", active: true },
    });
    const mgrMembership = await prisma.userCompany.create({
      data: { userId: manager.id, companyId: company.id, role: "HR_MANAGER", active: true, reportsToUserCompanyId: gmMembership.id },
    });
    const subMembership = await prisma.userCompany.create({
      data: { userId: sub.id, companyId: company.id, role: "SUPERVISOR", active: true, reportsToUserCompanyId: mgrMembership.id },
    });

    const gmEmp = await prisma.employee.create({
      data: { name: "Grand Manager", phone: "9000000001", companyId: company.id, userId: grandManager.id, wageType: "MONTHLY", monthlySalary: new Decimal(90000), active: true, activeProjectId: project.id },
    });
    const mgrEmp = await prisma.employee.create({
      data: { name: "Manager", phone: "9000000002", companyId: company.id, userId: manager.id, wageType: "MONTHLY", monthlySalary: new Decimal(60000), active: true, activeProjectId: project.id, reportsToEmployeeId: gmEmp.id },
    });
    const subEmp = await prisma.employee.create({
      data: { name: "Subordinate", phone: "9000000003", companyId: company.id, userId: sub.id, wageType: "DAILY", dailyRate: new Decimal(600), active: true, activeProjectId: project.id, reportsToEmployeeId: mgrEmp.id },
    });

    // Manager has a future-dated approved leave + a pending one.
    const futureLeave = await prisma.leaveRequest.create({
      data: {
        companyId: company.id, employeeId: mgrEmp.id, type: "CASUAL",
        startDate: new Date(Date.UTC(2030, 5, 10)), endDate: new Date(Date.UTC(2030, 5, 12)),
        days: new Decimal(3), status: "APPROVED",
      },
    });
    const pendingLeave = await prisma.leaveRequest.create({
      data: {
        companyId: company.id, employeeId: mgrEmp.id, type: "SICK",
        startDate: new Date(Date.UTC(2030, 6, 1)), endDate: new Date(Date.UTC(2030, 6, 2)),
        days: new Decimal(2), status: "PENDING",
      },
    });
    // Auto-written future PAID_LEAVE rows for the approved leave.
    await prisma.workerAttendance.create({
      data: { employeeId: mgrEmp.id, companyId: company.id, date: new Date(Date.UTC(2030, 5, 10)), status: "PAID_LEAVE" },
    });

    // Someone delegated approvals TO the manager's membership.
    await prisma.userCompany.update({
      where: { id: subMembership.id },
      data: { approvalsDelegatedToId: mgrMembership.id, delegationEndsAt: new Date(Date.UTC(2030, 0, 1)) },
    });

    const { terminateEmployee } = await import("../employee-account");
    await terminateEmployee({ employeeId: mgrEmp.id, companyId: company.id, actorUserId: user.id });

    // 1. Subordinate re-parented to the manager's manager (employee side).
    const subEmpAfter = await prisma.employee.findUniqueOrThrow({ where: { id: subEmp.id } });
    expect(subEmpAfter.reportsToEmployeeId).toBe(gmEmp.id);

    // 2. Membership side re-parented too.
    const subMemAfter = await prisma.userCompany.findUniqueOrThrow({ where: { id: subMembership.id } });
    expect(subMemAfter.reportsToUserCompanyId).toBe(gmMembership.id);

    // 3. Future approved leave cancelled + its attendance rows removed.
    const fl = await prisma.leaveRequest.findUniqueOrThrow({ where: { id: futureLeave.id } });
    expect(fl.status).toBe("CANCELLED");
    const pl = await prisma.leaveRequest.findUniqueOrThrow({ where: { id: pendingLeave.id } });
    expect(pl.status).toBe("CANCELLED");
    const leftover = await prisma.workerAttendance.count({
      where: { employeeId: mgrEmp.id, date: { gt: new Date() }, status: "PAID_LEAVE" },
    });
    expect(leftover).toBe(0);

    // 4. Delegation pointing at the terminated membership cleared.
    const subMem2 = await prisma.userCompany.findUniqueOrThrow({ where: { id: subMembership.id } });
    expect(subMem2.approvalsDelegatedToId).toBeNull();
    expect(subMem2.delegationEndsAt).toBeNull();
  });
});
