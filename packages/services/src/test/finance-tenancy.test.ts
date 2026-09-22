/**
 * Finance tenancy + workflow regression tests (real test DB).
 *
 * Covers the Module-B audit findings: every service that accepted a bare
 * projectId/categoryId/supplierId/subcontractorId previously trusted the id
 * as-is — a caller could read reports, write project costs, or pin claims/
 * budgets/recurring templates onto ANOTHER tenant's project. All checks now
 * fail closed with 404/409 ServiceErrors.
 *
 *   Reads   — getBudgetVariance / getJobCosting / getProjectProfitCenter /
 *             getCashFlowForecast / getCostOverrunForecast require companyId.
 *   Writes  — addProjectCost / deleteProjectCost require companyId.
 *   Refs    — createExpenseClaim, createRecurringExpense, setExpenseBudget
 *             validate projectId/categoryId/supplierId tenancy.
 *   Workflow— approveSupplierInvoice can't double-post (status guard);
 *             createSupplierPayment blocks 15s double-submits.
 *   Money   — createExpense rejects amounts beyond numeric(14,2).
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { addProjectCost, deleteProjectCost } from "../project-cost";
import { getBudgetVariance, getJobCosting, getProjectProfitCenter, getCashFlowForecast } from "../finance-advanced";
import { getCostOverrunForecast } from "../scheduling";
import { createExpenseClaim } from "../expense-claim";
import { createRecurringExpense } from "../recurring-expense";
import { setExpenseBudget } from "../expense-budget";
import { createSupplierInvoice, approveSupplierInvoice } from "../supplier-invoice";
import { createSupplierPayment } from "../supplier-payment";
import { createExpense } from "../expense";
import { resetDb, createTestFixture, seedTestAccounts } from "./setup";

// Notifications are fire-and-forget side effects — silence them.
vi.mock("../notifications", () => ({
  emitNotificationEvent: vi.fn().mockResolvedValue(undefined),
}));

describe("finance tenancy + workflow guards", () => {
  beforeAll(async () => {
    const result = await prisma.$queryRaw<{ current_database: string }[]>`
      SELECT current_database()
    `;
    expect(result[0]?.current_database).toBe("nirman_inventory_test");
  });

  beforeEach(async () => {
    await resetDb();
  });

  /** A second tenant with its own project / category / supplier / subcontractor. */
  async function createForeignTenant() {
    const company = await prisma.company.create({
      data: { id: "foreign-company", name: "Foreign Co.", currency: "INR" },
    });
    const project = await prisma.project.create({
      data: { id: "foreign-project", companyId: company.id, name: "Foreign Tower", status: "ACTIVE" },
    });
    const category = await prisma.expenseCategory.create({
      data: { id: "foreign-category", companyId: company.id, name: "ForeignCat", glAccountCode: "6000" },
    });
    const supplier = await prisma.supplier.create({
      data: { id: "foreign-supplier", companyId: company.id, name: "Foreign Supplier" },
    });
    const subcontractor = await prisma.subcontractor.create({
      data: { id: "foreign-sub", companyId: company.id, name: "Foreign Sub" },
    });
    return { company, project, category, supplier, subcontractor };
  }

  // ── Cross-tenant report reads ────────────────────────────

  describe("project-scoped financial reports", () => {
    it("every report rejects a foreign projectId with 404", async () => {
      const { company, project } = await createTestFixture();
      await seedTestAccounts(company.id);
      const foreign = await createForeignTenant();

      await expect(getBudgetVariance(foreign.project.id, company.id)).rejects.toMatchObject({ status: 404 });
      await expect(getJobCosting(foreign.project.id, company.id)).rejects.toMatchObject({ status: 404 });
      await expect(getProjectProfitCenter(foreign.project.id, company.id)).rejects.toMatchObject({ status: 404 });
      await expect(getCashFlowForecast(foreign.project.id, company.id)).rejects.toMatchObject({ status: 404 });
      await expect(getCostOverrunForecast(foreign.project.id, company.id)).rejects.toMatchObject({ status: 404 });
    });

    it("reports still resolve for an own-company project", async () => {
      const { company, project } = await createTestFixture();
      await seedTestAccounts(company.id);

      const bv = await getBudgetVariance(project.id, company.id);
      expect(bv.projectId).toBe(project.id);
      const pc = await getProjectProfitCenter(project.id, company.id);
      expect(pc.projectId).toBe(project.id);
    });
  });

  // ── Project cost tenancy ─────────────────────────────────

  describe("project-cost write tenancy", () => {
    it("addProjectCost rejects a foreign projectId", async () => {
      const { company, user } = await createTestFixture();
      await seedTestAccounts(company.id);
      const foreign = await createForeignTenant();

      await expect(
        addProjectCost({
          companyId: company.id,
          projectId: foreign.project.id,
          costType: "OVERHEAD",
          amount: 1000,
          userId: user.id,
        }),
      ).rejects.toMatchObject({ message: "Project not found in this company", status: 404 });

      // And nothing landed on the foreign project.
      const count = await prisma.projectCost.count({ where: { projectId: foreign.project.id } });
      expect(count).toBe(0);
    });

    it("addProjectCost rejects a foreign subcontractorId", async () => {
      const { company, user, project } = await createTestFixture();
      await seedTestAccounts(company.id);
      const foreign = await createForeignTenant();

      await expect(
        addProjectCost({
          companyId: company.id,
          projectId: project.id,
          costType: "CONTRACTOR",
          amount: 1000,
          subcontractorId: foreign.subcontractor.id,
          userId: user.id,
        }),
      ).rejects.toMatchObject({ message: "Subcontractor not found in this company", status: 404 });
    });

    it("deleteProjectCost can't reach a foreign company's cost row", async () => {
      const { company, user } = await createTestFixture();
      const foreign = await createForeignTenant();
      // Seed the foreign row directly — simulates their data existing.
      const foreignCost = await prisma.projectCost.create({
        data: { projectId: foreign.project.id, costType: "LABOUR", amount: new Decimal(5000) },
      });

      await expect(
        deleteProjectCost(foreignCost.id, company.id, user.id),
      ).rejects.toMatchObject({ message: "Project cost not found", status: 404 });

      // Still there.
      const still = await prisma.projectCost.findUnique({ where: { id: foreignCost.id } });
      expect(still).not.toBeNull();
    });

    it("add + delete round-trip works inside the same company", async () => {
      const { company, user, project } = await createTestFixture();
      await seedTestAccounts(company.id);
      const cost = await addProjectCost({
        companyId: company.id,
        projectId: project.id,
        costType: "OTHER",
        amount: 750,
        userId: user.id,
      });
      await deleteProjectCost(cost.id, company.id, user.id);
      const gone = await prisma.projectCost.findUnique({ where: { id: cost.id } });
      expect(gone).toBeNull();
    });
  });

  // ── Referenced-entity tenancy ────────────────────────────

  describe("referenced entity tenancy", () => {
    it("createExpenseClaim rejects a foreign projectId and foreign categoryId", async () => {
      const { company, user } = await createTestFixture();
      const foreign = await createForeignTenant();

      await expect(
        createExpenseClaim({
          companyId: company.id,
          claimantId: user.id,
          projectId: foreign.project.id,
          lines: [{ category: "Travel", amount: 100 }],
        }),
      ).rejects.toMatchObject({ message: "Project not found in this company", status: 404 });

      await expect(
        createExpenseClaim({
          companyId: company.id,
          claimantId: user.id,
          lines: [{ category: "Travel", categoryId: foreign.category.id, amount: 100 }],
        }),
      ).rejects.toMatchObject({ message: "Expense category not found in this company", status: 404 });
    });

    it("createRecurringExpense rejects foreign project / category / supplier", async () => {
      const { company } = await createTestFixture();
      const foreign = await createForeignTenant();
      const base = {
        companyId: company.id,
        category: "Rent",
        amount: 1000,
        frequency: "MONTHLY" as const,
        startDate: new Date("2026-10-01"),
      };

      await expect(
        createRecurringExpense({ ...base, projectId: foreign.project.id }),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        createRecurringExpense({ ...base, categoryId: foreign.category.id }),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        createRecurringExpense({ ...base, supplierId: foreign.supplier.id }),
      ).rejects.toMatchObject({ status: 404 });
    });

    it("setExpenseBudget rejects foreign project and category", async () => {
      const { company } = await createTestFixture();
      const foreign = await createForeignTenant();
      const base = {
        companyId: company.id,
        category: "Ops",
        amount: 50000,
        periodStart: new Date("2026-10-01"),
        periodEnd: new Date("2026-10-31"),
      };

      await expect(
        setExpenseBudget({ ...base, projectId: foreign.project.id }),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        setExpenseBudget({ ...base, categoryId: foreign.category.id }),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  // ── Supplier invoice approve / payment workflow ──────────

  describe("supplier invoice + payment workflow", () => {
    async function makeSupplier(companyId: string) {
      return prisma.supplier.create({
        data: { companyId, name: "Acme Supplies", balanceOwed: new Decimal(5000) },
      });
    }

    it("approveSupplierInvoice can't approve an already-APPROVED invoice (no double GL post)", async () => {
      const { company, user } = await createTestFixture();
      await seedTestAccounts(company.id);
      const supplier = await makeSupplier(company.id);

      const invoice = await createSupplierInvoice({
        invoiceNumber: "INV-1",
        companyId: company.id,
        supplierId: supplier.id,
        invoiceDate: new Date("2026-09-01"),
        subtotal: 1000,
        gstAmount: 0,
        totalAmount: 1000,
        userId: user.id,
      });

      // First approval posts GL once.
      await approveSupplierInvoice({
        invoiceId: invoice.id, companyId: company.id, userId: user.id,
        action: "approve", actorRole: "OWNER",
      });
      const jeCount = await prisma.journalEntry.count({
        where: { companyId: company.id, sourceType: "SUPPLIER_INVOICE" },
      });
      expect(jeCount).toBe(1);

      // Second approval is rejected — not silently re-posted.
      await expect(
        approveSupplierInvoice({
          invoiceId: invoice.id, companyId: company.id, userId: user.id,
          action: "approve", actorRole: "OWNER",
        }),
      ).rejects.toMatchObject({ status: 409 });

      const jeCountAfter = await prisma.journalEntry.count({
        where: { companyId: company.id, sourceType: "SUPPLIER_INVOICE" },
      });
      expect(jeCountAfter).toBe(1);
    });

    it("createSupplierPayment blocks an identical double-submit inside the window", async () => {
      const { company, user } = await createTestFixture();
      await seedTestAccounts(company.id);
      const supplier = await makeSupplier(company.id);

      const input = {
        companyId: company.id,
        supplierId: supplier.id,
        amount: 500,
        paymentMode: "CASH",
        userId: user.id,
      };
      await createSupplierPayment(input);
      await expect(createSupplierPayment(input)).rejects.toMatchObject({ status: 409 });

      const count = await prisma.supplierPayment.count({ where: { companyId: company.id } });
      expect(count).toBe(1);
    });
  });

  // ── Money validation ─────────────────────────────────────

  describe("money validation", () => {
    it("createExpense rejects an amount beyond numeric(14,2) with 400, not a 500", async () => {
      const { company, user } = await createTestFixture();
      await expect(
        createExpense({
          companyId: company.id,
          category: "Ops",
          amount: "1e18",
          userId: user.id,
        }),
      ).rejects.toMatchObject({ status: 400 });
    });
  });
});
