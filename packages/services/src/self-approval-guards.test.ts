/**
 * Unit tests for self-approval / self-rejection guards across all approval
 * workflows. These guards prevent a user from approving or rejecting a record
 * they created or submitted — a critical separation-of-duties control.
 *
 * Workflows covered:
 *   - Requisition: approveRequisition, rejectRequisition
 *   - DPR:         subAdminApproveDpr, adminApproveDpr, rejectDpr
 *   - MB Entry:    verifyMbEntry, approveMbEntry, rejectMbEntry
 *   - Gate Pass:   approveGatePass, rejectGatePass
 *   - Expense:     rejectExpense (approveExpense already tested in expense.test.ts)
 *   - Expense Claim: rejectExpenseClaim (approveExpenseClaim already tested in expense-claim.test.ts)
 *
 * DB-dependent functions are tested by mocking withSerializableTransaction
 * to capture validation errors without a running database.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ServiceError } from "./errors";
import { HrError } from "./hr";

// ── Mocks ──────────────────────────────────────────────────

vi.mock("./transaction", () => ({
  withSerializableTransaction: vi.fn(),
}));

vi.mock("./audit", () => ({
  logAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./notifications", () => ({
  emitNotificationEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./gl-posting", () => ({
  postExpense: vi.fn().mockResolvedValue(undefined),
  reverseJournalEntry: vi.fn().mockResolvedValue(undefined),
}));

import { withSerializableTransaction } from "./transaction";
import { approveRequisition, rejectRequisition } from "./requisition";
import { subAdminApproveDpr, adminApproveDpr, rejectDpr } from "./hr";
import { verifyMbEntry, approveMbEntry, rejectMbEntry } from "./boq";
import { approveGatePass, rejectGatePass } from "./gate-pass";
import { rejectExpense } from "./expense";
import { rejectExpenseClaim } from "./expense-claim";

// ── Helpers ────────────────────────────────────────────────

/** Configure withSerializableTransaction to run the callback with the given tx. */
function runWithTx(tx: Record<string, unknown>) {
  vi.mocked(withSerializableTransaction).mockImplementation(
    async (fn: (tx: never) => Promise<unknown>) => fn(tx as never),
  );
}

/** Generic mock tx builder — only includes the models the service touches. */
function makeMockTx(models: Record<string, Record<string, unknown>>): Record<string, unknown> {
  const tx: Record<string, unknown> = {};
  for (const [model, fns] of Object.entries(models)) {
    tx[model] = {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({ id: "mock-id", status: "UPDATED" }),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockResolvedValue({ id: "mock-id" }),
      delete: vi.fn().mockResolvedValue({ id: "mock-id" }),
      count: vi.fn().mockResolvedValue(0),
      ...fns,
    };
  }
  tx.auditLog = { create: vi.fn().mockResolvedValue(undefined) };
  return tx;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════
// REQUISITION — approveRequisition / rejectRequisition
// ═══════════════════════════════════════════════════════════════

describe("approveRequisition — self-approval guard", () => {
  it("throws 403 when approver is the requester", async () => {
    const tx = makeMockTx({
      materialRequisition: {
        findUnique: vi.fn().mockResolvedValue({
          id: "req-1",
          status: "SUBMITTED",
          requestedById: "user-1",
          project: { companyId: "c1" },
          department: null,
        }),
      },
    });
    runWithTx(tx);
    await expect(
      approveRequisition("req-1", "user-1"),
    ).rejects.toThrow("You cannot approve your own indent");
  });

  it("allows approval when approver differs from requester", async () => {
    const tx = makeMockTx({
      materialRequisition: {
        findUnique: vi.fn().mockResolvedValue({
          id: "req-1",
          status: "SUBMITTED",
          requestedById: "user-2",
          project: { companyId: "c1" },
          department: null,
        }),
      },
    });
    runWithTx(tx);
    await expect(
      approveRequisition("req-1", "user-1"),
    ).resolves.toBeDefined();
  });

  it("self-approval error has 403 status", async () => {
    const tx = makeMockTx({
      materialRequisition: {
        findUnique: vi.fn().mockResolvedValue({
          id: "req-1",
          status: "SUBMITTED",
          requestedById: "user-1",
          project: { companyId: "c1" },
          department: null,
        }),
      },
    });
    runWithTx(tx);
    try {
      await approveRequisition("req-1", "user-1");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ServiceError);
      expect((err as ServiceError).status).toBe(403);
    }
  });
});

describe("rejectRequisition — self-rejection guard", () => {
  it("throws 403 when rejecter is the requester", async () => {
    const tx = makeMockTx({
      materialRequisition: {
        findUnique: vi.fn().mockResolvedValue({
          id: "req-1",
          status: "SUBMITTED",
          requestedById: "user-1",
          project: { companyId: "c1" },
          department: null,
        }),
      },
    });
    runWithTx(tx);
    await expect(
      rejectRequisition("req-1", "user-1", "wrong"),
    ).rejects.toThrow("You cannot reject your own indent");
  });

  it("allows rejection when rejecter differs from requester", async () => {
    const tx = makeMockTx({
      materialRequisition: {
        findUnique: vi.fn().mockResolvedValue({
          id: "req-1",
          status: "SUBMITTED",
          requestedById: "user-2",
          project: { companyId: "c1" },
          department: null,
        }),
      },
    });
    runWithTx(tx);
    await expect(
      rejectRequisition("req-1", "user-1", "valid reason"),
    ).resolves.toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// DPR — subAdminApproveDpr / adminApproveDpr / rejectDpr
// ═══════════════════════════════════════════════════════════════

describe("subAdminApproveDpr — self-approval guard", () => {
  it("throws 403 when approver is the submitter", async () => {
    const tx = makeMockTx({
      dailyProgressReport: {
        findUnique: vi.fn().mockResolvedValue({
          id: "dpr-1",
          approvalStatus: "SUBMITTED",
          submittedById: "user-1",
          companyId: "c1",
        }),
      },
    });
    runWithTx(tx);
    await expect(
      subAdminApproveDpr("dpr-1", "user-1"),
    ).rejects.toThrow("You cannot approve your own DPR");
  });

  it("allows approval when approver differs from submitter", async () => {
    const tx = makeMockTx({
      dailyProgressReport: {
        findUnique: vi.fn().mockResolvedValue({
          id: "dpr-1",
          approvalStatus: "SUBMITTED",
          submittedById: "user-2",
          companyId: "c1",
        }),
      },
    });
    runWithTx(tx);
    await expect(
      subAdminApproveDpr("dpr-1", "user-1"),
    ).resolves.toBeDefined();
  });
});

describe("adminApproveDpr — self-approval guard", () => {
  it("throws 403 when approver is the submitter", async () => {
    const tx = makeMockTx({
      dailyProgressReport: {
        findUnique: vi.fn().mockResolvedValue({
          id: "dpr-1",
          approvalStatus: "SUB_ADMIN_APPROVED",
          submittedById: "user-1",
          companyId: "c1",
        }),
      },
    });
    runWithTx(tx);
    await expect(
      adminApproveDpr("dpr-1", "user-1"),
    ).rejects.toThrow("You cannot approve your own DPR");
  });

  it("allows approval when approver differs from submitter", async () => {
    const tx = makeMockTx({
      dailyProgressReport: {
        findUnique: vi.fn().mockResolvedValue({
          id: "dpr-1",
          approvalStatus: "SUB_ADMIN_APPROVED",
          submittedById: "user-2",
          companyId: "c1",
        }),
      },
    });
    runWithTx(tx);
    await expect(
      adminApproveDpr("dpr-1", "user-1"),
    ).resolves.toBeDefined();
  });
});

describe("rejectDpr — self-rejection guard", () => {
  it("throws 403 when rejecter is the submitter", async () => {
    const tx = makeMockTx({
      dailyProgressReport: {
        findUnique: vi.fn().mockResolvedValue({
          id: "dpr-1",
          approvalStatus: "SUBMITTED",
          submittedById: "user-1",
          companyId: "c1",
        }),
      },
    });
    runWithTx(tx);
    await expect(
      rejectDpr("dpr-1", "user-1", "rejecting my own"),
    ).rejects.toThrow("You cannot reject your own DPR");
  });

  it("allows rejection when rejecter differs from submitter", async () => {
    const tx = makeMockTx({
      dailyProgressReport: {
        findUnique: vi.fn().mockResolvedValue({
          id: "dpr-1",
          approvalStatus: "SUBMITTED",
          submittedById: "user-2",
          companyId: "c1",
        }),
      },
    });
    runWithTx(tx);
    await expect(
      rejectDpr("dpr-1", "user-1", "valid reason"),
    ).resolves.toBeDefined();
  });

  it("self-rejection error has 403 status", async () => {
    const tx = makeMockTx({
      dailyProgressReport: {
        findUnique: vi.fn().mockResolvedValue({
          id: "dpr-1",
          approvalStatus: "SUBMITTED",
          submittedById: "user-1",
          companyId: "c1",
        }),
      },
    });
    runWithTx(tx);
    try {
      await rejectDpr("dpr-1", "user-1", "reason");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(HrError);
      expect((err as HrError).status).toBe(403);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// MB ENTRY — verifyMbEntry / approveMbEntry / rejectMbEntry
// ═══════════════════════════════════════════════════════════════

describe("verifyMbEntry — self-verification guard", () => {
  it("throws 403 when verifier is the measurer", async () => {
    const tx = makeMockTx({
      measurementBookEntry: {
        findUnique: vi.fn().mockResolvedValue({
          id: "mb-1",
          status: "DRAFT",
          measuredById: "user-1",
          mbNumber: "MB-240101-0001",
        }),
      },
    });
    runWithTx(tx);
    await expect(
      verifyMbEntry("mb-1", "user-1"),
    ).rejects.toThrow("You cannot verify an MB entry you measured");
  });

  it("allows verification when verifier differs from measurer", async () => {
    const tx = makeMockTx({
      measurementBookEntry: {
        findUnique: vi.fn().mockResolvedValue({
          id: "mb-1",
          status: "DRAFT",
          measuredById: "user-2",
          mbNumber: "MB-240101-0001",
        }),
      },
    });
    runWithTx(tx);
    await expect(
      verifyMbEntry("mb-1", "user-1"),
    ).resolves.toBeDefined();
  });
});

describe("approveMbEntry — self-approval guard", () => {
  it("throws 403 when approver is the measurer", async () => {
    const tx = makeMockTx({
      measurementBookEntry: {
        findUnique: vi.fn().mockResolvedValue({
          id: "mb-1",
          status: "VERIFIED",
          measuredById: "user-1",
          mbNumber: "MB-240101-0001",
        }),
      },
    });
    runWithTx(tx);
    await expect(
      approveMbEntry("mb-1", "user-1"),
    ).rejects.toThrow("You cannot approve an MB entry you measured");
  });

  it("allows approval when approver differs from measurer", async () => {
    const tx = makeMockTx({
      measurementBookEntry: {
        findUnique: vi.fn().mockResolvedValue({
          id: "mb-1",
          status: "VERIFIED",
          measuredById: "user-2",
          mbNumber: "MB-240101-0001",
          wbsNodeId: null,
          boqItemId: "boq-1",
        }),
      },
      boqItem: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    });
    runWithTx(tx);
    await expect(
      approveMbEntry("mb-1", "user-1"),
    ).resolves.toBeDefined();
  });
});

describe("rejectMbEntry — self-rejection guard", () => {
  it("throws 403 when rejecter is the measurer", async () => {
    const tx = makeMockTx({
      measurementBookEntry: {
        findUnique: vi.fn().mockResolvedValue({
          id: "mb-1",
          status: "DRAFT",
          measuredById: "user-1",
          mbNumber: "MB-240101-0001",
        }),
      },
    });
    runWithTx(tx);
    await expect(
      rejectMbEntry("mb-1", "reason", "user-1"),
    ).rejects.toThrow("You cannot reject an MB entry you measured");
  });

  it("allows rejection when rejecter differs from measurer", async () => {
    const tx = makeMockTx({
      measurementBookEntry: {
        findUnique: vi.fn().mockResolvedValue({
          id: "mb-1",
          status: "DRAFT",
          measuredById: "user-2",
          mbNumber: "MB-240101-0001",
        }),
      },
    });
    runWithTx(tx);
    await expect(
      rejectMbEntry("mb-1", "valid reason", "user-1"),
    ).resolves.toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// GATE PASS — approveGatePass / rejectGatePass
// ═══════════════════════════════════════════════════════════════

describe("approveGatePass — self-approval guard", () => {
  it("throws 403 when approver is the creator", async () => {
    const tx = makeMockTx({
      gatePass: {
        findUnique: vi.fn().mockResolvedValue({
          id: "gp-1",
          status: "PENDING",
          createdById: "user-1",
          companyId: "c1",
          refType: null,
          refId: null,
        }),
      },
    });
    runWithTx(tx);
    await expect(
      approveGatePass("gp-1", "user-1"),
    ).rejects.toThrow("Cannot approve your own gate pass");
  });

  it("allows approval when approver differs from creator", async () => {
    const tx = makeMockTx({
      gatePass: {
        findUnique: vi.fn().mockResolvedValue({
          id: "gp-1",
          status: "PENDING",
          createdById: "user-2",
          companyId: "c1",
          refType: null,
          refId: null,
        }),
      },
    });
    runWithTx(tx);
    await expect(
      approveGatePass("gp-1", "user-1"),
    ).resolves.toBeDefined();
  });
});

describe("rejectGatePass — self-rejection guard", () => {
  it("throws 403 when rejecter is the creator", async () => {
    const tx = makeMockTx({
      gatePass: {
        findUnique: vi.fn().mockResolvedValue({
          id: "gp-1",
          status: "PENDING",
          createdById: "user-1",
          companyId: "c1",
          refType: null,
          refId: null,
        }),
      },
    });
    runWithTx(tx);
    await expect(
      rejectGatePass("gp-1", "user-1", "rejecting my own"),
    ).rejects.toThrow("You cannot reject a gate pass you created");
  });

  it("allows rejection when rejecter differs from creator", async () => {
    const tx = makeMockTx({
      gatePass: {
        findUnique: vi.fn().mockResolvedValue({
          id: "gp-1",
          status: "PENDING",
          createdById: "user-2",
          companyId: "c1",
          refType: null,
          refId: null,
        }),
      },
    });
    runWithTx(tx);
    await expect(
      rejectGatePass("gp-1", "user-1", "valid reason"),
    ).resolves.toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// EXPENSE — rejectExpense (self-rejection guard)
// ═══════════════════════════════════════════════════════════════

describe("rejectExpense — self-rejection guard", () => {
  it("throws 403 when rejecter is the submitter", async () => {
    const tx = makeMockTx({
      expense: {
        findFirst: vi.fn().mockResolvedValue({
          id: "exp-1",
          status: "PENDING",
          companyId: "c1",
          submittedById: "user-1",
        }),
      },
    });
    runWithTx(tx);
    await expect(
      rejectExpense("exp-1", "c1", "rejecting my own", "user-1"),
    ).rejects.toThrow("You cannot reject an expense you submitted");
  });

  it("allows rejection when rejecter differs from submitter", async () => {
    const tx = makeMockTx({
      expense: {
        findFirst: vi.fn().mockResolvedValue({
          id: "exp-1",
          status: "PENDING",
          companyId: "c1",
          submittedById: "user-2",
        }),
      },
    });
    runWithTx(tx);
    await expect(
      rejectExpense("exp-1", "c1", "valid reason", "user-1"),
    ).resolves.toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// EXPENSE CLAIM — rejectExpenseClaim (self-rejection guard)
// ═══════════════════════════════════════════════════════════════

describe("rejectExpenseClaim — self-rejection guard", () => {
  it("throws 403 when rejecter is the claimant", async () => {
    const tx = makeMockTx({
      expenseClaim: {
        findFirst: vi.fn().mockResolvedValue({
          id: "claim-1",
          status: "SUBMITTED",
          companyId: "c1",
          claimantId: "user-1",
        }),
      },
    });
    runWithTx(tx);
    await expect(
      rejectExpenseClaim("claim-1", "c1", "rejecting my own", "user-1"),
    ).rejects.toThrow("You cannot reject your own claim");
  });

  it("allows rejection when rejecter differs from claimant", async () => {
    const tx = makeMockTx({
      expenseClaim: {
        findFirst: vi.fn().mockResolvedValue({
          id: "claim-1",
          status: "SUBMITTED",
          companyId: "c1",
          claimantId: "user-2",
        }),
      },
    });
    runWithTx(tx);
    await expect(
      rejectExpenseClaim("claim-1", "c1", "valid reason", "user-1"),
    ).resolves.toBeDefined();
  });
});
