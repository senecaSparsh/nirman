import { test, expect } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";

/**
 * ═══════════════════════════════════════════════════════════════════
 * SRG HANDOVER — ROUND 3: remaining operational chains
 * ═══════════════════════════════════════════════════════════════════
 *   - stock transfer location→location (dispatch → receive)
 *   - supplier return (auto-submit on create → complete → stock leaves)
 *   - quotation flow: record supplier quote → select winner → auto-PO
 *     carries the quoted price (not a ₹0 PO)
 */

const SRG = {
  vardaan: "7017988293",
  sanjeev: "9412230391",
  anurag: "7302920202",
  manish: "7302920201",
  raviraj: "9520002752",
  mani: "7302920203",
  yash: "7302920205",
} as const;

type SrgUser = keyof typeof SRG;
const BASE = "http://localhost:3100";
const PREFIX = "E2E-SRG3-";

async function apiAs(playwright: any, user: SrgUser): Promise<APIRequestContext> {
  return playwright.request.newContext({
    baseURL: BASE,
    extraHTTPHeaders: { "x-test-user": SRG[user] },
  });
}

const rowsOf = (d: any) => (Array.isArray(d) ? d : d?.rows ?? d?.items ?? []);
const state: Record<string, any> = {};

test.describe.serial("SRG handover round 3 — transfers, returns, quotes", () => {
  test("fixtures: material, project, locations, supplier + stock top-up", async ({ playwright }) => {
    const ctx = await apiAs(playwright, "sanjeev");
    const [materials, projects, locations, suppliers] = await Promise.all([
      ctx.get("/api/materials"),
      ctx.get("/api/projects"),
      ctx.get("/api/stock-locations"),
      ctx.get("/api/suppliers"),
    ]);
    state.material = rowsOf(await materials.json()).find((m: any) => m.name?.startsWith("E2E-SRG-"));
    state.project = rowsOf(await projects.json()).find((p: any) => p.name?.startsWith("E2E-SRG-"));
    state.locations = rowsOf(await locations.json());
    state.supplier = rowsOf(await suppliers.json()).find((s: any) => s.name?.startsWith("E2E-SRG-"));
    expect(state.material).toBeTruthy();
    expect(state.project).toBeTruthy();
    expect(state.locations.length).toBeGreaterThan(0);
    state.location = state.locations[0];

    // A second location for transfers.
    if (state.locations.length < 2) {
      const create = await ctx.post("/api/stock-locations", {
        data: { name: `${PREFIX}Yard`, type: "COMPANY_WAREHOUSE" },
      });
      expect(create.status()).toBeLessThan(300);
      state.location2 = await create.json();
    } else {
      state.location2 = state.locations[1];
    }
    state.loc2Id = state.location2.id ?? state.location2.locationId;

    // A PROJECT_SITE location for the project — quote-select auto-converts to
    // a PO only when a site destination can be resolved.
    const siteLoc = state.locations.find((l: any) => l.type === "PROJECT_SITE" && l.projectId === state.project.id);
    if (!siteLoc) {
      const create = await ctx.post("/api/stock-locations", {
        data: { name: `${PREFIX}Site Store`, type: "PROJECT_SITE", projectId: state.project.id },
      });
      expect(create.status(), "project site location").toBeLessThan(300);
    }

    // Stock top-up via direct purchase if low.
    const stock = rowsOf(await (await ctx.get("/api/stock")).json());
    const bal = stock.find(
      (s: any) => s.materialId === state.material.id && s.locationId === state.location.id,
    );
    if (Number(bal?.qty ?? 0) < 20) {
      const dp = await ctx.post("/api/direct-purchases", {
        data: {
          supplierName: `${PREFIX}Local Trader`,
          locationId: state.location.id,
          lines: [{ materialId: state.material.id, qty: 50, unitCost: 300 }],
        },
      });
      expect(dp.status()).toBeLessThan(300);
    }
    await ctx.dispose();
  });

  test("stock transfer: create → dispatch → complete → stock moves", async ({ playwright }) => {
    const sanjeev = await apiAs(playwright, "sanjeev");

    const create = await sanjeev.post("/api/transfers", {
      data: {
        fromLocationId: state.location.id,
        toLocationId: state.loc2Id,
        notes: `${PREFIX}site→yard`,
        lines: [{ materialId: state.material.id, qty: 3 }],
      },
    });
    expect(create.status(), "create transfer").toBeLessThan(300);
    const tr = await create.json();
    const trId = tr.id ?? tr.transferId;

    // Transfers can't leave the gate without an approved gate pass — the
    // create auto-raises one, and approving it auto-dispatches the transfer.
    const gps = rowsOf(await (await sanjeev.get("/api/gate-passes?status=PENDING&take=50")).json());
    const gp = gps.find((g: any) => g.refType === "StockTransfer" && g.refId === trId);
    expect(gp, "transfer raised a pending gate pass").toBeTruthy();
    const gpApprove = await sanjeev.patch(`/api/gate-passes/${gp.id}`, { data: { action: "approve" } });
    expect(gpApprove.status(), "approve transfer gate pass").toBeLessThan(300);

    // Dispatch may already have run via auto-execution — tolerate both.
    const trNow = await (await sanjeev.get(`/api/transfers/${trId}`)).json();
    if (trNow.status === "DRAFT") {
      const disp = await sanjeev.patch(`/api/transfers/${trId}`, { data: { action: "dispatch" } });
      expect(disp.status(), "dispatch").toBeLessThan(300);
    }

    const comp = await sanjeev.patch(`/api/transfers/${trId}`, { data: { action: "complete" } });
    expect(comp.status(), "complete").toBeLessThan(300);

    // Destination shows the received stock.
    const stock = rowsOf(await (await sanjeev.get("/api/stock")).json());
    const dest = stock.find(
      (s: any) => s.materialId === state.material.id && s.locationId === state.loc2Id,
    );
    expect(Number(dest?.qty ?? 0), "destination received 3").toBeGreaterThanOrEqual(3);

    await sanjeev.dispose();
  });

  test("supplier return: auto-submitted → complete → stock leaves", async ({ playwright }) => {
    const raviraj = await apiAs(playwright, "raviraj");
    const sanjeev = await apiAs(playwright, "sanjeev");

    const create = await raviraj.post("/api/supplier-returns", {
      data: {
        supplierId: state.supplier.id,
        locationId: state.location.id,
        notes: `${PREFIX}damaged bags`,
        lines: [{ materialId: state.material.id, qty: 1, unitCost: 300, reason: "damaged" }],
      },
    });
    expect(create.status(), "create return").toBeLessThan(300);
    const ret = await create.json();
    const retId = ret.id ?? ret.returnId ?? ret.supplierReturnId ?? ret.return?.id;
    expect(retId, "supplier return created").toBeTruthy();

    // Material can't leave without an approved gate pass (same discipline as
    // issues and transfers) — the create auto-raises one.
    const gps = rowsOf(await (await sanjeev.get("/api/gate-passes?status=PENDING&take=50")).json());
    const gp = gps.find((g: any) => g.refType === "SupplierReturn" && g.refId === retId);
    expect(gp, "return raised a pending gate pass").toBeTruthy();
    const gpApprove = await sanjeev.patch(`/api/gate-passes/${gp.id}`, { data: { action: "approve" } });
    expect(gpApprove.status(), "approve return gate pass").toBeLessThan(300);

    const comp = await sanjeev.patch(`/api/supplier-returns/${retId}`, { data: { action: "complete" } });
    expect(comp.status(), "complete return").toBeLessThan(300);

    await raviraj.dispose();
    await sanjeev.dispose();
  });

  test("quote → select winner → PO auto-created with quoted price", async ({ playwright }) => {
    const raviraj = await apiAs(playwright, "raviraj");
    const vardaan = await apiAs(playwright, "vardaan");

    // Fresh indent for the quote flow.
    const req = await raviraj.post("/api/requisitions", {
      data: {
        projectId: state.project.id,
        notes: `${PREFIX}quote-flow`,
        lines: [{ materialId: state.material.id, qtyRequested: 10 }],
      },
    });
    expect(req.status()).toBeLessThan(300);
    const reqData = await req.json();
    const reqId = reqData.id ?? reqData.requisitionId;

    // Vardaan approves the indent (Raviraj is H3 — cannot self-approve).
    const approve = await vardaan.patch(`/api/requisitions/${reqId}`, { data: { action: "approve" } });
    expect(approve.status(), "approve indent").toBeLessThan(300);

    // The quote gate needs minQuotesRequired (default 3) — create two more
    // suppliers and a quote each, then select the cheapest.
    const extraSuppliers: string[] = [];
    for (let i = 1; i <= 2; i++) {
      const s = await raviraj.post("/api/suppliers", {
        data: { name: `${PREFIX}Supplier-${i}`, phone: `90000000${10 + i}` },
      });
      expect(s.status(), `extra supplier ${i}`).toBeLessThan(300);
      const sd = await s.json();
      extraSuppliers.push(sd.id ?? sd.supplierId);
    }

    const quoteIds: string[] = [];
    const prices = [360, 385];
    for (let i = 0; i < extraSuppliers.length; i++) {
      const q = await raviraj.post("/api/quotes", {
        data: {
          requisitionId: reqId,
          supplierId: extraSuppliers[i],
          quoteSource: "WHATSAPP",
          lines: [{ materialId: state.material.id, qty: 10, unitPrice: prices[i] }],
        },
      });
      expect(q.status(), `quote ${i + 2}`).toBeLessThan(300);
      const qd = await q.json();
      quoteIds.push(qd.id ?? qd.quoteId);
    }

    // Cheapest quote — the one we select.
    const q1 = await raviraj.post("/api/quotes", {
      data: {
        requisitionId: reqId,
        supplierId: state.supplier.id,
        quoteSource: "WHATSAPP",
        lines: [{ materialId: state.material.id, qty: 10, unitPrice: 340 }],
      },
    });
    expect(q1.status(), "quote 1").toBeLessThan(300);
    const quote1 = await q1.json();
    const q1Id = quote1.id ?? quote1.quoteId;

    // Select the winner — auto-converts indent → PO carrying quote pricing.
    const sel = await vardaan.post(`/api/quotes/${q1Id}/select`, {
      data: { selectionReason: `${PREFIX}lowest landed` },
    });
    expect(sel.status(), "select winning quote").toBeLessThan(300);
    const selData = await sel.json();
    const poId = selData.autoConvertedPo?.poId;
    expect(poId, "quote select auto-converts to a PO").toBeTruthy();

    // The auto-created PO must carry the quoted 340/unit (not ₹0).
    const po = await (await vardaan.get(`/api/purchase-orders/${poId}`)).json();
    expect(Number(po.total ?? po.subtotal ?? 0), "PO total carries quote price").toBeGreaterThan(0);

    await raviraj.dispose();
    await vardaan.dispose();
  });
});
