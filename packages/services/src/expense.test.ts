/**
 * Unit tests for expense.ts — pure helpers + validation/status guards.
 *
 *   gstTotalOf      — sum of CGST + SGST + IGST (pure)
 *   createExpense   — amount must be > 0 (validation before DB)
 *   rejectExpense   — reason must not be empty (validation before DB)
 *   updateExpense   — only DRAFT and REJECTED are editable (status guard inside tx)
 *   submitExpense   — only DRAFT and REJECTED can be submitted (status guard inside tx)
 *   approveExpense  — only PENDING can be approved; self-approval prevention (inside tx)
 *   deleteExpense   — PENDING cannot be deleted (status guard inside tx)
 *
 * DB-dependent functions are tested by mocking withSerializableTransaction
 * to capture validation errors without a running database.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import Decimal from "decimal.js";
import { ServiceError } from "./errors";

// ── Mocks ──────────────────────────────────────────────────

// Mock withSerializableTransaction so the callback runs with a mock tx
vi.mock("./transaction", () => ({
  withSerializableTransaction: vi.fn(),
}));

// Mock audit + gl-posting to avoid any DB / GL side effects
vi.mock("./audit", () => ({
  logAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./gl-posting", () => ({
  postExpense: vi.fn().mockResolvedValue(undefined),
  reverseJournalEntry: vi.fn().mockResolvedValue(undefined),
}));

import {
  gstTotalOf,
  createExpense,
  rejectExpense,
  updateExpense,
  submitExpense,
  approveExpense,
  deleteExpense,
} from "./expense";
import { withSerializableTransaction } from "./transaction";

// ── Helpers ────────────────────────────────────────────────

/** A mock tx object whose findFirst / update / delete return controlled data. */
function makeMockTx(overrides: Record<string, unknown> = {}) {
  const expenseFindFirst = vi.fn();
  const expenseUpdate = vi.fn().mockResolvedValue({ id: "exp-1", status: "UPDATED" });
  const expenseCreate = vi.fn().mockResolvedValue({ id: "exp-1" });
  const expenseDelete = vi.fn().mockResolvedValue({ id: "exp-1" });
  const expenseCategoryFindUnique = vi.fn().mockResolvedValue(null);
  const journalEntryFindFirst = vi.fn().mockResolvedValue(null);

  const tx = {
    expense: {
      findFirst: expenseFindFirst,
      update: expenseUpdate,
      create: expenseCreate,
      delete: expenseDelete,
      count: vi.fn().mockResolvedValue(0),
    },
    expenseCategory: {
      findUnique: expenseCategoryFindUnique,
      create: vi.fn().mockResolvedValue({ id: "cat-1" }),
      update: vi.fn().mockResolvedValue({ id: "cat-1" }),
      delete: vi.fn().mockResolvedValue({ id: "cat-1" }),
      findFirst: vi.fn(),
    },
    expenseBudget: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    journalEntry: {
      findFirst: journalEntryFindFirst,
    },
    auditLog: { create: vi.fn().mockResolvedValue(undefined) },
    ...overrides,
  };
  return tx;
}

/** Configure withSerializableTransaction to run the callback with the given tx. */
function runWithTx(tx: ReturnType<typeof makeMockTx>) {
  vi.mocked(withSerializableTransaction).mockImplementation(async (fn) => fn(tx as never));
}

// ── Pure function: gstTotalOf ──────────────────────────────

describe("gstTotalOf", () => {
  it("sums all three GST components", () => {
    expect(gstTotalOf(new Decimal(9000), new Decimal(9000), new Decimal(0)).toNumber()).toBe(18000);
  });

  it("returns IGST only when CGST and SGST are 0 (inter-state)", () => {
    expect(gstTotalOf(new Decimal(0), new Decimal(0), new Decimal(18000)).toNumber()).toBe(18000);
  });

  it("returns 0 when all components are 0", () => {
    expect(gstTotalOf(new Decimal(0), new Decimal(0), new Decimal(0)).toNumber()).toBe(0);
  });

  it("handles fractional amounts", () => {
    expect(gstTotalOf(new Decimal(100.5), new Decimal(100.5), new Decimal(0)).toNumber()).toBe(201);
  });
});

// ── createExpense — amount validation (before DB) ──────────

describe("createExpense — amount validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const tx = makeMockTx();
    runWithTx(tx);
  });

  it("throws ServiceError for amount = 0", async () => {
    await expect(
      createExpense({ companyId: "c1", category: "Travel", amount: 0 }),
    ).rejects.toThrow("Expense amount must be > 0");
  });

  it("throws ServiceError for negative amount", async () => {
    await expect(
      createExpense({ companyId: "c1", category: "Travel", amount: -500 }),
    ).rejects.toThrow("Expense amount must be > 0");
  });

  it("throws ServiceError for string '0' amount", async () => {
    await expect(
      createExpense({ companyId: "c1", category: "Travel", amount: "0" }),
    ).rejects.toThrow("Expense amount must be > 0");
  });

  it("throws ServiceError for negative string amount", async () => {
    await expect(
      createExpense({ companyId: "c1", category: "Travel", amount: "-100" }),
    ).rejects.toThrow("Expense amount must be > 0");
  });

  it("accepts positive number amount (does not throw validation error)", async () => {
    await expect(
      createExpense({ companyId: "c1", category: "Travel", amount: 1000 }),
    ).resolves.toBeDefined();
  });

  it("accepts positive Decimal amount", async () => {
    await expect(
      createExpense({ companyId: "c1", category: "Travel", amount: new Decimal(500) }),
    ).resolves.toBeDefined();
  });

  it("accepts positive string amount", async () => {
    await expect(
      createExpense({ companyId: "c1", category: "Travel", amount: "250.50" }),
    ).resolves.toBeDefined();
  });

  it("accepts very small positive amount", async () => {
    await expect(
      createExpense({ companyId: "c1", category: "Travel", amount: "0.01" }),
    ).resolves.toBeDefined();
  });

  it("throws ServiceError with default 400 status", async () => {
    try {
      await createExpense({ companyId: "c1", category: "Travel", amount: 0 });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ServiceError);
      expect((err as ServiceError).status).toBe(400);
    }
  });
});

// ── rejectExpense — reason validation (before DB) ──────────

describe("rejectExpense — reason validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const tx = makeMockTx();
    tx.expense.findFirst.mockResolvedValue({ id: "exp-1", status: "PENDING", companyId: "c1" });
    runWithTx(tx);
  });

  it("throws ServiceError for empty reason", async () => {
    await expect(
      rejectExpense("exp-1", "c1", ""),
    ).rejects.toThrow("A rejection reason is required");
  });

  it("throws ServiceError for whitespace-only reason", async () => {
    await expect(
      rejectExpense("exp-1", "c1", "   "),
    ).rejects.toThrow("A rejection reason is required");
  });

  it("throws ServiceError for tab-only reason", async () => {
    await expect(
      rejectExpense("exp-1", "c1", "\t\t"),
    ).rejects.toThrow("A rejection reason is required");
  });

  it("throws ServiceError with 400 status", async () => {
    try {
      await rejectExpense("exp-1", "c1", "");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ServiceError);
      expect((err as ServiceError).status).toBe(400);
    }
  });

  it("does not throw for valid non-empty reason", () => {
    expect(() =>
      rejectExpense("exp-1", "c1", "Receipt not attached"),
    ).not.toThrow();
  });
});

// ── updateExpense — status guard (inside tx) ───────────────

describe("updateExpense — status guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws 404 when expense not found", async () => {
    const tx = makeMockTx();
    tx.expense.findFirst.mockResolvedValue(null);
    runWithTx(tx);
    await expect(
      updateExpense("exp-1", { companyId: "c1", category: "Travel" }),
    ).rejects.toThrow("Expense not found in this company");
  });

  it("throws 409 when expense is PENDING", async () => {
    const tx = makeMockTx();
    tx.expense.findFirst.mockResolvedValue({ id: "exp-1", status: "PENDING", companyId: "c1" });
    runWithTx(tx);
    await expect(
      updateExpense("exp-1", { companyId: "c1", category: "Travel" }),
    ).rejects.toThrow("Cannot edit an expense that is pending");
  });

  it("throws 409 when expense is APPROVED", async () => {
    const tx = makeMockTx();
    tx.expense.findFirst.mockResolvedValue({ id: "exp-1", status: "APPROVED", companyId: "c1" });
    runWithTx(tx);
    await expect(
      updateExpense("exp-1", { companyId: "c1", category: "Travel" }),
    ).rejects.toThrow("Cannot edit an expense that is approved");
  });

  it("allows editing when expense is DRAFT", async () => {
    const tx = makeMockTx();
    tx.expense.findFirst.mockResolvedValue({ id: "exp-1", status: "DRAFT", companyId: "c1", category: "Old" });
    runWithTx(tx);
    await expect(
      updateExpense("exp-1", { companyId: "c1", category: "New Category" }),
    ).resolves.toBeDefined();
  });

  it("allows editing when expense is REJECTED", async () => {
    const tx = makeMockTx();
    tx.expense.findFirst.mockResolvedValue({ id: "exp-1", status: "REJECTED", companyId: "c1", category: "Old" });
    runWithTx(tx);
    await expect(
      updateExpense("exp-1", { companyId: "c1", category: "New Category" }),
    ).resolves.toBeDefined();
  });

  it("includes correct status code in error for PENDING", async () => {
    const tx = makeMockTx();
    tx.expense.findFirst.mockResolvedValue({ id: "exp-1", status: "PENDING", companyId: "c1" });
    runWithTx(tx);
    try {
      await updateExpense("exp-1", { companyId: "c1" });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ServiceError);
      expect((err as ServiceError).status).toBe(409);
    }
  });
});

// ── submitExpense — status guard (inside tx) ───────────────

describe("submitExpense — status guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws 404 when expense not found", async () => {
    const tx = makeMockTx();
    tx.expense.findFirst.mockResolvedValue(null);
    runWithTx(tx);
    await expect(submitExpense("exp-1", "c1")).rejects.toThrow("Expense not found in this company");
  });

  it("allows submitting when expense is DRAFT", async () => {
    const tx = makeMockTx();
    tx.expense.findFirst.mockResolvedValue({ id: "exp-1", status: "DRAFT", companyId: "c1" });
    runWithTx(tx);
    await expect(submitExpense("exp-1", "c1", "user-1")).resolves.toBeDefined();
  });

  it("allows resubmitting when expense is REJECTED", async () => {
    const tx = makeMockTx();
    tx.expense.findFirst.mockResolvedValue({ id: "exp-1", status: "REJECTED", companyId: "c1" });
    runWithTx(tx);
    await expect(submitExpense("exp-1", "c1", "user-1")).resolves.toBeDefined();
  });

  it("throws 409 when expense is PENDING", async () => {
    const tx = makeMockTx();
    tx.expense.findFirst.mockResolvedValue({ id: "exp-1", status: "PENDING", companyId: "c1" });
    runWithTx(tx);
    await expect(submitExpense("exp-1", "c1")).rejects.toThrow("Only DRAFT or REJECTED expenses can be submitted");
  });

  it("throws 409 when expense is APPROVED", async () => {
    const tx = makeMockTx();
    tx.expense.findFirst.mockResolvedValue({ id: "exp-1", status: "APPROVED", companyId: "c1" });
    runWithTx(tx);
    await expect(submitExpense("exp-1", "c1")).rejects.toThrow("Only DRAFT or REJECTED expenses can be submitted");
  });

  it("includes current status in error message", async () => {
    const tx = makeMockTx();
    tx.expense.findFirst.mockResolvedValue({ id: "exp-1", status: "APPROVED", companyId: "c1" });
    runWithTx(tx);
    try {
      await submitExpense("exp-1", "c1");
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as Error).message).toContain("APPROVED");
    }
  });
});

// ── approveExpense — status guard + self-approval (inside tx) ─

describe("approveExpense — status guard + self-approval prevention", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws 404 when expense not found", async () => {
    const tx = makeMockTx();
    tx.expense.findFirst.mockResolvedValue(null);
    runWithTx(tx);
    await expect(approveExpense("exp-1", "c1", "user-1")).rejects.toThrow("Expense not found in this company");
  });

  it("throws 409 when expense is DRAFT (must submit first)", async () => {
    const tx = makeMockTx();
    tx.expense.findFirst.mockResolvedValue({ id: "exp-1", status: "DRAFT", companyId: "c1" });
    runWithTx(tx);
    await expect(approveExpense("exp-1", "c1", "user-1")).rejects.toThrow("Only PENDING expenses can be approved");
  });

  it("throws 409 when expense is APPROVED", async () => {
    const tx = makeMockTx();
    tx.expense.findFirst.mockResolvedValue({ id: "exp-1", status: "APPROVED", companyId: "c1" });
    runWithTx(tx);
    await expect(approveExpense("exp-1", "c1", "user-1")).rejects.toThrow("Only PENDING expenses can be approved");
  });

  it("throws 409 when expense is REJECTED", async () => {
    const tx = makeMockTx();
    tx.expense.findFirst.mockResolvedValue({ id: "exp-1", status: "REJECTED", companyId: "c1" });
    runWithTx(tx);
    await expect(approveExpense("exp-1", "c1", "user-1")).rejects.toThrow("Only PENDING expenses can be approved");
  });

  it("throws 403 when approver is the same as submitter (self-approval)", async () => {
    const tx = makeMockTx();
    tx.expense.findFirst.mockResolvedValue({
      id: "exp-1",
      status: "PENDING",
      companyId: "c1",
      submittedById: "user-1",
      amount: new Decimal(100),
      subtotal: new Decimal(100),
      cgst: new Decimal(0),
      sgst: new Decimal(0),
      igst: new Decimal(0),
      tdsAmount: new Decimal(0),
      categoryId: null,
    });
    runWithTx(tx);
    await expect(approveExpense("exp-1", "c1", "user-1")).rejects.toThrow("You cannot approve an expense you submitted");
  });

  it("allows approval when approver differs from submitter", async () => {
    const tx = makeMockTx();
    tx.expense.findFirst.mockResolvedValue({
      id: "exp-1",
      status: "PENDING",
      companyId: "c1",
      submittedById: "user-2",
      amount: new Decimal(100),
      subtotal: new Decimal(100),
      cgst: new Decimal(0),
      sgst: new Decimal(0),
      igst: new Decimal(0),
      tdsAmount: new Decimal(0),
      categoryId: null,
      projectId: null,
      category: "General",
      date: new Date("2024-01-01"),
    });
    runWithTx(tx);
    await expect(approveExpense("exp-1", "c1", "user-1")).resolves.toBeDefined();
  });

  it("allows approval when submittedById is null (no submitter)", async () => {
    const tx = makeMockTx();
    tx.expense.findFirst.mockResolvedValue({
      id: "exp-1",
      status: "PENDING",
      companyId: "c1",
      submittedById: null,
      amount: new Decimal(100),
      subtotal: new Decimal(100),
      cgst: new Decimal(0),
      sgst: new Decimal(0),
      igst: new Decimal(0),
      tdsAmount: new Decimal(0),
      categoryId: null,
      projectId: null,
      category: "General",
      date: new Date("2024-01-01"),
    });
    runWithTx(tx);
    await expect(approveExpense("exp-1", "c1", "user-1")).resolves.toBeDefined();
  });

  it("allows approval when userId is undefined (system approval)", async () => {
    const tx = makeMockTx();
    tx.expense.findFirst.mockResolvedValue({
      id: "exp-1",
      status: "PENDING",
      companyId: "c1",
      submittedById: "user-1",
      amount: new Decimal(100),
      subtotal: new Decimal(100),
      cgst: new Decimal(0),
      sgst: new Decimal(0),
      igst: new Decimal(0),
      tdsAmount: new Decimal(0),
      categoryId: null,
      projectId: null,
      category: "General",
      date: new Date("2024-01-01"),
    });
    runWithTx(tx);
    await expect(approveExpense("exp-1", "c1")).resolves.toBeDefined();
  });

  it("self-approval error has 403 status", async () => {
    const tx = makeMockTx();
    tx.expense.findFirst.mockResolvedValue({
      id: "exp-1",
      status: "PENDING",
      companyId: "c1",
      submittedById: "user-1",
      amount: new Decimal(100),
      subtotal: new Decimal(100),
      cgst: new Decimal(0),
      sgst: new Decimal(0),
      igst: new Decimal(0),
      tdsAmount: new Decimal(0),
      categoryId: null,
    });
    runWithTx(tx);
    try {
      await approveExpense("exp-1", "c1", "user-1");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ServiceError);
      expect((err as ServiceError).status).toBe(403);
    }
  });
});

// ── deleteExpense — status guard (inside tx) ───────────────

describe("deleteExpense — status guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws 404 when expense not found", async () => {
    const tx = makeMockTx();
    tx.expense.findFirst.mockResolvedValue(null);
    runWithTx(tx);
    await expect(deleteExpense("exp-1", "c1")).rejects.toThrow("Expense not found in this company");
  });

  it("throws 409 when expense is PENDING", async () => {
    const tx = makeMockTx();
    tx.expense.findFirst.mockResolvedValue({ id: "exp-1", status: "PENDING", companyId: "c1", glPostedAt: null });
    runWithTx(tx);
    await expect(deleteExpense("exp-1", "c1")).rejects.toThrow("Cannot delete a PENDING expense");
  });

  it("allows deleting when expense is DRAFT", async () => {
    const tx = makeMockTx();
    tx.expense.findFirst.mockResolvedValue({ id: "exp-1", status: "DRAFT", companyId: "c1", glPostedAt: null });
    runWithTx(tx);
    await expect(deleteExpense("exp-1", "c1")).resolves.toEqual({ deleted: true });
  });

  it("allows deleting when expense is REJECTED", async () => {
    const tx = makeMockTx();
    tx.expense.findFirst.mockResolvedValue({ id: "exp-1", status: "REJECTED", companyId: "c1", glPostedAt: null });
    runWithTx(tx);
    await expect(deleteExpense("exp-1", "c1")).resolves.toEqual({ deleted: true });
  });

  it("allows deleting when expense is APPROVED (reverses GL)", async () => {
    const tx = makeMockTx();
    tx.expense.findFirst.mockResolvedValue({ id: "exp-1", status: "APPROVED", companyId: "c1", glPostedAt: new Date() });
    tx.journalEntry.findFirst.mockResolvedValue({ id: "je-1" });
    runWithTx(tx);
    await expect(deleteExpense("exp-1", "c1")).resolves.toEqual({ deleted: true });
  });

  it("PENDING delete error has 409 status", async () => {
    const tx = makeMockTx();
    tx.expense.findFirst.mockResolvedValue({ id: "exp-1", status: "PENDING", companyId: "c1", glPostedAt: null });
    runWithTx(tx);
    try {
      await deleteExpense("exp-1", "c1");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ServiceError);
      expect((err as ServiceError).status).toBe(409);
    }
  });
});
