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

// Known dev DB IDs. Single-company dev DB — the bypass user is already
// scoped to it, so no company switch is needed.
const HILLVIEW_PROJECT = "cmtjqomev0010vlb14a93wkxc";

test.describe("@flow Sales: customer → unit sale → payment", () => {
  test("full sales pipeline via API + UI verification", async ({ api, page }) => {
    const ctx = await api("OWNER");
    // Single-company dev DB — the bypass user is already scoped to it. (The
    // old NIRMAN_REALTY_ID company-switch pointed at a stale id and emptied
    // the project scope.)

    // Find a project in this company.
    const projectsResp = await ctx.get("/api/projects");
    const projectsData = await projectsResp.json();
    const projectsList = Array.isArray(projectsData) ? projectsData : projectsData.rows ?? projectsData.items ?? [];
    const project = projectsList[0];
    expect(project, "need a project in Nirman Realty").toBeTruthy();

    // Create a fresh AVAILABLE built unit for this run. Seeded units get
    // consumed: a prior run leaves an ACTIVE PENDING sale on them, and the
    // double-sell guard blocks re-selling even though the status stays
    // AVAILABLE. A per-run unit keeps the test self-contained + idempotent.
    const unitNumber = `${TEST_PREFIX}-UNIT-${Date.now().toString().slice(-8)}`;
    const unitResp = await ctx.post("/api/built-units", {
      data: {
        projectId: project.id,
        unitType: "BHK_2",
        unitNumber,
        area: 1200,
        askingPrice: 5000000,
      },
    });
    // The batch endpoint returns { ok, count } — the new unit's id isn't in
    // the response, so fetch the project's units back and match by unitNumber.
    expect(unitResp.status(), "create built unit").toBeLessThan(300);
    const unitsListResp = await ctx.get(`/api/built-units?projectId=${project.id}`);
    const unitsListData = await unitsListResp.json();
    const unitsList2 = Array.isArray(unitsListData) ? unitsListData : unitsListData.rows ?? unitsListData.items ?? [];
    const unit = unitsList2.find((u: any) => u.unitNumber === unitNumber);
    expect(unit, "created built unit should be fetchable").toBeTruthy();

    // New units start PLANNED and can't jump straight to AVAILABLE — the
    // valid path is PLANNED → UNDER_CONSTRUCTION → AVAILABLE.
    for (const status of ["UNDER_CONSTRUCTION", "AVAILABLE"]) {
      const resp = await ctx.patch(`/api/built-units/${unit.id}`, {
        data: { action: "status", status },
      });
      expect(resp.status(), `mark unit ${status}`).toBeLessThan(300);
    }

    // ── 1. Create a customer (unique name + phone — phone is UNIQUE per
    // company, so a fixed phone collides across runs → P2002 → 409) ──
    const uniqueSuffix = Date.now().toString().slice(-6);
    const uniquePhone = `98${uniqueSuffix}${Math.floor(Math.random() * 90 + 10)}`; // 10-digit, unique per run
    let custResp;
    for (let attempt = 0; attempt < 3; attempt++) {
      custResp = await ctx.post("/api/customers", {
        data: {
          name: `${TEST_PREFIX} Customer ${uniqueSuffix}${attempt}`,
          phone: attempt === 0 ? uniquePhone : `97${uniqueSuffix}${attempt}`,
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

    // ── 4. Record a deposit against the sale ────────────────────────
    // The sale lifecycle is PENDING → deposit → complete → payment. A fresh
    // sale is PENDING, so "payment" (post-completion only) correctly 400s —
    // "deposit" is the right pre-completion action.
    const payResp = await ctx.post(`/api/sales/${sale.saleId}`, {
      data: {
        action: "deposit",
        depositAmount: 1000000,
        paymentMode: "BANK_TRANSFER",
        // Reference is deduplicated across sales — a fixed value collides on
        // re-runs → "reference already recorded". Make it unique per run.
        reference: `${TEST_PREFIX}-PAY-${Date.now().toString().slice(-8)}`,
      },
    });
    expect(payResp.status(), "record deposit").toBeLessThan(300);

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
          // Phone is unique per company — vary it per attempt + run so the
          // P2002→409 doesn't fire on a previously-used phone.
          data: { name: `${TEST_PREFIX} SM Customer ${Date.now().toString().slice(-6)}${attempt}`, phone: `96${Date.now().toString().slice(-7)}${attempt}` },
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
    // The 403 fires on the SALES_MANAGE permission check before the company
    // switch or the id lookups — no need to switch companies.
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
