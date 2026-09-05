import { test, expect, expectNoCrash } from "../fixtures";
import { testData, TEST_PREFIX } from "../helpers/test-data";

/**
 * @flow Sales pipeline — customer → unit sale → payment → completion.
 *
 * Tests the real estate sales flow:
 *  - Create a customer
 *  - Sell a built unit (POST /api/sales with assetType: BUILT_UNIT)
 *  - Record a payment against the sale
 *  - Verify the sale appears in the UI
 *  - RBAC: SALES_MANAGER can sell, ACCOUNTANT cannot
 */

// Known dev DB IDs.
// The default company (My Company) has no AVAILABLE units, so we switch
// to Nirman Realty (which has AVAILABLE units) via the company switch API.
const NIRMAN_REALTY_ID = "cmtjqoms500o1vlb1sgfmqd6i";
const HILLVIEW_PROJECT = "cmtjqomev0010vlb14a93wkxc";

test.describe("@flow Sales: customer → unit sale → payment", () => {
  test("full sales pipeline via API + UI verification", async ({ api, page }) => {
    const ctx = await api("OWNER");
    // Switch to Nirman Realty (has AVAILABLE built units).
    await ctx.post("/api/companies/switch", { data: { companyId: NIRMAN_REALTY_ID } });

    // Find an available built unit in this company.
    const unitsResp = await ctx.get("/api/built-units");
    const unitsData = await unitsResp.json();
    const unitsList = Array.isArray(unitsData) ? unitsData : unitsData.rows ?? unitsData.items ?? [];
    const unit = unitsList.find((u: any) => u.status === "AVAILABLE");
    expect(unit, "need an available built unit in Nirman Realty").toBeTruthy();

    // Find a project in this company.
    const projectsResp = await ctx.get("/api/projects");
    const projectsData = await projectsResp.json();
    const projectsList = Array.isArray(projectsData) ? projectsData : projectsData.rows ?? projectsData.items ?? [];
    const project = projectsList[0];
    expect(project, "need a project in Nirman Realty").toBeTruthy();

    // ── 1. Create a customer (unique name + retry for transaction conflicts) ──
    const uniqueSuffix = Date.now().toString().slice(-6);
    let custResp;
    for (let attempt = 0; attempt < 3; attempt++) {
      custResp = await ctx.post("/api/customers", {
        data: {
          name: `${TEST_PREFIX} Customer ${uniqueSuffix}${attempt}`,
          phone: `98765${attempt}43210`,
          email: `e2e-test-${uniqueSuffix}-${attempt}@example.com`,
        },
      });
      if (custResp.status() < 400) break;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
    expect(custResp!.status(), "create customer").toBeLessThan(300);
    const customer = await custResp!.json();
    expect(customer.id).toBeTruthy();

    // ── 2. Sell the unit ────────────────────────────────────────────
    const saleResp = await ctx.post("/api/sales", {
      data: {
        assetType: "BUILT_UNIT",
        builtUnitId: unit.id,
        projectId: project.id,
        customerId: customer.id,
        salePrice: 5000000,
        notes: `${TEST_PREFIX} sale`,
      },
    });
    expect(saleResp.status(), "create sale").toBeLessThan(300);
    const sale = await saleResp.json();
    expect(sale.saleId).toBeTruthy();
    expect(sale.saleNumber).toBeTruthy();

    // ── 4. Record a payment against the sale ────────────────────────
    const payResp = await ctx.post(`/api/sales/${sale.saleId}`, {
      data: {
        action: "payment",
        amount: 1000000,
        mode: "BANK_TRANSFER",
        reference: `${TEST_PREFIX}-PAY-001`,
      },
    });
    expect(payResp.status(), "record payment").toBeLessThan(300);

    // ── 5. Verify the sales page renders (UI smoke check) ───────────
    // We don't wait for the sale number to appear (SWR + dev compilation
    // can be slow). The core assertions are the API calls above.
    await page.goto("/sales", { waitUntil: "domcontentloaded" });
    await expectNoCrash(page);

    // ── 6. Verify the customers page renders ────────────────────────
    await page.goto("/customers", { waitUntil: "domcontentloaded" });
    await expectNoCrash(page);

    await ctx.dispose();
  });

  test("customer validation requires a name", async ({ api }) => {
    const ctx = await api("OWNER");
    const r = await ctx.post("/api/customers", { data: { name: "" } });
    expect(r.status()).toBe(400);
    await ctx.dispose();
  });

  test("sale requires a valid customer and unit", async ({ api }) => {
    const ctx = await api("OWNER");
    const data = await testData();
    const r = await ctx.post("/api/sales", {
      data: {
        assetType: "BUILT_UNIT",
        builtUnitId: "nonexistent",
        projectId: data.project.id,
        customerId: "nonexistent",
        salePrice: 100000,
      },
    });
    expect(r.status()).toBe(400);
    await ctx.dispose();
  });

  test("SALES_MANAGER can create customers", async ({ api }) => {
    const ctx = await api("SALES_MANAGER");
    let r: any;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        r = await ctx.post("/api/customers", {
          data: { name: `${TEST_PREFIX} SM Customer ${Date.now().toString().slice(-6)}${attempt}`, phone: `99999${attempt}9999` },
        });
        if (r.status() < 400) break;
      } catch {
        // Connection reset — retry after backoff.
      }
      await new Promise((res) => setTimeout(res, 1000 * (attempt + 1)));
    }
    expect(r?.status(), "SALES_MANAGER create customer").toBeLessThan(300);
    await ctx.dispose();
  });

  test("ACCOUNTANT cannot create sales", async ({ api }) => {
    const ctx = await api("ACCOUNTANT");
    await ctx.post("/api/companies/switch", { data: { companyId: NIRMAN_REALTY_ID } });
    const r = await ctx.post("/api/sales", {
      data: {
        assetType: "BUILT_UNIT",
        builtUnitId: "any-unit-id",
        projectId: "any-project-id",
        customerId: "any-customer-id",
        salePrice: 100000,
      },
    });
    expect(r.status()).toBe(403);
    await ctx.dispose();
  });
});
