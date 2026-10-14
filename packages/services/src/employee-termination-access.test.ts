import { describe, it, expect, vi, beforeEach } from "vitest";
import { terminateEmployee } from "./employee-account";
import { withSerializableTransaction } from "./transaction";
import { logAction } from "./audit";

vi.mock("@nirman/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@nirman/db")>()),
  prisma: {},
}));
vi.mock("./transaction", () => ({ withSerializableTransaction: vi.fn() }));
vi.mock("./audit", () => ({ logAction: vi.fn().mockResolvedValue(undefined) }));

function makeTx() {
  return {
    employee: {
      findFirst: vi.fn().mockResolvedValue({ id: "emp-1", userId: "user-1", autoDepositEnabled: false }),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findUnique: vi.fn().mockResolvedValue({ reportsToEmployeeId: null }),
    },
    userCompany: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      count: vi.fn().mockResolvedValue(1),
      findUnique: vi.fn().mockResolvedValue({
        id: "uc-1",
        reportsToUserCompanyId: null,
        approvalsDelegatedToId: "uc-deputy",
        delegationEndsAt: new Date("2030-01-01"),
        userPermissions: [{ permission: "po.approve" }],
        scopes: [{ scopeKind: "PROJECT", departmentId: null, projectId: "p1" }],
      }),
    },
    user: {
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    session: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    pushSubscription: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    companyPhone: {
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
    phoneAssignment: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    leaveRequest: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    workerAttendance: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    employeeExit: { create: vi.fn().mockResolvedValue({}) },
    employeeAdvance: { findMany: vi.fn().mockResolvedValue([]) },
    projectAssignment: {
      findMany: vi.fn().mockResolvedValue([{ projectId: "p1", scopedRole: "PROJECT_MANAGER" }]),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    userPermission: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    userScope: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    taskTimeLog: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
  };
}

const input = { employeeId: "emp-1", companyId: "co-1", actorUserId: "admin-1", reason: "resigned" };

describe("terminating an employee removes their access in that company", () => {
  let tx: ReturnType<typeof makeTx>;

  beforeEach(() => {
    vi.clearAllMocks();
    tx = makeTx();
    vi.mocked(withSerializableTransaction).mockImplementation(async (fn) => fn(tx as never));
  });

  it("deletes the leaver's project roles, individual grants and scope rows for this company", async () => {
    await terminateEmployee(input as never);
    expect(tx.projectAssignment.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", project: { companyId: "co-1" } },
    });
    expect(tx.userPermission.deleteMany).toHaveBeenCalledWith({ where: { userCompanyId: "uc-1" } });
    expect(tx.userScope.deleteMany).toHaveBeenCalledWith({ where: { userCompanyId: "uc-1" } });
  });

  it("records what was removed in the termination audit entry", async () => {
    await terminateEmployee(input as never);
    expect(logAction).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: "EMPLOYEE_TERMINATE",
        after: expect.objectContaining({
          removedAccess: {
            projectRoles: [{ projectId: "p1", scopedRole: "PROJECT_MANAGER" }],
            grants: [{ permission: "po.approve" }],
            scopes: [{ scopeKind: "PROJECT", departmentId: null, projectId: "p1" }],
            delegatedTo: "uc-deputy",
          },
        }),
      }),
    );
  });

  it("clears the leaver's own outbound delegation on the deactivated membership", async () => {
    await terminateEmployee(input as never);
    expect(tx.userCompany.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ approvalsDelegatedToId: null, delegationEndsAt: null }),
      }),
    );
  });

  it("disables the account and revokes sessions when no active membership remains", async () => {
    tx.userCompany.count.mockResolvedValue(0);
    await terminateEmployee(input as never);
    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ active: false }) }),
    );
    expect(tx.session.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
  });

  it("deactivates the leaver's push subscriptions in that company", async () => {
    await terminateEmployee(input as never);
    expect(tx.pushSubscription.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", companyId: "co-1" },
      data: { isActive: false },
    });
  });

  it("stops the leaver's open task timers so they stop accruing time", async () => {
    await terminateEmployee(input as never);
    expect(tx.taskTimeLog.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1", endedAt: null },
        data: expect.objectContaining({ endedAt: expect.any(Date) }),
      }),
    );
  });
});
