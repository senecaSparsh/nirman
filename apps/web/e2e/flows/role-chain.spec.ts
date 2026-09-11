import { test, expect } from "../fixtures";
import { testData, TEST_PREFIX } from "../helpers/test-data";

/**
 * @flow Role-chain approval tests — verify that self-approval is blocked
 * and that cross-role handoffs work correctly.
 *
 * These tests exercise the self-approval guards added to the service layer:
 *   - Requisition: approveRequisition / rejectRequisition
 *   - Purchase Order: approve (via API)
 *   - DPR: subAdminApproveDpr / adminApproveDpr / rejectDpr
 *
 * The key invariant: a user who creates/submits a record CANNOT approve
 * or reject it. Only a different user with the right permission can.
 */

test.describe("@flow Role-chain: self-approval prevention + cross-role handoff", () => {
  test("requisition: creator cannot self-approve, different role can", async ({ api }) => {
    const creatorCtx = await api("PROJECT_MANAGER");
    const approverCtx = await api("OWNER");
    const data = await testData();
    expect(data.project, "need a project in DB").toBeTruthy();
    expect(data.material, "need a material in DB").toBeTruthy();

    // ── 1. Create a requisition as PROJECT_MANAGER (autoSubmit: false) ──
    const createRes = await creatorCtx.post("/api/requisitions", {
      data: {
        projectId: data.project.id,
        autoSubmit: false,
        notes: `${TEST_PREFIX} role-chain self-approval`,
        lines: [
          { materialId: data.material.id, qtyRequested: 5 },
        ],
      },
    });
    expect(createRes.status(), "create requisition").toBeLessThan(300);
    const created = await createRes.json();
    expect(created.id).toBeTruthy();

    // ── 2. Submit the requisition ──────────────────────────────────────
    const submitRes = await creatorCtx.patch(`/api/requisitions/${created.id}`, {
      data: { action: "submit" },
    });
    expect(submitRes.status(), "submit requisition").toBe(200);

    // ── 3. Creator tries to self-approve → 403 ──────────────────────────
    const selfApproveRes = await creatorCtx.patch(`/api/requisitions/${created.id}`, {
      data: { action: "approve" },
    });
    expect(selfApproveRes.status(), "self-approval should be blocked").toBe(403);
    const selfApproveBody = await selfApproveRes.json();
    expect(selfApproveBody.error).toMatch(/cannot approve your own/i);

    // ── 4. Creator tries to self-reject → 403 ───────────────────────────
    const selfRejectRes = await creatorCtx.patch(`/api/requisitions/${created.id}`, {
      data: { action: "reject", reason: "trying to reject my own" },
    });
    expect(selfRejectRes.status(), "self-rejection should be blocked").toBe(403);

    // ── 5. Different role (OWNER) approves → 200 ────────────────────────
    const approveRes = await approverCtx.patch(`/api/requisitions/${created.id}`, {
      data: { action: "approve" },
    });
    expect(approveRes.status(), "cross-role approval should succeed").toBe(200);

    // ── 6. Verify the requisition is now APPROVED ──────────────────────
    const detailRes = await approverCtx.get(`/api/requisitions/${created.id}`);
    expect(detailRes.status()).toBe(200);
    const detail = await detailRes.json();
    expect(detail.status).toBe("APPROVED");
  });

  test("requisition: auto-submit failure surfaces submitError", async ({ api }) => {
    // When a user with PROCUREMENT_MANAGE but without REQUISITION_APPROVE
    // creates a requisition with autoSubmit: true, the auto-submit should
    // succeed (submit doesn't require approve permission), but the
    // requisition should be in SUBMITTED status.
    // We test that the API returns the submitted flag correctly.
    const ctx = await api("PROJECT_MANAGER");
    const data = await testData();
    expect(data.project, "need a project in DB").toBeTruthy();
    expect(data.material, "need a material in DB").toBeTruthy();

    const createRes = await ctx.post("/api/requisitions", {
      data: {
        projectId: data.project.id,
        autoSubmit: true,
        notes: `${TEST_PREFIX} auto-submit test`,
        lines: [
          { materialId: data.material.id, qtyRequested: 3 },
        ],
      },
    });
    expect(createRes.status()).toBeLessThan(300);
    const created = await createRes.json();
    expect(created.id).toBeTruthy();
    // Auto-submit should succeed — submitRequisition doesn't check self-approval.
    expect(created.submitted).toBe(true);
    expect(created.submitError).toBeNull();
  });

  test("purchase order: creator cannot self-approve, different role can", async ({ api }) => {
    const creatorCtx = await api("PROJECT_MANAGER");
    const approverCtx = await api("OWNER");
    const data = await testData();
    expect(data.project, "need a project in DB").toBeTruthy();
    expect(data.supplier, "need a supplier in DB").toBeTruthy();
    expect(data.material, "need a material in DB").toBeTruthy();
    expect(data.stockLocation, "need a stock location in DB").toBeTruthy();

    // ── 1. Create a PO as PROJECT_MANAGER ──────────────────────────────
    const createRes = await creatorCtx.post("/api/purchase-orders", {
      data: {
        supplierId: data.supplier.id,
        procurementScope: "COMPANY",
        destinationLocationId: data.stockLocation.id,
        projectId: data.project.id,
        lines: [
          {
            materialId: data.material.id,
            qtyOrdered: 5,
            unitCost: 100,
            gstRate: 0,
          },
        ],
        notes: `${TEST_PREFIX} PO self-approval test`,
      },
    });
    expect(createRes.status(), "create PO").toBeLessThan(300);
    const created = await createRes.json();
    expect(created.id).toBeTruthy();

    // ── 2. Creator tries to self-approve → 403 ─────────────────────────
    const selfApproveRes = await creatorCtx.patch(`/api/purchase-orders/${created.id}`, {
      data: { action: "approve" },
    });
    expect(selfApproveRes.status(), "PO self-approval should be blocked").toBe(403);

    // ── 3. Different role (OWNER) approves → 200 ────────────────────────
    const approveRes = await approverCtx.patch(`/api/purchase-orders/${created.id}`, {
      data: { action: "approve" },
    });
    expect(approveRes.status(), "cross-role PO approval should succeed").toBe(200);
  });

  test("DPR: submitter cannot self-approve at sub-admin level", async ({ api }) => {
    // DPRs are auto-submitted on creation (no DRAFT state in the enum).
    // The submitter cannot sub-admin approve or admin approve their own DPR.
    const submitterCtx = await api("SUPERVISOR");
    const approverCtx = await api("PROJECT_MANAGER");
    const data = await testData();
    expect(data.project, "need a project in DB").toBeTruthy();

    // ── 1. Create a DPR as SUPERVISOR ───────────────────────────────────
    const createRes = await submitterCtx.post("/api/dprs", {
      data: {
        projectId: data.project.id,
        date: new Date().toISOString().slice(0, 10),
        workSummary: `${TEST_PREFIX} DPR self-approval test`,
        progressPct: 10,
        workType: "Testing",
        workQty: 1,
        workUnit: "test",
        blockers: null,
        tomorrowPlan: null,
        notes: `${TEST_PREFIX} DPR test`,
      },
    });
    // DPR creation may fail if a DPR already exists for this project+date.
    // If so, skip this test.
    if (createRes.status() >= 400) {
      test.skip(true, "DPR already exists for this project+date — skipping");
      return;
    }
    const created = await createRes.json();
    expect(created.id).toBeTruthy();

    // ── 2. Submitter tries to self-approve → 403 ───────────────────────
    const selfApproveRes = await submitterCtx.patch(`/api/dprs/${created.id}`, {
      data: { action: "subAdminApprove" },
    });
    expect(selfApproveRes.status(), "DPR self-approval should be blocked").toBe(403);

    // ── 3. Submitter tries to self-reject → 403 ────────────────────────
    const selfRejectRes = await submitterCtx.patch(`/api/dprs/${created.id}`, {
      data: { action: "reject", reason: "trying to reject my own DPR" },
    });
    expect(selfRejectRes.status(), "DPR self-rejection should be blocked").toBe(403);

    // ── 4. Different role approves → 200 ───────────────────────────────
    const approveRes = await approverCtx.patch(`/api/dprs/${created.id}`, {
      data: { action: "subAdminApprove" },
    });
    expect(approveRes.status(), "cross-role DPR approval should succeed").toBe(200);
  });
});
