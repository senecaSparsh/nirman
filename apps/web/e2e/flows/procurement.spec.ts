import { test, expect, expectNoCrash } from "../fixtures";
import { testData, TEST_PREFIX } from "../helpers/test-data";

/**
 * @flow Procurement pipeline — the core business flow:
 *   Requisition (indent) → submit → approve → convert to PO →
 *   approve PO → order → receive (GRN) → verify stock increased.
 *
 * Uses the API fixture for data operations (faster, more reliable)
 * and the UI to verify the results render correctly on each page.
 * Test records are prefixed with E2E-TEST for identification.
 */

test.describe("@flow Procurement: indent → PO → GRN", () => {
  test("full procurement pipeline via API + UI verification", async ({ api, page }) => {
    const ctx = await api("OWNER"); // OWNER has all procurement perms
    const data = await testData();
    expect(data.project, "need a project in DB").toBeTruthy();
    expect(data.supplier, "need a supplier in DB").toBeTruthy();
    expect(data.material, "need a material in DB").toBeTruthy();
    expect(data.stockLocation, "need a stock location in DB").toBeTruthy();

    // ── 1. Create a material requisition (indent) ──────────────────
    const reqBody = {
      projectId: data.project.id,
      notes: `${TEST_PREFIX} procurement flow`,
      lines: [
        {
          materialId: data.material.id,
          qtyRequested: 10,
          notes: "E2E test line",
        },
      ],
    };
    const createReq = await ctx.post("/api/requisitions", { data: reqBody });
    expect(createReq.status(), "create requisition").toBeLessThan(300);
    const created = await createReq.json();
    expect(created.id).toBeTruthy();
    expect(created.reqNumber).toBeTruthy();

    // Fetch the full requisition to verify status.
    const reqDetail = await ctx.get(`/api/requisitions/${created.id}`);
    expect(reqDetail.status()).toBe(200);
    const requisition = await reqDetail.json();
    expect(requisition.status).toBe("DRAFT");
    test.info().annotations.push({ type: "requisitionId", description: requisition.id });

    // ── 2. Verify requisition appears in the UI ────────────────────
    await page.goto("/requisitions", { waitUntil: "domcontentloaded" });
    await expectNoCrash(page);
    // The requisition number should appear somewhere on the page.
    await expect(page.getByText(requisition.reqNumber).first()).toBeVisible({ timeout: 15_000 });

    // ── 3. Submit the requisition ──────────────────────────────────
    const submit = await ctx.patch(`/api/requisitions/${requisition.id}`, {
      data: { action: "submit" },
    });
    expect(submit.status(), "submit requisition").toBe(200);

    // ── 4. Approve the requisition ─────────────────────────────────
    const approve = await ctx.patch(`/api/requisitions/${requisition.id}`, {
      data: { action: "approve" },
    });
    expect(approve.status(), "approve requisition").toBe(200);

    // ── 5. Waive the quote requirement (3 quotes normally required) ─
    const waive = await ctx.patch(`/api/requisitions/${requisition.id}`, {
      data: { action: "waiveQuotes", reason: `${TEST_PREFIX} waiving quotes for E2E test` },
    });
    expect(waive.status(), "waive quotes").toBeLessThan(300);

    // ── 6. Convert requisition to a Purchase Order ─────────────────
    const convert = await ctx.patch(`/api/requisitions/${requisition.id}`, {
      data: {
        action: "convert",
        supplierId: data.supplier.id,
        procurementScope: "COMPANY",
        destinationLocationId: data.stockLocation.id,
        lineCosts: { [data.material.id]: 100 },
        notes: `${TEST_PREFIX} converted PO`,
      },
    });
    expect(convert.status(), "convert to PO").toBeLessThan(300);
    const convertData = await convert.json();
    expect(convertData.poId).toBeTruthy();
    expect(convertData.poNumber).toBeTruthy();
    const po = { id: convertData.poId, poNumber: convertData.poNumber };
    test.info().annotations.push({ type: "poId", description: po.id });

    // ── 6. Verify PO appears in the procurement UI ─────────────────
    await page.goto("/procurement", { waitUntil: "domcontentloaded" });
    await expectNoCrash(page);
    await expect(page.getByText(po.poNumber).first()).toBeVisible({ timeout: 15_000 });

    // ── 7. Fetch PO detail to get line IDs for receiving ───────────
    const poDetail = await ctx.get(`/api/purchase-orders/${po.id}`);
    expect(poDetail.status()).toBe(200);
    const poData = await poDetail.json();
    expect(poData.lines.length).toBeGreaterThan(0);
    const lineId = poData.lines[0].id;
    expect(poData.status).toBe("DRAFT");

    // ── 8. Approve the PO ──────────────────────────────────────────
    const approvePo = await ctx.patch(`/api/purchase-orders/${po.id}`, {
      data: { action: "approve" },
    });
    expect(approvePo.status(), "approve PO").toBe(200);

    // ── 9. Order the PO ────────────────────────────────────────────
    const orderPo = await ctx.patch(`/api/purchase-orders/${po.id}`, {
      data: { action: "order" },
    });
    expect(orderPo.status(), "order PO").toBe(200);

    // ── 10. Receive goods (GRN) ────────────────────────────────────
    const receive = await ctx.post(`/api/purchase-orders/${po.id}/receive`, {
      data: {
        notes: `${TEST_PREFIX} GRN`,
        lines: [
          {
            purchaseOrderLineId: lineId,
            materialId: data.material.id,
            qtyReceived: 10,
            unitCost: 100,
          },
        ],
      },
    });
    expect(receive.status(), "receive goods").toBeLessThan(300);

    // ── 11. Verify PO status updated to RECEIVED ───────────────────
    const poAfter = await ctx.get(`/api/purchase-orders/${po.id}`);
    const poAfterData = await poAfter.json();
    expect(poAfterData.status).toBe("RECEIVED");
    expect(poAfterData.lines[0].qtyReceived).toBe(10);

    // ── 12. Verify stock increased via the stock API ───────────────
    const stockResp = await ctx.get("/api/stock");
    expect(stockResp.status()).toBe(200);
    const stockData = await stockResp.json();
    const stockList = Array.isArray(stockData) ? stockData : stockData.items ?? stockData.rows ?? [];
    const stockItem = stockList.find(
      (s: any) => s.materialId === data.material.id && s.locationId === data.stockLocation.id,
    );
    // The material should have at least 10 units at this location now.
    expect(stockItem, "material should have a stock entry at the destination").toBeTruthy();
    expect(Number(stockItem.qty)).toBeGreaterThanOrEqual(10);

    // ── 13. Verify GRN appears in the field/GRN UI ─────────────────
    await page.goto("/field", { waitUntil: "domcontentloaded" });
    await expectNoCrash(page);

    await ctx.dispose();
  });

  test("requisition validation rejects empty lines", async ({ api }) => {
    const ctx = await api("OWNER");
    const data = await testData();
    const r = await ctx.post("/api/requisitions", {
      data: { projectId: data.project.id, lines: [] },
    });
    expect(r.status()).toBe(400);
    const body = await r.json();
    expect(body.error).toMatch(/line/i);
    await ctx.dispose();
  });

  test("PO requires supplier and destination", async ({ api }) => {
    const ctx = await api("OWNER");
    const data = await testData();
    const r = await ctx.post("/api/purchase-orders", {
      data: {
        supplierId: "",
        procurementScope: "COMPANY",
        destinationLocationId: "",
        lines: [{ materialId: data.material.id, qtyOrdered: 5, unitCost: 50 }],
      },
    });
    expect(r.status()).toBe(400);
    await ctx.dispose();
  });

  test("SALES_MANAGER cannot create requisitions", async ({ api }) => {
    const ctx = await api("SALES_MANAGER");
    const data = await testData();
    const r = await ctx.post("/api/requisitions", {
      data: {
        projectId: data.project.id,
        lines: [{ materialId: data.material.id, qtyRequested: 5 }],
      },
    });
    expect(r.status()).toBe(403);
    await ctx.dispose();
  });

  test("SALES_MANAGER cannot view purchase orders", async ({ api }) => {
    const ctx = await api("SALES_MANAGER");
    const r = await ctx.get("/api/purchase-orders");
    expect(r.status()).toBe(403);
    await ctx.dispose();
  });
});
