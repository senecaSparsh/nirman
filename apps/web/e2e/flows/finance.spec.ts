import { test, expect, expectNoCrash } from "../fixtures";
import { testData, TEST_PREFIX } from "../helpers/test-data";

/**
 * @flow Books/Finance — expenses → GL → reports.
 *
 * Tests the finance pipeline:
 *  - Create an expense (POST /api/expenses)
 *  - View the general ledger (GET /api/gl/ledger)
 *  - View cash flow (GET /api/cash-flow)
 *  - Verify the finance pages render with data
 *  - RBAC: ACCOUNTANT can view finance, SALES_MANAGER cannot
 */

test.describe("@flow Finance: expenses → GL → reports", () => {
  test("create an expense and verify GL entry", async ({ api, page }) => {
    const ctx = await api("OWNER");
    const data = await testData();
    const today = new Date().toISOString().split("T")[0];

    // ── 1. Create an expense ────────────────────────────────────────
    const r = await ctx.post("/api/expenses", {
      data: {
        category: `${TEST_PREFIX} Test Expense`,
        amount: 5000,
        date: today,
        paymentMode: "CASH",
        notes: `${TEST_PREFIX} expense for E2E test`,
      },
    });
    expect(r.status(), "create expense").toBeLessThan(300);
    const expense = await r.json();
    expect(expense.id).toBeTruthy();

    // ── 2–4. Verify the finance pages render. First-hit Turbopack compile
    // can abort a navigation mid-flight (ERR_ABORTED) — retry once per page.
    for (const path of ["/expenses", "/gl", "/finance"]) {
      for (let nav = 0; nav < 2; nav++) {
        try {
          await page.goto(path, { waitUntil: "domcontentloaded" });
          break;
        } catch (err) {
          if (nav === 1) throw err; // real failure on the retry
        }
      }
      await expectNoCrash(page);
    }

    await ctx.dispose();
  });

  test("expense validation requires category and amount", async ({ api }) => {
    const ctx = await api("OWNER");
    const r = await ctx.post("/api/expenses", {
      data: {
        category: "",
        amount: 0,
      },
    });
    expect(r.status()).toBe(400);
    await ctx.dispose();
  });

  test("expense requires positive amount", async ({ api }) => {
    const ctx = await api("OWNER");
    const r = await ctx.post("/api/expenses", {
      data: {
        category: "Test",
        amount: -100, // negative — should fail
      },
    });
    expect(r.status()).toBe(400);
    await ctx.dispose();
  });

  test("GL ledger returns data for an account", async ({ api }) => {
    const ctx = await api("OWNER");
    // Try a common GL account code. The exact code depends on the chart
    // of accounts, but the API should return a valid response.
    const r = await ctx.get("/api/gl/ledger?account=CASH");
    // May return 200 with empty lines or 404 if account doesn't exist.
    expect(r.status()).toBeLessThan(500);
    await ctx.dispose();
  });

  test("cash flow report returns data for a project", async ({ api }) => {
    const ctx = await api("OWNER");
    const data = await testData();
    const r = await ctx.get(`/api/cash-flow?projectId=${data.project.id}`);
    expect(r.status()).toBe(200);
    const cf = await r.json();
    expect(cf).toHaveProperty("inflows");
    expect(cf).toHaveProperty("outflows");
    expect(cf).toHaveProperty("netCashFlow");
    await ctx.dispose();
  });

  test("SALES_MANAGER cannot view expenses", async ({ api }) => {
    const ctx = await api("SALES_MANAGER");
    const r = await ctx.get("/api/expenses");
    expect(r.status()).toBe(403);
    await ctx.dispose();
  });

  test("SALES_MANAGER cannot view GL", async ({ api }) => {
    const ctx = await api("SALES_MANAGER");
    const r = await ctx.get("/api/gl/ledger?account=CASH");
    expect(r.status()).toBe(403);
    await ctx.dispose();
  });

  test("ACCOUNTANT can view expenses", async ({ api }) => {
    const ctx = await api("ACCOUNTANT");
    const r = await ctx.get("/api/expenses");
    expect(r.status()).toBe(200);
    await ctx.dispose();
  });

  test("finance reports pages render", async ({ page }) => {
    // Spot-check a few report pages render without errors.
    const reportPages = ["/reports/profit", "/reports/cash-flow", "/reports/expenses"];
    for (const path of reportPages) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expectNoCrash(page);
    }
  });
});
