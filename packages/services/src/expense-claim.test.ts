/**
 * Unit tests for expense-claim.ts — pure helpers + validation/status guards.
 *
 *   computeClaimLineGst   — compute GST amount for a claim line (pure)
 *   addClaimLine          — amount must be > 0 (validation before DB)
 *   rejectExpenseClaim    — reason must not be empty (validation before DB)
 *   submitExpenseClaim    — only DRAFT can be submitted (status guard inside tx)
 *   approveExpenseClaim   — only SUBMITTED can be approved; self-approval prevention
 *   payExpenseClaim       — only APPROVED can be paid (status guard inside tx)
 *
 * DB-dependent functions are tested by mocking withSerializableTransaction
 * to capture validation errors without a running database.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import Decimal from "decimal.js";
import { ServiceError } from "./errors";

// ── Mocks ──────────────────────────────────────────────────

vi.mock("./transaction", () => ({
  withSerializableTransaction: vi.fn(),
}));

vi.mock("./audit", () => ({
  logAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./gl-posting", () => ({
  postJournalEntry: vi.fn().mockResolvedValue(undefined),
  ACCT: {
    OPERATING_EXPENSE: "6000",
    REIMBURSEMENTS_PAYABLE: "2105",
    INPUT_GST: "1405",
    CASH: "1000",
    PETTY_CASH: "1010",
  },
}));

import {
  computeClaimLineGst,
  addClaimLine,
  rejectExpenseClaim,
  submitExpenseClaim,
  approveExpenseClaim,
  payExpenseClaim,
} from "./expense-claim";
import { withSerializableTransaction } from "./transaction";

// ── Helpers ────────────────────────────────────────────────

function makeMockTx(overrides: Record<string, unknown> = {}) {
  const claimFindFirst = vi.fn();
  const claimUpdate = vi.fn().mockResolvedValue({ id: "claim-1", status: "UPDATED" });
  const claimCreate = vi.fn().mockResolvedValue({ id: "claim-1" });
  const lineCreate = vi.fn().mockResolvedValue({ id: "line-1" });
  const lineDelete = vi.fn().mockResolvedValue(undefined);
  const lineFindUnique = vi.fn();
  const expenseCreate = vi.fn().mockResolvedValue({ id: "exp-1" });
  const expenseCategoryFindUnique = vi.fn().mockResolvedValue(null);

  return {
    expenseClaim: {
      findFirst: claimFindFirst,
      update: claimUpdate,
      create: claimCreate,
    },
    expenseClaimLine: {
      create: lineCreate,
      delete: lineDelete,
      findUnique: lineFindUnique,
    },
    expense: {
      create: expenseCreate,
    },
    expenseCategory: {
      findUnique: expenseCategoryFindUnique,
    },
    auditLog: { create: vi.fn().mockResolvedValue(undefined) },
    ...overrides,
  };
}

function runWithTx(tx: ReturnType<typeof makeMockTx>) {
  vi.mocked(withSerializableTransaction).mockImplementation(async (fn) => fn(tx as never));
}

// ── Pure function: computeClaimLineGst ─────────────────────

describe("computeClaimLineGst", () => {
  it("computes GST when gstRate is provided", () => {
    expect(computeClaimLineGst(new Decimal(1000), new Decimal(18))?.toNumber()).toBe(180);
  });

  it("returns null when gstRate is null", () => {
    expect(computeClaimLineGst(new Decimal(1000), null)).toBeNull();
  });

  it("returns 0 when gstRate is 0", () => {
    expect(computeClaimLineGst(new Decimal(1000), new Decimal(0))?.toNumber()).toBe(0);
  });

  it("handles fractional gstRate", () => {
    expect(computeClaimLineGst(new Decimal(1000), new Decimal(12.5))?.toNumber()).toBe(125);
  });

  it("handles zero amount", () => {
    expect(computeClaimLineGst(new Decimal(0), new Decimal(18))?.toNumber()).toBe(0);
  });

  it("computes for large amounts", () => {
    expect(computeClaimLineGst(new Decimal(1000000), new Decimal(18))?.toNumber()).toBe(180000);
  });

  it("computes for small fractional amounts", () => {
    expect(computeClaimLineGst(new Decimal(0.5), new Decimal(18))?.toNumber()).toBe(0.09);
  });

  it("computes for 5% gstRate", () => {
    expect(computeClaimLineGst(new Decimal(2000), new Decimal(5))?.toNumber()).toBe(100);
  });

  it("computes for 28% gstRate (highest slab)", () => {
    expect(computeClaimLineGst(new Decimal(500), new Decimal(28))?.toNumber()).toBe(140);
  });
});

// ── addClaimLine — amount validation (before DB) ───────────

describe("addClaimLine — amount validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const tx = makeMockTx();
    tx.expenseClaim.findFirst.mockResolvedValue({
      id: "claim-1",
      status: "DRAFT",
      companyId: "c1",
      totalAmount: new Decimal(0),
    });
    runWithTx(tx);
  });

  it("throws ServiceError for amount = 0", async () => {
    await expect(
      addClaimLine({ claimId: "claim-1", companyId: "c1", category: "Travel", amount: 0 }),
    ).rejects.toThrow("Line amount must be > 0");
  });

  it("throws ServiceError for negative amount", async () => {
    await expect(
      addClaimLine({ claimId: "claim-1", companyId: "c1", category: "Travel", amount: -100 }),
    ).rejects.toThrow("Line amount must be > 0");
  });

  it("throws ServiceError for string '0' amount", async () => {
    await expect(
      addClaimLine({ claimId: "claim-1", companyId: "c1", category: "Travel", amount: "0" }),
    ).rejects.toThrow("Line amount must be > 0");
  });

  it("throws ServiceError for negative string amount", async () => {
    await expect(
      addClaimLine({ claimId: "claim-1", companyId: "c1", category: "Travel", amount: "-50" }),
    ).rejects.toThrow("Line amount must be > 0");
  });

  it("accepts positive number amount", async () => {
    await expect(
      addClaimLine({ claimId: "claim-1", companyId: "c1", category: "Travel", amount: 500 }),
    ).resolves.toBeDefined();
  });

  it("accepts positive Decimal amount", async () => {
    await expect(
      addClaimLine({ claimId: "claim-1", companyId: "c1", category: "Travel", amount: new Decimal(250) }),
    ).resolves.toBeDefined();
  });

  it("accepts positive string amount", async () => {
    await expect(
      addClaimLine({ claimId: "claim-1", companyId: "c1", category: "Travel", amount: "100.50" }),
    ).resolves.toBeDefined();
  });

  it("throws ServiceError with 400 status", async () => {
    try {
      await addClaimLine({ claimId: "claim-1", companyId: "c1", category: "Travel", amount: 0 });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ServiceError);
      expect((err as ServiceError).status).toBe(400);
    }
  });
});

// ── addClaimLine — status guard (inside tx) ────────────────

describe("addClaimLine — status guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws 404 when claim not found", async () => {
    const tx = makeMockTx();
    tx.expenseClaim.findFirst.mockResolvedValue(null);
    runWithTx(tx);
    await expect(
      addClaimLine({ claimId: "claim-1", companyId: "c1", category: "Travel", amount: 100 }),
    ).rejects.toThrow("Claim not found");
  });

  it("throws 409 when claim is not DRAFT (SUBMITTED)", async () => {
    const tx = makeMockTx();
    tx.expenseClaim.findFirst.mockResolvedValue({
      id: "claim-1",
      status: "SUBMITTED",
      companyId: "c1",
      totalAmount: new Decimal(0),
    });
    runWithTx(tx);
    await expect(
      addClaimLine({ claimId: "claim-1", companyId: "c1", category: "Travel", amount: 100 }),
    ).rejects.toThrow("Can only add lines to a DRAFT claim");
  });

  it("throws 409 when claim is APPROVED", async () => {
    const tx = makeMockTx();
    tx.expenseClaim.findFirst.mockResolvedValue({
      id: "claim-1",
      status: "APPROVED",
      companyId: "c1",
      totalAmount: new Decimal(0),
    });
    runWithTx(tx);
    await expect(
      addClaimLine({ claimId: "claim-1", companyId: "c1", category: "Travel", amount: 100 }),
    ).rejects.toThrow("Can only add lines to a DRAFT claim");
  });

  it("allows adding lines when claim is DRAFT", async () => {
    const tx = makeMockTx();
    tx.expenseClaim.findFirst.mockResolvedValue({
      id: "claim-1",
      status: "DRAFT",
      companyId: "c1",
      totalAmount: new Decimal(0),
    });
    runWithTx(tx);
    await expect(
      addClaimLine({ claimId: "claim-1", companyId: "c1", category: "Travel", amount: 100 }),
    ).resolves.toBeDefined();
  });
});

// ── rejectExpenseClaim — reason validation (before DB) ──────

describe("rejectExpenseClaim — reason validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const tx = makeMockTx();
    tx.expenseClaim.findFirst.mockResolvedValue({
      id: "claim-1",
      status: "SUBMITTED",
      companyId: "c1",
    });
    runWithTx(tx);
  });

  it("throws ServiceError for empty reason", async () => {
    await expect(rejectExpenseClaim("claim-1", "c1", "")).rejects.toThrow("A rejection reason is required");
  });

  it("throws ServiceError for whitespace-only reason", async () => {
    await expect(rejectExpenseClaim("claim-1", "c1", "  ")).rejects.toThrow("A rejection reason is required");
  });

  it("throws ServiceError with 400 status", async () => {
    try {
      await rejectExpenseClaim("claim-1", "c1", "");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ServiceError);
      expect((err as ServiceError).status).toBe(400);
    }
  });

  it("does not throw for valid reason", async () => {
    await expect(rejectExpenseClaim("claim-1", "c1", "Out of policy")).resolves.toBeDefined();
  });
});

// ── submitExpenseClaim — status guard (inside tx) ──────────

describe("submitExpenseClaim — status guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws 404 when claim not found", async () => {
    const tx = makeMockTx();
    tx.expenseClaim.findFirst.mockResolvedValue(null);
    runWithTx(tx);
    await expect(submitExpenseClaim("claim-1", "c1")).rejects.toThrow("Claim not found");
  });

  it("allows submitting when claim is DRAFT", async () => {
    const tx = makeMockTx();
    tx.expenseClaim.findFirst.mockResolvedValue({ id: "claim-1", status: "DRAFT", companyId: "c1" });
    runWithTx(tx);
    await expect(submitExpenseClaim("claim-1", "c1", "user-1")).resolves.toBeDefined();
  });

  it("throws 409 when claim is SUBMITTED (already submitted)", async () => {
    const tx = makeMockTx();
    tx.expenseClaim.findFirst.mockResolvedValue({ id: "claim-1", status: "SUBMITTED", companyId: "c1" });
    runWithTx(tx);
    await expect(submitExpenseClaim("claim-1", "c1")).rejects.toThrow("Only DRAFT claims can be submitted");
  });

  it("throws 409 when claim is APPROVED", async () => {
    const tx = makeMockTx();
    tx.expenseClaim.findFirst.mockResolvedValue({ id: "claim-1", status: "APPROVED", companyId: "c1" });
    runWithTx(tx);
    await expect(submitExpenseClaim("claim-1", "c1")).rejects.toThrow("Only DRAFT claims can be submitted");
  });

  it("throws 409 when claim is REJECTED", async () => {
    const tx = makeMockTx();
    tx.expenseClaim.findFirst.mockResolvedValue({ id: "claim-1", status: "REJECTED", companyId: "c1" });
    runWithTx(tx);
    await expect(submitExpenseClaim("claim-1", "c1")).rejects.toThrow("Only DRAFT claims can be submitted");
  });

  it("includes current status in error message", async () => {
    const tx = makeMockTx();
    tx.expenseClaim.findFirst.mockResolvedValue({ id: "claim-1", status: "APPROVED", companyId: "c1" });
    runWithTx(tx);
    try {
      await submitExpenseClaim("claim-1", "c1");
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as Error).message).toContain("APPROVED");
    }
  });
});

// ── approveExpenseClaim — status guard + self-approval ─────

describe("approveExpenseClaim — status guard + self-approval prevention", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws 404 when claim not found", async () => {
    const tx = makeMockTx();
    tx.expenseClaim.findFirst.mockResolvedValue(null);
    runWithTx(tx);
    await expect(approveExpenseClaim("claim-1", "c1", "user-1")).rejects.toThrow("Claim not found");
  });

  it("throws 409 when claim is DRAFT (must submit first)", async () => {
    const tx = makeMockTx();
    tx.expenseClaim.findFirst.mockResolvedValue({
      id: "claim-1",
      status: "DRAFT",
      companyId: "c1",
      claimantId: "user-2",
      lines: [],
      claimant: { name: "John", email: "john@test.com" },
    });
    runWithTx(tx);
    await expect(approveExpenseClaim("claim-1", "c1", "user-1")).rejects.toThrow("Only SUBMITTED claims can be approved");
  });

  it("throws 409 when claim is APPROVED", async () => {
    const tx = makeMockTx();
    tx.expenseClaim.findFirst.mockResolvedValue({
      id: "claim-1",
      status: "APPROVED",
      companyId: "c1",
      claimantId: "user-2",
      lines: [],
      claimant: { name: "John", email: "john@test.com" },
    });
    runWithTx(tx);
    await expect(approveExpenseClaim("claim-1", "c1", "user-1")).rejects.toThrow("Only SUBMITTED claims can be approved");
  });

  it("throws 403 when approver is the claimant (self-approval)", async () => {
    const tx = makeMockTx();
    tx.expenseClaim.findFirst.mockResolvedValue({
      id: "claim-1",
      status: "SUBMITTED",
      companyId: "c1",
      claimantId: "user-1",
      lines: [],
      claimant: { name: "John", email: "john@test.com" },
    });
    runWithTx(tx);
    await expect(approveExpenseClaim("claim-1", "c1", "user-1")).rejects.toThrow("You cannot approve your own claim");
  });

  it("allows approval when approver differs from claimant", async () => {
    const tx = makeMockTx();
    tx.expenseClaim.findFirst.mockResolvedValue({
      id: "claim-1",
      status: "SUBMITTED",
      companyId: "c1",
      claimantId: "user-2",
      lines: [],
      claimant: { name: "John", email: "john@test.com" },
    });
    runWithTx(tx);
    await expect(approveExpenseClaim("claim-1", "c1", "user-1")).resolves.toBeDefined();
  });

  it("self-approval error has 403 status", async () => {
    const tx = makeMockTx();
    tx.expenseClaim.findFirst.mockResolvedValue({
      id: "claim-1",
      status: "SUBMITTED",
      companyId: "c1",
      claimantId: "user-1",
      lines: [],
      claimant: { name: "John", email: "john@test.com" },
    });
    runWithTx(tx);
    try {
      await approveExpenseClaim("claim-1", "c1", "user-1");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ServiceError);
      expect((err as ServiceError).status).toBe(403);
    }
  });
});

// ── payExpenseClaim — status guard (inside tx) ─────────────

describe("payExpenseClaim — status guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws 404 when claim not found", async () => {
    const tx = makeMockTx();
    tx.expenseClaim.findFirst.mockResolvedValue(null);
    runWithTx(tx);
    await expect(
      payExpenseClaim("claim-1", "c1", { paymentMode: "BANK" }, "user-1"),
    ).rejects.toThrow("Claim not found");
  });

  it("throws 409 when claim is DRAFT", async () => {
    const tx = makeMockTx();
    tx.expenseClaim.findFirst.mockResolvedValue({
      id: "claim-1",
      status: "DRAFT",
      companyId: "c1",
      lines: [],
    });
    runWithTx(tx);
    await expect(
      payExpenseClaim("claim-1", "c1", { paymentMode: "BANK" }, "user-1"),
    ).rejects.toThrow("Only APPROVED claims can be paid");
  });

  it("throws 409 when claim is SUBMITTED", async () => {
    const tx = makeMockTx();
    tx.expenseClaim.findFirst.mockResolvedValue({
      id: "claim-1",
      status: "SUBMITTED",
      companyId: "c1",
      lines: [],
    });
    runWithTx(tx);
    await expect(
      payExpenseClaim("claim-1", "c1", { paymentMode: "BANK" }, "user-1"),
    ).rejects.toThrow("Only APPROVED claims can be paid");
  });

  it("throws 409 when claim is REJECTED", async () => {
    const tx = makeMockTx();
    tx.expenseClaim.findFirst.mockResolvedValue({
      id: "claim-1",
      status: "REJECTED",
      companyId: "c1",
      lines: [],
    });
    runWithTx(tx);
    await expect(
      payExpenseClaim("claim-1", "c1", { paymentMode: "BANK" }, "user-1"),
    ).rejects.toThrow("Only APPROVED claims can be paid");
  });

  it("allows payment when claim is APPROVED", async () => {
    const tx = makeMockTx();
    tx.expenseClaim.findFirst.mockResolvedValue({
      id: "claim-1",
      status: "APPROVED",
      companyId: "c1",
      lines: [{ amount: new Decimal(100), gstAmount: new Decimal(18) }],
    });
    runWithTx(tx);
    await expect(
      payExpenseClaim("claim-1", "c1", { paymentMode: "BANK" }, "user-1"),
    ).resolves.toBeDefined();
  });

  it("includes current status in error message", async () => {
    const tx = makeMockTx();
    tx.expenseClaim.findFirst.mockResolvedValue({
      id: "claim-1",
      status: "DRAFT",
      companyId: "c1",
      lines: [],
    });
    runWithTx(tx);
    try {
      await payExpenseClaim("claim-1", "c1", { paymentMode: "BANK" });
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as Error).message).toContain("DRAFT");
    }
  });
});
