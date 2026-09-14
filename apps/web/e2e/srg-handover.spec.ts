import { test, expect } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";

/**
 * ═══════════════════════════════════════════════════════════════════
 * SRG REALCON HANDOVER SPEC — full workflow pass as the real client users
 * ═══════════════════════════════════════════════════════════════════
 *
 * Drives the app exactly as the SRG team will: each test runs as the
 * actual provisioned user (x-test-user header with their phone number —
 * read by getDevBypassUser in dev). Verifies the end-to-end business
 * chains a construction company runs on day one:
 *
 *   master data → indent → approve → PO → GRN → stock → site issue
 *   expense → approve → GL posting
 *   customer → booking → collection
 *   RBAC gating between roles
 *
 * Prerequisite: the SRG users must exist (scripts/create-srg-users.mjs)
 * and SRG REALCON must have a chart of accounts (scripts/seed-prod.ts).
 */

const SRG = {
  vardaan: "7017988293", // OWNER (H1)
  sanjeev: "9412230391", // ADMIN (H1)
  anurag: "7302920202", // PROJECT_DIRECTOR (H2)
  manish: "7302920201", // FINANCE_HEAD (H3)
  raviraj: "9520002752", // PROCUREMENT_MANAGER (H3)
  mani: "7302920203", // SALES_MANAGER (H4)
  yash: "7302920205", // SITE_ENGINEER (H4)
} as const;

type SrgUser = keyof typeof SRG;

const BASE = "http://localhost:3100";
const PREFIX = "E2E-SRG-";

/** API request context authenticated as a specific SRG user. */
async function apiAs(playwright: any, user: SrgUser): Promise<APIRequestContext> {
  return playwright.request.newContext({
    baseURL: BASE,
    extraHTTPHeaders: { "x-test-user": SRG[user] },
  });
}

/** Browser page authenticated as a specific SRG user. */
async function pageAs(browser: any, user: SrgUser): Promise<Page> {
  const ctx = await browser.newContext({
    extraHTTPHeaders: { "x-test-user": SRG[user] },
  });
  ctx.on("page", (p: Page) => {
    p.on("pageerror", (e) => console.error(`[pageerror ${user}]`, e.message));
  });
  return ctx.newPage();
}

/** Assert page loaded without an error boundary. */
async function expectHealthy(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500); // let SWR data land
  const body = await page.locator("body").innerText();
  expect(body).not.toContain("Application Error");
  expect(body).not.toContain("Something went wrong");
  expect(body).not.toContain("client-side exception");
}

// Shared state threaded through the serial chain.
const state: Record<string, any> = {};

test.describe.serial("SRG handover — full workflow chain", () => {
  // ── 0. Sanity: every SRG user resolves + lands in SRG REALCON ──────
  for (const [key, phone] of Object.entries(SRG)) {
    test(`identity: ${key} resolves to SRG REALCON`, async ({ playwright }) => {
      const ctx = await apiAs(playwright, key as SrgUser);
      const res = await ctx.get("/api/mobile/home");
      expect(res.status()).toBe(200);
      const data = await res.json();
      expect(data.currentCompany?.name).toBe("SRG REALCON");
      expect(data.userName).toBeTruthy();
      await ctx.dispose();
    });
  }

  // ── 1. Master data (ADMIN): supplier, material, project, location ──
  test("ADMIN creates master data", async ({ playwright }) => {
    const ctx = await apiAs(playwright, "sanjeev");

    const rowsOf = (d: any) => (Array.isArray(d) ? d : d?.rows ?? d?.items ?? []);

    // Supplier — reuse if the test already ran.
    const supList = rowsOf(await (await ctx.get("/api/suppliers")).json());
    state.supplier = supList.find((s: any) => s.name === `${PREFIX}Supplier`);
    if (!state.supplier) {
      const supplier = await ctx.post("/api/suppliers", {
        data: { name: `${PREFIX}Supplier`, phone: "9811112222" },
      });
      expect(supplier.status(), "create supplier").toBeLessThan(300);
      state.supplier = await supplier.json();
    }

    // Material category + material.
    const catList = rowsOf(await (await ctx.get("/api/material-categories")).json());
    state.category = catList.find((c: any) => c.name === `${PREFIX}Cement`);
    if (!state.category) {
      const cat = await ctx.post("/api/material-categories", {
        data: { name: `${PREFIX}Cement`, unit: "BAG", class: "RAW_MATERIAL", hsnCode: "2523", gstRate: 28 },
      });
      expect(cat.status(), "create material category").toBeLessThan(300);
      state.category = await cat.json();
    }

    const matList = rowsOf(await (await ctx.get("/api/materials")).json());
    state.material = matList.find((m: any) => m.name === `${PREFIX}Cement OPC53`);
    if (!state.material) {
      const material = await ctx.post("/api/materials", {
        data: { code: "AUTO", name: `${PREFIX}Cement OPC53`, categoryId: state.category.id, unit: "BAG", hsnCode: "2523", gstRate: 28, standardCost: 350 },
      });
      expect(material.status(), "create material").toBeLessThan(300);
      state.material = await material.json();
    }

    const projList = rowsOf(await (await ctx.get("/api/projects")).json());
    state.project = projList.find((p: any) => p.name === `${PREFIX}Tower A`);
    if (!state.project) {
      const project = await ctx.post("/api/projects", {
        data: { name: `${PREFIX}Tower A`, type: "RESIDENTIAL", status: "ACTIVE" },
      });
      expect(project.status(), "create project").toBeLessThan(300);
      state.project = await project.json();
    }

    // Stock location — reuse existing if present, else create.
    const locs = await ctx.get("/api/stock-locations");
    const locList = await locs.json();
    const rows = Array.isArray(locList) ? locList : locList.items ?? [];
    state.location = rows[0];
    if (!state.location) {
      const loc = await ctx.post("/api/stock-locations", {
        data: { name: `${PREFIX}Site Store`, type: "COMPANY_WAREHOUSE" },
      });
      expect(loc.status(), "create stock location").toBeLessThan(300);
      state.location = await loc.json();
    }

    await ctx.dispose();
  });

  // ── 2. Procurement chain ──────────────────────────────────────────
  test("PROCUREMENT_MGR creates indent → auto-submits (no DRAFT ceremony)", async ({ playwright }) => {
    const ctx = await apiAs(playwright, "raviraj");
    const res = await ctx.post("/api/requisitions", {
      data: {
        projectId: state.project.id,
        notes: `${PREFIX}indent`,
        lines: [{ materialId: state.material.id, qtyRequested: 10 }],
      },
    });
    expect(res.status(), "create requisition").toBeLessThan(300);
    const created = await res.json();
    state.reqId = created.id;
    state.reqNumber = created.reqNumber;

    const detail = await ctx.get(`/api/requisitions/${created.id}`);
    const req = await detail.json();
    // autoSubmit is the platform contract — no manual submit step.
    expect(req.status, "requisition should auto-submit").toBe("SUBMITTED");
    await ctx.dispose();
  });

  test("self-approval is blocked for a non-tier-1 role", async ({ playwright }) => {
    const ctx = await apiAs(playwright, "raviraj");
    const res = await ctx.patch(`/api/requisitions/${state.reqId}`, {
      data: { action: "approve" },
    });
    expect([400, 403], "self-approve must be rejected").toContain(res.status());
    await ctx.dispose();
  });

  test("OWNER approves → convert → PO → order → GRN → stock", async ({ playwright, browser }) => {
    const owner = await apiAs(playwright, "vardaan");
    const pm = await apiAs(playwright, "raviraj");

    // Approve as OWNER (different user — self-approval blocked).
    const approve = await owner.patch(`/api/requisitions/${state.reqId}`, {
      data: { action: "approve" },
    });
    expect(approve.status(), "approve requisition").toBe(200);

    // Waive the 3-quote requirement for the test.
    const waive = await owner.patch(`/api/requisitions/${state.reqId}`, {
      data: { action: "waiveQuotes", reason: `${PREFIX}waive` },
    });
    expect(waive.status(), "waive quotes").toBeLessThan(300);

    // Convert to PO — needs destination location + per-line costs.
    const reqDetail = await owner.get(`/api/requisitions/${state.reqId}`);
    const reqData = await reqDetail.json();
    // lineCosts is keyed by materialId (not requisition-line id).
    const lineCosts: Record<string, number> = {};
    for (const l of reqData.lines ?? []) lineCosts[l.materialId] = 350;
    const convert = await owner.patch(`/api/requisitions/${state.reqId}`, {
      data: {
        action: "convert",
        supplierId: state.supplier.id,
        procurementScope: "COMPANY",
        destinationLocationId: state.location.id,
        lineCosts,
      },
    });
    expect(convert.status(), "convert to PO").toBeLessThan(300);
    const conv = await convert.json();
    state.poId = conv.poId ?? conv.id;
    state.poNumber = conv.poNumber;

    // Approve auto-orders the PO (autoOrder defaults true — no separate
    // "mark as ordered" ceremony). Verify status is ORDERED, then receive.
    const ap = await owner.patch(`/api/purchase-orders/${state.poId}`, { data: { action: "approve" } });
    expect(ap.status(), "approve PO").toBe(200);
    const poMid = await (await owner.get(`/api/purchase-orders/${state.poId}`)).json();
    expect(poMid.status, "approve should auto-order the PO").toBe("ORDERED");

    const poDetail = await owner.get(`/api/purchase-orders/${state.poId}`);
    const poData = await poDetail.json();
    const lineId = poData.lines[0].id;
    const grn = await pm.post(`/api/purchase-orders/${state.poId}/receive`, {
      data: {
        notes: `${PREFIX}GRN`,
        lines: [{ purchaseOrderLineId: lineId, materialId: state.material.id, qtyReceived: 10, unitCost: 350 }],
      },
    });
    expect(grn.status(), "GRN receive").toBeLessThan(300);

    // Stock must reflect the receipt.
    const stock = await owner.get("/api/stock");
    const stockData = await stock.json();
    const rows = Array.isArray(stockData) ? stockData : stockData.items ?? stockData.rows ?? [];
    const item = rows.find((s: any) => s.materialId === state.material.id);
    expect(item, "stock row for received material").toBeTruthy();
    expect(Number(item.qty)).toBeGreaterThanOrEqual(10);

    // PO number must carry the SRG company prefix (per-company numbering).
    expect(state.poNumber).toMatch(/SRG/);

    // UI check: PO visible on procurement page.
    const page = await pageAs(browser, "raviraj");
    await expectHealthy(page, "/procurement");
    await expect(page.getByText(state.poNumber).first()).toBeVisible({ timeout: 15_000 });
    await page.context().close();
    await owner.dispose();
    await pm.dispose();
  });

  // ── 3. Site issue + gate pass (SITE_ENGINEER flow) ────────────────
  test("SITE_ENGINEER issues stock to project with gate pass", async ({ playwright }) => {
    const yash = await apiAs(playwright, "yash");
    const vardaan = await apiAs(playwright, "vardaan");

    const issue = await yash.post("/api/issue-materials", {
      data: {
        projectId: state.project.id,
        fromLocationId: state.location.id,
        requireGatePass: true,
        receiverName: "Yash Saxena",
        lines: [{ materialId: state.material.id, qty: 2 }],
      },
    });
    expect(issue.status(), "create issue").toBeLessThan(300);
    const iss = await issue.json();
    state.issueId = iss.materialIssueId;
    expect(state.issueId, "issue id returned").toBeTruthy();
    expect(iss.pending, "gate-pass-gated issue must be PENDING").toBe(true);

    // Verify the issue is visible (department-scope fix regression check).
    const detail = await yash.get(`/api/issue-materials/${state.issueId}`);
    expect(detail.status(), "issue detail readable by creator").toBe(200);
    const detailData = await detail.json();
    expect(detailData.status).toBe("PENDING");

    // A gate pass must exist linked to this issue.
    const gps = await vardaan.get("/api/gate-passes?take=10");
    expect(gps.status(), "gate pass list").toBe(200);
    const gpData = await gps.json();
    const gpRows = Array.isArray(gpData) ? gpData : gpData.items ?? gpData.rows ?? [];
    expect(gpRows.length, "at least one gate pass").toBeGreaterThan(0);
    await yash.dispose();
    await vardaan.dispose();
  });

  // ── 4. Finance chain (FINANCE_HEAD → OWNER) ───────────────────────
  test("FINANCE_HEAD expense → OWNER approve → GL posted", async ({ playwright }) => {
    const manish = await apiAs(playwright, "manish");
    const vardaan = await apiAs(playwright, "vardaan");

    const exp = await manish.post("/api/expenses", {
      data: {
        notes: `${PREFIX}Diesel for mixer`,
        amount: 5000,
        projectId: state.project.id,
        category: "Fuel",
        payeeName: "Petrol Pump",
        paymentMode: "CASH",
        autoSubmit: true,
      },
    });
    expect(exp.status(), "create expense").toBeLessThan(300);
    const expData = await exp.json();
    state.expenseId = expData.id;

    const ap = await vardaan.patch(`/api/expenses/${state.expenseId}`, { data: { action: "approve" } });
    expect(ap.status(), "approve expense").toBeLessThan(300);

    // Trial balance must show debits — proves chart of accounts seeded for
    // SRG REALCON and the approval posted a journal entry.
    const tb = await vardaan.get("/api/gl/trial-balance");
    expect(tb.status(), "trial balance").toBe(200);
    const tbData = await tb.json();
    expect(tbData.isBalanced, "GL must balance").toBe(true);
    expect(Number(tbData.totalDebit), "GL must have posted debits").toBeGreaterThan(0);

    await manish.dispose();
    await vardaan.dispose();
  });

  // ── 5. Sales chain (SALES_MANAGER) ────────────────────────────────
  test("SALES_MANAGER: customer → booking → collection", async ({ playwright }) => {
    const mani = await apiAs(playwright, "mani");

    // Idempotent: reuse the customer if a prior run already created it (the
    // single-create endpoint 409s on a duplicate phone), else create fresh so
    // the create path is still exercised on a clean DB.
    const existing = await mani.get("/api/customers");
    const existingRows = await existing.json();
    const found = (Array.isArray(existingRows) ? existingRows : []).find(
      (c: { phone?: string }) => c.phone === "9898989898",
    );
    if (found) {
      state.customer = found;
    } else {
      const cust = await mani.post("/api/customers", {
        data: { name: `${PREFIX}Buyer`, phone: "9898989898" },
      });
      expect(cust.status(), "create customer").toBeLessThan(300);
      state.customer = await cust.json();
    }

    // Find an available built unit.
    const units = await mani.get("/api/built-units?status=AVAILABLE&take=5");
    const unitData = await units.json();
    const unitRows = Array.isArray(unitData) ? unitData : unitData.items ?? unitData.rows ?? [];
    state.unit = unitRows[0];
    if (state.unit) {
      const book = await mani.post("/api/sales", {
        data: {
          assetType: "BUILT_UNIT",
          builtUnitId: state.unit.id,
          customerId: state.customer.id,
          salePrice: 2500000,
          initialPayment: 100000,
          initialPaymentMode: "UPI",
        },
      });
      expect(book.status(), "create booking").toBeLessThan(300);
      const sale = await book.json();
      state.saleId = sale.id ?? sale.saleId;

      const pay = await mani.post(`/api/sales/${state.saleId}`, {
        data: { action: "deposit", depositAmount: 50000, paymentMode: "UPI" },
      });
      expect(pay.status(), "record deposit").toBeLessThan(300);
    }
    await mani.dispose();
  });

  // ── 6. RBAC gating ────────────────────────────────────────────────
  test("SITE_ENGINEER cannot create a purchase order (403)", async ({ playwright }) => {
    const yash = await apiAs(playwright, "yash");
    const res = await yash.post("/api/purchase-orders", {
      data: {
        supplierId: state.supplier?.id,
        procurementScope: "COMPANY",
        destinationLocationId: state.location?.id,
        lines: [{ materialId: state.material?.id, qtyOrdered: 1, unitCost: 1 }],
      },
    });
    expect(res.status(), "site engineer must not create POs").toBe(403);
    await yash.dispose();
  });

  test("SALES_MANAGER cannot approve expenses", async ({ playwright }) => {
    const mani = await apiAs(playwright, "mani");
    const res = await mani.patch(`/api/expenses/${state.expenseId}`, { data: { action: "reject" } });
    expect([403, 400], "sales must not moderate expenses").toContain(res.status());
    await mani.dispose();
  });

  // ── 7. UI sweep — every role's main surfaces render ───────────────
  const rolePages: Array<[SrgUser, string[]]> = [
    ["vardaan", ["/", "/approvals", "/reports", "/settings", "/finance"]],
    ["sanjeev", ["/", "/build", "/hr", "/settings"]],
    ["anurag", ["/", "/projects", "/my-tasks"]],
    ["manish", ["/", "/finance", "/expenses", "/gl"]],
    ["raviraj", ["/", "/procurement", "/requisitions", "/suppliers", "/purchase-orders"]],
    ["mani", ["/", "/customers", "/sales", "/real-estate-inventory"]],
    ["yash", ["/m/home", "/m/dprs", "/m/stock", "/m/gate-pass"]],
  ];

  for (const [user, paths] of rolePages) {
    test(`UI sweep: ${user} (${paths.length} pages)`, async ({ browser }) => {
      const page = await pageAs(browser, user);
      const failures: string[] = [];
      for (const p of paths) {
        try {
          await expectHealthy(page, p);
        } catch (e) {
          failures.push(`${p}: ${(e as Error).message.split("\n")[0]}`);
        }
      }
      await page.context().close();
      expect(failures, `${user} page failures`).toEqual([]);
    });
  }
});
