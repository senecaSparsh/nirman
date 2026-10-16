import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { resetDb, createTestFixture, seedTestAccounts } from "./setup";
import { createMaterialIssueRequest, cancelMaterialIssue } from "../issue";
import { createSupplierPayment, voidSupplierPayment } from "../supplier-payment";
import { createSupplierReturn, cancelSupplierReturn } from "../supplier-return";
import { createMbEntry, verifyMbEntry, approveMbEntry, rejectMbEntry } from "../boq";
import { submitDPR, subAdminApproveDpr, adminApproveDpr, rejectDpr } from "../hr";
import {
  createIncident, investigateIncident, closeIncident, cancelIncident, deleteIncident,
  createInspection, startInspection, completeInspection, cancelInspection, deleteInspection,
} from "../safety";

/**
 * Guard-regression tests — the mutation-coverage gaps the Layer-7 probe found.
 *
 * Each test pins down one guard added during the HTTP-probe sweep: if the
 * guard is silently reverted (mutated `===`→`!==`, removed `if`), THIS test
 * dies — which is what Stryker measures. The scoped vitest.mutation.config.ts
 * runs ONLY this file, so Stryker's per-mutant run stays cheap enough to run
 * the guard regions for real.
 *
 * Covers:
 *   1. PENDING issue cancel must not restore stock (phantom-stock guard)
 *   2. Supplier payment duplicate-reference dedup
 *   3. Supplier payment double-submit window dedup
 *   4. Supplier-return re-cancel refusal
 *   5. MB entry: approved/rejected refuses (re-)rejection
 *   6. DPR: approved/rejected refuses (re-)rejection
 *   7. Incident: closed refuses cancel/delete; investigated refuses delete
 *   8. Inspection: completed refuses cancel/delete; in-progress refuses delete
 */
describe("guard regressions", () => {
  let fx: Awaited<ReturnType<typeof createTestFixture>>;

  beforeAll(async () => {
    const db = await prisma.$queryRaw<{ current_database: string }[]>`SELECT current_database()`;
    expect(db[0]?.current_database).toBe("nirman_inventory_test");
  });

  beforeEach(async () => {
    await resetDb();
    fx = await createTestFixture();
    await seedTestAccounts(fx.company.id);
  });

  async function seedMaterial(qty = 100) {
    const cat = await prisma.materialCategory.create({
      data: { companyId: fx.company.id, name: "Guard Cat", unit: "NOS" },
    });
    const material = await prisma.material.create({
      data: { companyId: fx.company.id, code: "GRD-1", name: "Guard Mat", categoryId: cat.id, unit: "NOS", currentCost: new Decimal(10) },
    });
    await prisma.stockLocationItem.create({
      data: { locationId: fx.stockLocation.id, materialId: material.id, qty: new Decimal(qty), movingAvgCost: new Decimal(10) },
    });
    return material;
  }

  async function seedMbEntry() {
    const boqItem = await prisma.boqItem.create({
      data: {
        projectId: fx.project.id, type: "LINE_ITEM", serialNo: "G1",
        description: "Guard BOQ item", unit: "NOS",
        estimatedQty: new Decimal(100), rate: new Decimal(50),
      },
    });
    return createMbEntry({
      projectId: fx.project.id, boqItemId: boqItem.id, measuredQty: 5,
      description: "guard measurement", companyId: fx.company.id,
    });
  }

  // No submittedById — the reject/approve guards' self-checks compare against
  // submittedById, which stays null, so fx.user can act as a clean approver.
  async function seedDpr() {
    return submitDPR({
      companyId: fx.company.id, projectId: fx.project.id,
      date: new Date(Date.now() - 86_400_000), workSummary: "Guard DPR",
      skipAttendanceCheck: true, userId: fx.user.id,
    });
  }

  async function seedIncident() {
    return createIncident({
      projectId: fx.project.id, title: "Guard incident", description: "guard",
      incidentDate: new Date(), companyId: fx.company.id, userId: fx.user.id,
    });
  }

  async function seedInspection() {
    return createInspection({
      projectId: fx.project.id, title: "Guard inspection",
      scheduledDate: new Date(), companyId: fx.company.id, userId: fx.user.id,
    });
  }

  it("PENDING issue cancel mints no phantom stock", async () => {
    const material = await seedMaterial(100);
    const issue = await createMaterialIssueRequest({
      projectId: fx.project.id,
      fromLocationId: fx.stockLocation.id,
      companyId: fx.company.id,
      issuedById: fx.user.id,
      notes: "guard-reg",
      lines: [{ materialId: material.id, qty: 5 }],
    });
    expect(issue.materialIssue.status).toBe("PENDING");

    const before = await prisma.stockLocationItem.findUnique({
      where: { locationId_materialId: { locationId: fx.stockLocation.id, materialId: material.id } },
    });
    await cancelMaterialIssue(issue.materialIssue.id, fx.user.id);
    const after = await prisma.stockLocationItem.findUnique({
      where: { locationId_materialId: { locationId: fx.stockLocation.id, materialId: material.id } },
    });
    const moves = await prisma.stockMovement.count({ where: { materialId: material.id } });
    expect(Number(after?.qty)).toBe(Number(before?.qty));
    expect(moves).toBe(0);
  });

  it("supplier payment duplicate referenceNo is refused", async () => {
    const supplier = await prisma.supplier.create({
      data: { companyId: fx.company.id, name: "Guard Supplier", balanceOwed: new Decimal(100000) },
    });
    const base = {
      supplierId: supplier.id, companyId: fx.company.id, amount: 1000,
      paymentMode: "UPI", paymentDate: new Date(), referenceNo: "UTR-GUARD-1",
    };
    await createSupplierPayment({ ...base, userId: fx.user.id });
    await expect(
      createSupplierPayment({ ...base, userId: fx.user.id }),
    ).rejects.toThrow(/already recorded/i);
  });

  it("identical supplier payment inside the window is refused (no referenceNo)", async () => {
    const supplier = await prisma.supplier.create({
      data: { companyId: fx.company.id, name: "Guard Supplier 2", balanceOwed: new Decimal(100000) },
    });
    const base = {
      supplierId: supplier.id, companyId: fx.company.id, amount: 4321,
      paymentMode: "CASH", paymentDate: new Date(),
    };
    await createSupplierPayment({ ...base, userId: fx.user.id });
    const err = await createSupplierPayment({ ...base, userId: fx.user.id }).catch((e) => e);
    expect(err.message).toMatch(/recorded moments ago/i);
    // Case-sensitive on purpose — pins the paymentMode.toLowerCase() in the
    // message (a mutation to toUpperCase slips past a /i regex).
    expect(err.message).toContain("identical cash payment");
  });

  it("supplier return cannot be cancelled twice", async () => {
    const supplier = await prisma.supplier.create({
      data: { companyId: fx.company.id, name: "Guard Supplier 3" },
    });
    const material = await seedMaterial(100);
    const ret = await createSupplierReturn({
      supplierId: supplier.id, companyId: fx.company.id, locationId: fx.stockLocation.id,
      userId: fx.user.id, lines: [{ materialId: material.id, qty: 1, unitCost: 10 }],
    });
    await cancelSupplierReturn(ret.id, fx.user.id);
    await expect(cancelSupplierReturn(ret.id, fx.user.id)).rejects.toThrow(/already cancelled/i);
  });

  // ── Batch 2: the survivors from the first scoped Stryker run.
  // These aren't refusal guards — they're the *positive* space: a mutant that
  // widens a `where`, drops a status clause, or disables a branch only shows
  // up when a test proves the legal path still works / the named row matters.

  it("COMPLETED issue cancel restores stock via a reversal movement", async () => {
    const material = await seedMaterial(100);
    const issue = await createMaterialIssueRequest({
      projectId: fx.project.id,
      fromLocationId: fx.stockLocation.id,
      companyId: fx.company.id,
      issuedById: fx.user.id,
      notes: "guard-reg-completed",
      lines: [{ materialId: material.id, qty: 5 }],
    });
    // Fast-forward to COMPLETED — the guard branches on status only; the
    // gate-pass execution path is covered by the full workflow tests.
    await prisma.materialIssue.update({
      where: { id: issue.materialIssue.id },
      data: { status: "COMPLETED" },
    });
    await prisma.materialIssueLine.updateMany({
      where: { materialIssueId: issue.materialIssue.id },
      data: { unitCost: new Decimal(10) },
    });

    const before = await prisma.stockLocationItem.findUnique({
      where: { locationId_materialId: { locationId: fx.stockLocation.id, materialId: material.id } },
    });
    await cancelMaterialIssue(issue.materialIssue.id, fx.user.id);
    const after = await prisma.stockLocationItem.findUnique({
      where: { locationId_materialId: { locationId: fx.stockLocation.id, materialId: material.id } },
    });
    const reversals = await prisma.stockMovement.count({
      where: { materialId: material.id, movementType: "ADJUSTMENT_IN" },
    });
    expect(Number(after?.qty)).toBe(Number(before?.qty) + 5);
    expect(reversals).toBe(1);
  });

  it("dupe-reference error names the existing payment, different ref is allowed", async () => {
    const supplier = await prisma.supplier.create({
      data: { companyId: fx.company.id, name: "Guard Supplier 4", balanceOwed: new Decimal(100000) },
    });
    const base = {
      supplierId: supplier.id, companyId: fx.company.id, amount: 1000,
      paymentMode: "UPI", paymentDate: new Date(),
    };
    const first = await createSupplierPayment({ ...base, referenceNo: "UTR-DUPE-1", userId: fx.user.id });
    const err = await createSupplierPayment({ ...base, amount: 2000, referenceNo: "UTR-DUPE-1", userId: fx.user.id }).catch((e) => e);
    expect(err.message).toMatch(/already recorded/i);
    expect(err.message).toContain(first.paymentNumber);
    // A different reference is a different bank transaction — must succeed.
    const second = await createSupplierPayment({ ...base, amount: 2000, referenceNo: "UTR-DUPE-2", userId: fx.user.id });
    expect(second.id).toBeTruthy();
  });

  it("a voided payment frees its referenceNo", async () => {
    const supplier = await prisma.supplier.create({
      data: { companyId: fx.company.id, name: "Guard Supplier 5", balanceOwed: new Decimal(100000) },
    });
    const base = {
      supplierId: supplier.id, companyId: fx.company.id,
      paymentMode: "UPI", paymentDate: new Date(),
    };
    const first = await createSupplierPayment({ ...base, amount: 1000, referenceNo: "UTR-VOID-1", userId: fx.user.id });
    await voidSupplierPayment({ paymentId: first.id, companyId: fx.company.id, userId: fx.user.id });
    const second = await createSupplierPayment({ ...base, amount: 2000, referenceNo: "UTR-VOID-1", userId: fx.user.id });
    expect(second.id).toBeTruthy();
  });

  it("identical payment to a DIFFERENT supplier is allowed", async () => {
    const s1 = await prisma.supplier.create({
      data: { companyId: fx.company.id, name: "Guard Supplier 6a", balanceOwed: new Decimal(100000) },
    });
    const s2 = await prisma.supplier.create({
      data: { companyId: fx.company.id, name: "Guard Supplier 6b", balanceOwed: new Decimal(100000) },
    });
    const base = { companyId: fx.company.id, amount: 4321, paymentMode: "CASH", paymentDate: new Date() };
    await createSupplierPayment({ ...base, supplierId: s1.id, userId: fx.user.id });
    const second = await createSupplierPayment({ ...base, supplierId: s2.id, userId: fx.user.id });
    expect(second.id).toBeTruthy();
  });

  it("a voided payment frees its window-dedup slot", async () => {
    const supplier = await prisma.supplier.create({
      data: { companyId: fx.company.id, name: "Guard Supplier 10", balanceOwed: new Decimal(100000) },
    });
    // No referenceNo — cash payments rely on the 15s window check alone.
    const base = {
      supplierId: supplier.id, companyId: fx.company.id, amount: 6789,
      paymentMode: "CASH", paymentDate: new Date(),
    };
    const first = await createSupplierPayment({ ...base, userId: fx.user.id });
    await voidSupplierPayment({ paymentId: first.id, companyId: fx.company.id, userId: fx.user.id });
    const second = await createSupplierPayment({ ...base, userId: fx.user.id });
    expect(second.id).toBeTruthy();
  });

  it("identical payment OUTSIDE the 15s window is allowed", async () => {
    const supplier = await prisma.supplier.create({
      data: { companyId: fx.company.id, name: "Guard Supplier 7", balanceOwed: new Decimal(100000) },
    });
    const base = {
      supplierId: supplier.id, companyId: fx.company.id, amount: 4321,
      paymentMode: "CASH", paymentDate: new Date(),
    };
    const first = await createSupplierPayment({ ...base, userId: fx.user.id });
    // Backdate createdAt past the double-submit window.
    await prisma.supplierPayment.update({
      where: { id: first.id },
      data: { createdAt: new Date(Date.now() - 60_000) },
    });
    const second = await createSupplierPayment({ ...base, userId: fx.user.id });
    expect(second.id).toBeTruthy();
  });

  it("payment against a DRAFT purchase order is refused", async () => {
    const supplier = await prisma.supplier.create({
      data: { companyId: fx.company.id, name: "Guard Supplier 8", balanceOwed: new Decimal(100000) },
    });
    const po = await prisma.purchaseOrder.create({
      data: {
        poNumber: "PO-GUARD-1", supplierId: supplier.id, procurementScope: "COMPANY",
        companyId: fx.company.id, destinationLocationId: fx.stockLocation.id,
      },
    });
    await expect(
      createSupplierPayment({
        supplierId: supplier.id, companyId: fx.company.id, amount: 5000,
        paymentMode: "UPI", paymentDate: new Date(), purchaseOrderId: po.id, userId: fx.user.id,
      }),
    ).rejects.toThrow(/ordered first/i);
  });

  it("missing and completed supplier returns refuse cancel", async () => {
    await expect(cancelSupplierReturn("no-such-return", fx.user.id)).rejects.toThrow(/not found/i);
    const supplier = await prisma.supplier.create({
      data: { companyId: fx.company.id, name: "Guard Supplier 9" },
    });
    const material = await seedMaterial(100);
    const ret = await createSupplierReturn({
      supplierId: supplier.id, companyId: fx.company.id, locationId: fx.stockLocation.id,
      userId: fx.user.id, lines: [{ materialId: material.id, qty: 1, unitCost: 10 }],
    });
    // Seed COMPLETED directly — the gate-pass completion path is covered by
    // the workflow probes; the guard only branches on status.
    await prisma.supplierReturn.update({ where: { id: ret.id }, data: { status: "COMPLETED" } });
    await expect(cancelSupplierReturn(ret.id, fx.user.id)).rejects.toThrow(/completed/i);
  });

  it("fresh REPORTED incident can be cancelled — and the cancel is audited", async () => {
    const inc = await seedIncident();
    const cancelled = await cancelIncident(inc.id, fx.user.id);
    expect(cancelled.status).toBe("CANCELLED");
    const log = await prisma.auditLog.findFirst({
      where: { action: "SAFETY_INCIDENT_CANCEL", entityType: "SafetyIncident", entityId: inc.id },
    });
    expect(log).not.toBeNull();
    expect((log?.after as { status?: string } | null)?.status).toBe("CANCELLED");
  });

  it("UNDER_INVESTIGATION incident can still be cancelled", async () => {
    const inc = await seedIncident();
    // No service path reaches UNDER_INVESTIGATION directly — seed the state.
    await prisma.safetyIncident.update({ where: { id: inc.id }, data: { status: "UNDER_INVESTIGATION" } });
    const cancelled = await cancelIncident(inc.id, fx.user.id);
    expect(cancelled.status).toBe("CANCELLED");
  });

  it("REPORTED incident can be deleted directly", async () => {
    const inc = await seedIncident();
    await expect(deleteIncident(inc.id, fx.user.id)).resolves.toEqual({ ok: true });
  });

  it("missing and cross-tenant incident deletes 404", async () => {
    const inc = await seedIncident();
    const other = await prisma.company.create({ data: { name: "Other Co", currency: "INR" } });
    await expect(deleteIncident(inc.id, fx.user.id, other.id)).rejects.toThrow(/not found/i);
    await expect(deleteIncident("missing-incident-id", fx.user.id)).rejects.toThrow(/not found/i);
  });

  it("SCHEDULED inspection can be cancelled — and the cancel is audited", async () => {
    const insp = await seedInspection();
    const cancelled = await cancelInspection(insp.id, fx.user.id);
    expect(cancelled.status).toBe("CANCELLED");
    const log = await prisma.auditLog.findFirst({
      where: { action: "SAFETY_INSPECTION_CANCEL", entityType: "SafetyInspection", entityId: insp.id },
    });
    expect(log).not.toBeNull();
    expect((log?.after as { status?: string } | null)?.status).toBe("CANCELLED");
  });

  it("missing and cross-tenant inspection deletes 404", async () => {
    const insp = await seedInspection();
    const other = await prisma.company.create({ data: { name: "Other Co", currency: "INR" } });
    await expect(deleteInspection(insp.id, fx.user.id, other.id)).rejects.toThrow(/not found/i);
    await expect(deleteInspection("missing-inspection-id", fx.user.id)).rejects.toThrow(/not found/i);
    await expect(cancelInspection("missing-inspection-id", fx.user.id)).rejects.toThrow(/not found/i);
  });

  it("SCHEDULED inspection can be deleted directly", async () => {
    const insp = await seedInspection();
    await expect(deleteInspection(insp.id, fx.user.id)).resolves.toEqual({ ok: true });
  });

  it("approved MB entry refuses rejection", async () => {
    const entry = await seedMbEntry();
    await verifyMbEntry(entry.id, fx.user.id);
    await approveMbEntry(entry.id, fx.user.id);
    await expect(rejectMbEntry(entry.id, "nope", fx.user.id)).rejects.toThrow(/already-approved/i);
  });

  it("rejected MB entry refuses a second rejection", async () => {
    const entry = await seedMbEntry();
    await rejectMbEntry(entry.id, "bad measurement", fx.user.id);
    await expect(rejectMbEntry(entry.id, "again", fx.user.id)).rejects.toThrow(/already-rejected/i);
  });

  it("approved DPR refuses rejection", async () => {
    const dpr = await seedDpr();
    await subAdminApproveDpr(dpr.id, fx.user.id, undefined, "OWNER");
    await adminApproveDpr(dpr.id, fx.user.id, undefined, "OWNER");
    await expect(rejectDpr(dpr.id, fx.user.id, "nope")).rejects.toThrow(/already-approved/i);
  });

  it("rejected DPR refuses a second rejection", async () => {
    const dpr = await seedDpr();
    await rejectDpr(dpr.id, fx.user.id, "needs rework");
    await expect(rejectDpr(dpr.id, fx.user.id, "still no")).rejects.toThrow(/already-rejected/i);
  });

  it("closed incident refuses cancel and delete", async () => {
    const inc = await seedIncident();
    await investigateIncident(inc.id, { rootCause: "guard rc", correctiveActions: "guard ca", userId: fx.user.id });
    await closeIncident(inc.id, fx.user.id, "closed for test");
    await expect(cancelIncident(inc.id, fx.user.id)).rejects.toThrow(/cannot cancel/i);
    await expect(deleteIncident(inc.id, fx.user.id)).rejects.toThrow(/closed/i);
  });

  it("investigated incident refuses delete until cancelled", async () => {
    const inc = await seedIncident();
    await investigateIncident(inc.id, { rootCause: "rc", correctiveActions: "ca", userId: fx.user.id });
    await expect(deleteIncident(inc.id, fx.user.id)).rejects.toThrow(/cancel it first/i);
    await cancelIncident(inc.id, fx.user.id);
    await expect(cancelIncident(inc.id, fx.user.id)).rejects.toThrow(/cannot cancel/i);
    await expect(deleteIncident(inc.id, fx.user.id)).resolves.toEqual({ ok: true });
  });

  it("completed inspection refuses cancel and delete", async () => {
    const insp = await seedInspection();
    await startInspection(insp.id, fx.user.id);
    await completeInspection(insp.id, fx.user.id, "PASSED", "all clear");
    await expect(cancelInspection(insp.id, fx.user.id)).rejects.toThrow(/cannot cancel/i);
    await expect(deleteInspection(insp.id, fx.user.id)).rejects.toThrow(/completed/i);
  });

  it("in-progress inspection refuses delete until cancelled", async () => {
    const insp = await seedInspection();
    await startInspection(insp.id, fx.user.id);
    await expect(deleteInspection(insp.id, fx.user.id)).rejects.toThrow(/cancel it first/i);
    await cancelInspection(insp.id, fx.user.id);
    await expect(deleteInspection(insp.id, fx.user.id)).resolves.toEqual({ ok: true });
  });
});
