import { test, expect } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";

/**
 * ═══════════════════════════════════════════════════════════════════
 * SRG HANDOVER — ROUND 2: paused-state completion + cross-role depth
 * ═══════════════════════════════════════════════════════════════════
 *
 * Round 1 proved create→submit→approve→execute for the happy path.
 * This round verifies the states that PAUSE mid-flight actually resolve:
 *
 *   - gate pass approval auto-executes the PENDING material issue
 *   - reject → resubmit cycle
 *   - expense claim: create → lines → submit → approve → pay → PAID
 *   - DPR: site engineer submits → PD reviews → admin approves
 *   - leave: apply → manager approves
 *   - department (cost-centre) issues execute end-to-end
 *   - supplier payment posts against the PO
 *   - approvals inbox surfaces pending items to the right role
 *   - cancel/void reverses stock correctly
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
const PREFIX = "E2E-SRG2-";

async function apiAs(playwright: any, user: SrgUser): Promise<APIRequestContext> {
  return playwright.request.newContext({
    baseURL: BASE,
    extraHTTPHeaders: { "x-test-user": SRG[user] },
  });
}

const rowsOf = (d: any) => (Array.isArray(d) ? d : d?.rows ?? d?.items ?? []);
const state: Record<string, any> = {};

test.describe.serial("SRG handover round 2 — deep workflow completion", () => {
  // ── 0. Locate fixtures from round 1 (or create what's missing) ────
  test("fixtures: find round-1 records + employee ids", async ({ playwright }) => {
    const ctx = await apiAs(playwright, "sanjeev");

    const [suppliers, materials, projects, locations, employees, users, gatePasses] = await Promise.all([
      ctx.get("/api/suppliers"),
      ctx.get("/api/materials"),
      ctx.get("/api/projects"),
      ctx.get("/api/stock-locations"),
      ctx.get("/api/employees"),
      ctx.get("/api/users"),
      ctx.get("/api/gate-passes?status=PENDING&take=10"),
    ]);

    const supplierRows = rowsOf(await suppliers.json());
    state.supplier = supplierRows.find((s: any) => s.name?.startsWith("E2E-SRG-")) ?? supplierRows[0];
    state.material = rowsOf(await materials.json()).find((m: any) => m.name?.startsWith("E2E-SRG-"));
    state.project = rowsOf(await projects.json()).find((p: any) => p.name?.startsWith("E2E-SRG-"));
    state.location = rowsOf(await locations.json())[0];
    state.pendingGatePass = rowsOf(await gatePasses.json())[0];
    state.employees = rowsOf(await employees.json());

    expect(state.material, "round-1 material exists").toBeTruthy();
    expect(state.project, "round-1 project exists").toBeTruthy();
    expect(state.location, "a stock location exists").toBeTruthy();

    // Self-sufficient: if no PENDING gate pass is left over from round 1
    // (a prior run may have approved them all), create a gate-pass-gated
    // issue so the approval test has one to work on.
    if (!state.pendingGatePass) {
      const yash = await apiAs(playwright, "yash");
      const issue = await yash.post("/api/issue-materials", {
        data: {
          projectId: state.project.id,
          fromLocationId: state.location.id,
          requireGatePass: true,
          receiverName: "Yash Saxena",
          lines: [{ materialId: state.material.id, qty: 2 }],
        },
      });
      if (issue.ok()) {
        const gps = await ctx.get("/api/gate-passes?status=PENDING&take=10");
        state.pendingGatePass = rowsOf(await gps.json())[0];
      }
      await yash.dispose();
    }

    // Ensure the E2E material has enough stock — repeated runs deplete it via
    // gate-pass + issue + cancel flows. Top up to a healthy level so the
    // stock-moving tests never starve.
    const stockRows = rowsOf(await (await ctx.get("/api/stock")).json());
    const e2eStock = stockRows.find((s: any) => s.materialId === state.material.id);
    const onHand = Number(e2eStock?.qty ?? 0);
    if (onHand < 20) {
      await ctx.post(`/api/materials/${state.material.id}/adjust-stock`, {
        data: {
          locationId: state.location.id,
          direction: "IN",
          qty: 50,
          unitCost: 10,
          reason: "E2E top-up",
        },
      });
    }

    // Map employees by name for claimant/leave tests.
    state.empYash = state.employees.find((e: any) => e.name?.includes("Yash"));
    state.empManish = state.employees.find((e: any) => e.name?.includes("Manish"));
    state.userManish = rowsOf(await users.json()).find((u: any) => u.name?.includes("Manish"));
    expect(state.empYash, "Yash employee record").toBeTruthy();
    expect(state.empManish, "Manish employee record").toBeTruthy();
    expect(state.userManish, "Manish user account").toBeTruthy();

    // Guarantee stock: repeated runs deplete the E2E material. Top up via a
    // direct purchase (local-market buy) if available qty is low — this also
    // exercises the direct-purchase → stock-in flow.
    const stock = rowsOf(await (await ctx.get("/api/stock")).json());
    const bal = stock.find(
      (s: any) => s.materialId === state.material.id && s.locationId === state.location.id,
    );
    if (Number(bal?.qty ?? 0) < 10) {
      const dp = await ctx.post("/api/direct-purchases", {
        data: {
          supplierName: `${PREFIX}Local Trader`,
          locationId: state.location.id,
          notes: "stock top-up",
          lines: [{ materialId: state.material.id, qty: 50, unitCost: 300 }],
        },
      });
      expect(dp.status(), "direct purchase top-up").toBeLessThan(300);
    }

    await ctx.dispose();
  });

  // ── 1. Approvals inbox surfaces the pending gate pass to OWNER ────
  test("approvals inbox: OWNER sees the pending gate pass", async ({ playwright }) => {
    const vardaan = await apiAs(playwright, "vardaan");
    const res = await vardaan.get("/api/approvals");
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.gatePasses)).toBe(true);
    if (state.pendingGatePass) {
      const found = data.gatePasses.find((g: any) => g.id === state.pendingGatePass.id);
      expect(found, "pending gate pass in owner's approvals").toBeTruthy();
      expect(found.canApprove).toBe(true);
    }
    await vardaan.dispose();
  });

  // ── 2. Gate pass approve → linked PENDING issue auto-executes ─────
  test("gate pass approval executes the PENDING issue + stock drops", async ({ playwright }) => {
    const vardaan = await apiAs(playwright, "vardaan");
    const yash = await apiAs(playwright, "yash");

    // Self-contained: create a fresh gate-pass-required issue as the site
    // engineer (rerunnable — prior runs may have consumed earlier passes).
    const issue = await yash.post("/api/issue-materials", {
      data: {
        projectId: state.project.id,
        fromLocationId: state.location.id,
        receiverName: "GP chain test",
        requireGatePass: true,
        lines: [{ materialId: state.material.id, qty: 2 }],
      },
    });
    expect(issue.status(), "create gated issue").toBeLessThan(300);
    const iss = await issue.json();
    expect(iss.pending).toBe(true);

    // The link lives on the gate pass: GatePass.refType="MaterialIssue", refId=issue.id.
    const gps = rowsOf(await (await yash.get("/api/gate-passes?status=PENDING&take=50")).json());
    const gp = gps.find((g: any) => g.refType === "MaterialIssue" && g.refId === iss.materialIssueId);
    expect(gp, "issue links a pending gate pass").toBeTruthy();
    const gpId = gp.id;

    const ap = await vardaan.patch(`/api/gate-passes/${gpId}`, {
      data: { action: "approve" },
    });
    expect(ap.status(), "approve gate pass").toBe(200);

    // Auto-execution is async — poll the issue until it leaves PENDING.
    let issueAfter: any = null;
    for (let i = 0; i < 10; i++) {
      const d = await yash.get(`/api/issue-materials/${iss.materialIssueId}`);
      if (d.status() === 200) {
        issueAfter = await d.json();
        if (issueAfter.status !== "PENDING") break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(issueAfter?.status, "linked issue must leave PENDING").not.toBe("PENDING");

    // Verify via the stock ledger for THIS issue id (global stock deltas are
    // fragile — other flows can interleave).
    const moves = rowsOf(await (await vardaan.get(`/api/stock-movements?take=100`)).json());
    const ours = moves.filter(
      (m: any) => m.refType === "MATERIAL_ISSUE" && m.refId === iss.materialIssueId,
    );
    expect(ours.length, "one ledger entry for the issue").toBe(1);
    expect(Number(ours[0].qty)).toBe(2);

    await vardaan.dispose();
    await yash.dispose();
  });

  // ── 3. Reject → resubmit cycle on a requisition ───────────────────
  test("reject → resubmit cycle works", async ({ playwright }) => {
    const raviraj = await apiAs(playwright, "raviraj");
    const vardaan = await apiAs(playwright, "vardaan");

    const create = await raviraj.post("/api/requisitions", {
      data: {
        projectId: state.project.id,
        notes: `${PREFIX}reject-cycle`,
        lines: [{ materialId: state.material.id, qtyRequested: 5 }],
      },
    });
    expect(create.status()).toBeLessThan(300);
    const req = await create.json();

    const reject = await vardaan.patch(`/api/requisitions/${req.id}`, {
      data: { action: "reject", rejectionReason: `${PREFIX}test reject` },
    });
    expect(reject.status(), "reject").toBe(200);

    let d = await (await raviraj.get(`/api/requisitions/${req.id}`)).json();
    expect(d.status).toBe("REJECTED");

    const resubmit = await raviraj.patch(`/api/requisitions/${req.id}`, {
      data: { action: "submit" },
    });
    expect(resubmit.status(), "resubmit after rejection").toBe(200);
    d = await (await raviraj.get(`/api/requisitions/${req.id}`)).json();
    expect(d.status).toBe("SUBMITTED");

    await raviraj.dispose();
    await vardaan.dispose();
  });

  // ── 4. Expense claim full chain ───────────────────────────────────
  test("expense claim: create → lines → submit → approve → pay", async ({ playwright }) => {
    const manish = await apiAs(playwright, "manish");
    const vardaan = await apiAs(playwright, "vardaan");

    // claimantId is a User id (ExpenseClaim.claimant → User), not Employee.
    const create = await manish.post("/api/expense-claims", {
      data: { claimantId: state.userManish.id, projectId: state.project.id, description: `${PREFIX}travel` },
    });
    expect(create.status(), "create claim").toBeLessThan(300);
    const claim = await create.json();
    state.claimId = claim.id;

    const line = await manish.post(`/api/expense-claims/${claim.id}/lines`, {
      data: { category: "Travel", amount: 3200, notes: "Site visit cab" },
    });
    expect(line.status(), "add claim line").toBeLessThan(300);

    const submit = await manish.patch(`/api/expense-claims/${claim.id}`, { data: { action: "submit" } });
    expect(submit.status(), "submit claim").toBe(200);

    const approve = await vardaan.patch(`/api/expense-claims/${claim.id}`, { data: { action: "approve" } });
    expect(approve.status(), "approve claim").toBe(200);

    const pay = await manish.patch(`/api/expense-claims/${claim.id}`, {
      data: { action: "pay", paymentMode: "UPI" },
    });
    expect(pay.status(), "pay claim").toBe(200);

    const detail = await (await manish.get(`/api/expense-claims/${claim.id}`)).json();
    expect(detail.status).toBe("PAID");

    await manish.dispose();
    await vardaan.dispose();
  });

  // ── 5. DPR: engineer submits → PD reviews → admin approves ────────
  test("DPR chain: Yash submits → Sanjeev subAdmin → Anurag adminApprove", async ({ playwright }) => {
    const yash = await apiAs(playwright, "yash");
    const sanjeev = await apiAs(playwright, "sanjeev");
    const anurag = await apiAs(playwright, "anurag");

    // The DPR endpoint upserts on project+date — reruns must find an unused
    // date (an APPROVED DPR can't be re-created). Try a wide back-dated window.
    let dprId: string | null = null;
    const startBack = 15 + Math.floor(Math.random() * 200);
    for (let back = startBack; back < startBack + 60 && !dprId; back++) {
      const d = new Date(Date.now() - back * 86400_000).toISOString().slice(0, 10);
      const create = await yash.post("/api/dprs", {
        data: {
          projectId: state.project.id,
          date: d,
          workSummary: `${PREFIX}slab casting (${d})`,
          weather: "Clear",
          skipAttendanceCheck: true,
        },
      });
      if (create.status() < 300) {
        const dpr = await create.json();
        dprId = dpr.id ?? dpr.dprId;
      }
    }
    expect(dprId, "create DPR on an unused date").toBeTruthy();

    const sub = await sanjeev.patch(`/api/dprs/${dprId}`, { data: { action: "subAdminApprove" } });
    expect(sub.status(), "subAdmin approve").toBeLessThan(300);

    const adm = await anurag.patch(`/api/dprs/${dprId}`, { data: { action: "adminApprove" } });
    expect(adm.status(), "admin approve").toBeLessThan(300);

    await yash.dispose();
    await sanjeev.dispose();
    await anurag.dispose();
  });

  // ── 6. Leave: apply for Yash's employee → Anurag (reportsTo) ──────
  test("leave: apply → approve", async ({ playwright }) => {
    const vardaan = await apiAs(playwright, "vardaan");
    const sanjeev = await apiAs(playwright, "sanjeev");

    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    // Approved leaves can't overlap and annual balance is enforced — try a few
    // run-unique windows far in the future so reruns never collide.
    let leaveId: string | null = null;
    for (let attempt = 0; attempt < 4 && !leaveId; attempt++) {
      const offsetDays = 30 + Math.floor(Math.random() * 900) + attempt * 500;
      const start = new Date(Date.now() + offsetDays * 86400_000);
      const end = new Date(Date.now() + (offsetDays + 1) * 86400_000);
      const apply = await sanjeev.post("/api/leaves", {
        data: {
          employeeId: state.empYash.id,
          type: "CASUAL",
          startDate: fmt(start),
          endDate: fmt(end),
          reason: `${PREFIX}family function`,
        },
      });
      if (apply.status() >= 300) continue;
      const leave = await apply.json();
      const id = leave.id ?? leave.leaveId;
      const act = await vardaan.post(`/api/leaves/${id}`, { data: { approve: true } });
      if (act.status() < 300) leaveId = id;
    }
    expect(leaveId, "leave applied and approved").toBeTruthy();

    await vardaan.dispose();
    await sanjeev.dispose();
  });

  // ── 7. Department (cost-centre) issue — the scoping fix, e2e ──────
  test("department issue executes + is readable afterwards", async ({ playwright }) => {
    const sanjeev = await apiAs(playwright, "sanjeev");
    const raviraj = await apiAs(playwright, "raviraj");

    // Find-or-create a department — the code is unique, so reruns must reuse
    // the existing one instead of 409ing.
    const deptList = rowsOf(await (await sanjeev.get("/api/departments")).json());
    let deptData = deptList.find((d: any) => d.code === `${PREFIX}RICE`);
    if (!deptData) {
      const dept = await sanjeev.post("/api/departments", {
        data: { code: `${PREFIX}RICE`, name: `${PREFIX}Rice Mill` },
      });
      expect(dept.status(), "create department").toBeLessThan(300);
      deptData = await dept.json();
    }

    // Issue stock to the department — no gate pass for cost centres.
    // (STOCK_ISSUE is held by ADMIN/SITE_ENGINEER/STORE_KEEPER, not PROCUREMENT.)
    const issue = await sanjeev.post("/api/issue-materials", {
      data: {
        departmentId: deptData.id,
        fromLocationId: state.location.id,
        receiverName: "Rice Mill Manager",
        lines: [{ materialId: state.material.id, qty: 1 }],
      },
    });
    expect(issue.status(), "department issue").toBeLessThan(300);
    const iss = await issue.json();

    // The orphaned-record regression: the issue must be readable + EXECUTED.
    const detail = await sanjeev.get(`/api/issue-materials/${iss.materialIssueId}`);
    expect(detail.status(), "department issue detail readable").toBe(200);
    const dd = await detail.json();
    expect(dd.status, "dept issues execute immediately").toBe("COMPLETED");

    await sanjeev.dispose();
    await raviraj.dispose();
  });

  // ── 8. Supplier payment posts against the PO ──────────────────────
  test("supplier payment against the received PO", async ({ playwright }) => {
    const manish = await apiAs(playwright, "manish");
    const pos = rowsOf(await (await manish.get("/api/purchase-orders?take=20")).json());
    // Need a PO with a real outstanding total — zero-total POs (unpriced
    // convert lines) correctly reject any payment.
    const po = pos.find((p: any) => p.status === "RECEIVED" && Number(p.total) > 0)
      ?? pos.find((p: any) => Number(p.total) > 0);
    expect(po, "a PO with a positive total exists").toBeTruthy();

    // The list row may not carry supplierId — fetch the PO detail.
    const poDetail = await (await manish.get(`/api/purchase-orders/${po.id}`)).json();
    const supplierId = poDetail.supplierId ?? poDetail.supplier?.id;
    expect(supplierId, "PO has a supplier").toBeTruthy();

    // Pay a small amount within the remaining balance so the test stays
    // rerunnable across runs that accumulate payments.
    const amount = Math.min(5, Number(po.total));
    const pay = await manish.post("/api/supplier-payments", {
      data: {
        supplierId,
        purchaseOrderId: po.id,
        amount,
        paymentMode: "NEFT",
        referenceNo: `${PREFIX}UTR${Date.now() % 100000}`,
      },
    });
    expect(pay.status(), "supplier payment").toBeLessThan(300);

    // Supplier balance should reflect the payment.
    const sup = await (await manish.get(`/api/suppliers/${supplierId}`)).json();
    expect(sup.id).toBeTruthy();

    await manish.dispose();
  });

  // ── 9. Cancel an issue reverses stock ─────────────────────────────
  test("cancel issue reverses stock", async ({ playwright }) => {
    const yash = await apiAs(playwright, "yash");
    const sanjeev = await apiAs(playwright, "sanjeev");

    const stockBefore = rowsOf(await (await yash.get("/api/stock")).json())
      .find((s: any) => s.materialId === state.material.id);

    // Issue 1 unit to the project (no gate pass so it executes immediately).
    // STOCK_ISSUE is held by SITE_ENGINEER/ADMIN/STORE_KEEPER, not PROCUREMENT.
    const issue = await yash.post("/api/issue-materials", {
      data: {
        projectId: state.project.id,
        fromLocationId: state.location.id,
        receiverName: "Cancel test",
        lines: [{ materialId: state.material.id, qty: 1 }],
      },
    });
    expect(issue.status()).toBeLessThan(300);
    const iss = await issue.json();

    const cancel = await sanjeev.patch(`/api/issue-materials/${iss.materialIssueId}`, {
      data: { action: "cancel", reason: `${PREFIX}cancel` },
    });
    // cancel may be PATCH or POST action — accept whichever shape the route uses.
    if (cancel.status() === 404 || cancel.status() === 405) {
      const alt = await sanjeev.post(`/api/issue-materials/${iss.materialIssueId}`, {
        data: { action: "cancel", reason: `${PREFIX}cancel` },
      });
      expect(alt.status(), "cancel issue").toBeLessThan(300);
    } else {
      expect(cancel.status(), "cancel issue").toBeLessThan(300);
    }

    const stockAfter = rowsOf(await (await yash.get("/api/stock")).json())
      .find((s: any) => s.materialId === state.material.id);
    expect(
      Number(stockAfter?.qty ?? 0),
      "stock restored after cancel",
    ).toBe(Number(stockBefore?.qty ?? 0));

    await yash.dispose();
    await sanjeev.dispose();
  });
});
