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
 *   - project roles, individual grants and scope rows on the terminated
 *     membership are deleted (a rehire must not resurrect them) and the
 *     removal is recorded on the termination audit entry
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

    // The manager holds a project hat + an individual grant + a scope row.
    await prisma.projectAssignment.create({
      data: { userId: manager.id, projectId: project.id, scopedRole: "PROJECT_MANAGER" },
    });
    await prisma.userPermission.create({
      data: { userCompanyId: mgrMembership.id, permission: "po.approve" },
    });
    await prisma.userScope.create({
      data: { userCompanyId: mgrMembership.id, scopeKind: "PROJECT", projectId: project.id },
    });
    // The manager had also delegated THEIR approvals upward — an outbound
    // delegation pointer on their own membership must not survive termination
    // (it would silently resume if the member is ever rehired).
    await prisma.userCompany.update({
      where: { id: mgrMembership.id },
      data: { approvalsDelegatedToId: gmMembership.id, delegationEndsAt: new Date(Date.UTC(2030, 0, 1)) },
    });
    // A live session for the manager — revocation is part of disabling them.
    await prisma.session.create({
      data: { userId: manager.id, token: "mgr-session", expiresAt: new Date(Date.UTC(2030, 0, 1)) },
    });
    // A push subscription in THIS company — the device must stop receiving
    // company pushes the moment the member is terminated.
    await prisma.pushSubscription.create({
      data: { companyId: company.id, userId: manager.id, endpoint: `https://push.example/${mgrMembership.id}`, isActive: true },
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

    // 5. Access rows on the terminated membership are gone — rehire starts clean.
    expect(
      await prisma.projectAssignment.count({
        where: { userId: manager.id, project: { companyId: company.id } },
      }),
    ).toBe(0);
    expect(await prisma.userPermission.count({ where: { userCompanyId: mgrMembership.id } })).toBe(0);
    expect(await prisma.userScope.count({ where: { userCompanyId: mgrMembership.id } })).toBe(0);

    // 6. The termination audit entry records what access was removed.
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: "EMPLOYEE_TERMINATE", entityId: mgrEmp.id },
    });
    const after = audit.after as {
      removedAccess?: { projectRoles: unknown[]; grants: unknown[]; scopes: unknown[]; delegatedTo?: unknown };
    };
    expect(after.removedAccess?.projectRoles).toEqual([
      { projectId: project.id, scopedRole: "PROJECT_MANAGER" },
    ]);
    expect(after.removedAccess?.grants).toEqual([{ permission: "po.approve" }]);
    expect(after.removedAccess?.scopes).toEqual([
      { scopeKind: "PROJECT", departmentId: null, projectId: project.id },
    ]);
    expect(after.removedAccess?.delegatedTo).toBe(gmMembership.id);

    // 7. The leaver's own outbound delegation is cleared — no silent revival.
    const mgrMemAfter = await prisma.userCompany.findUniqueOrThrow({ where: { id: mgrMembership.id } });
    expect(mgrMemAfter.active).toBe(false);
    expect(mgrMemAfter.approvalsDelegatedToId).toBeNull();
    expect(mgrMemAfter.delegationEndsAt).toBeNull();

    // 8. No remaining memberships → account disabled + sessions revoked.
    expect((await prisma.user.findUniqueOrThrow({ where: { id: manager.id } })).active).toBe(false);
    expect(await prisma.session.count({ where: { userId: manager.id } })).toBe(0);

    // 9. The company's push subscriptions are dead on the device too.
    expect(
      await prisma.pushSubscription.count({
        where: { userId: manager.id, companyId: company.id, isActive: true },
      }),
    ).toBe(0);
  });

  it("restore fully resets the agreement lifecycle + termination-stamped end date", async () => {
    const { company, user } = await createTestFixture();

    const emp = await prisma.employee.create({
      data: {
        name: "Restored Worker", phone: "9000000099", companyId: company.id,
        wageType: "DAILY", dailyRate: new Decimal(700), active: true,
        employmentType: "PERMANENT",
        // Simulate a previously confirmed agreement.
        contractStatus: "CONFIRMED",
        contractIssuedAt: new Date("2026-01-05"),
        contractConfirmedAt: new Date("2026-01-06"),
        contractToken: "old-signing-token",
      },
    });

    const { terminateEmployee, restoreEmployee } = await import("../employee-account");

    // Terminate with an explicit end date — stamps contractEndDate.
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 10);
    const isoEnd = endDate.toISOString().slice(0, 10);
    await terminateEmployee({
      employeeId: emp.id, companyId: company.id, actorUserId: user.id,
      reason: "RESIGNATION", employmentEndDate: isoEnd,
    });

    const terminated = await prisma.employee.findUniqueOrThrow({ where: { id: emp.id } });
    expect(terminated.contractStatus).toBe("TERMINATED");
    expect(terminated.contractEndDate?.toISOString().slice(0, 10)).toBe(isoEnd);
    // Exit record carries the real last day (matches the stamped end date).
    const exit = await prisma.employeeExit.findUniqueOrThrow({ where: { employeeId: emp.id } });
    expect(exit.terminationDate.toISOString().slice(0, 10)).toBe(isoEnd);

    await restoreEmployee({ employeeId: emp.id, companyId: company.id, actorUserId: user.id });

    const restored = await prisma.employee.findUniqueOrThrow({ where: { id: emp.id } });
    expect(restored.active).toBe(true);
    expect(restored.deletedAt).toBeNull();
    // Agreement lifecycle fully reset — a fresh issue→confirm cycle can run.
    expect(restored.contractStatus).toBeNull();
    expect(restored.contractIssuedAt).toBeNull();
    expect(restored.contractConfirmedAt).toBeNull();
    expect(restored.contractAttachmentId).toBeNull();
    expect(restored.contractToken).toBeNull();
    // Termination-stamped end date cleared so lazy-expiry can't flip the
    // next agreement to EXPIRED instantly.
    expect(restored.contractEndDate).toBeNull();
    // Exit record removed (re-termination must be possible).
    expect(await prisma.employeeExit.count({ where: { employeeId: emp.id } })).toBe(0);
  });
});
