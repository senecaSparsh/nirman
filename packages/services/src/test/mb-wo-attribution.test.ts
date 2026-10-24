/**
 * MB → WO attribution: a measurement taken for subcontractor A's work order
 * must not be billable by subcontractor B's work order on the same BOQ item.
 * Unattributed (project-level) entries stay billable by any covering WO.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { resetDb, createTestFixture, seedTestAccounts } from "./setup";
import { createMbEntry, verifyMbEntry, approveMbEntry } from "../boq";
import { createRaBill, completeWorkOrder } from "../subcontractor";

async function createWoOnBoq(companyId: string, projectId: string, boqItemId: string, tag: string) {
  const sub = await prisma.subcontractor.create({
    data: { companyId, name: `Sub-${tag}-${Math.random().toString(36).slice(2, 6)}` },
  });
  const wo = await prisma.subcontractorWorkOrder.create({
    data: {
      companyId, projectId, subcontractorId: sub.id,
      workOrderNumber: `WO-${tag}-${Math.random().toString(36).slice(2, 8)}`,
      workTitle: `${tag} work`, status: "ACTIVE",
    },
  });
  await prisma.subcontractorWorkOrderLine.create({
    data: { workOrderId: wo.id, boqItemId, agreedRate: new Decimal(100) },
  });
  return wo;
}

async function approvedMb(args: { projectId: string; boqItemId: string; companyId: string; workOrderId?: string; approverId: string }) {
  const entry = await createMbEntry({
    projectId: args.projectId, boqItemId: args.boqItemId, companyId: args.companyId,
    measuredQty: 10, description: "measured", workOrderId: args.workOrderId,
  });
  await verifyMbEntry(entry.id, args.approverId);
  return approveMbEntry(entry.id, args.approverId);
}

describe("MB work-order attribution", () => {
  let fx: Awaited<ReturnType<typeof createTestFixture>>;
  let boqItemId: string;

  beforeEach(async () => {
    await resetDb();
    fx = await createTestFixture();
    await seedTestAccounts(fx.company.id);
    const boq = await prisma.boqItem.create({
      data: {
        projectId: fx.project.id, type: "LINE_ITEM", serialNo: "A1",
        description: "Shared BOQ item", unit: "NOS",
        estimatedQty: new Decimal(1000), rate: new Decimal(100),
      },
    });
    boqItemId = boq.id;
  });

  it("WO-B cannot bill an MB entry attributed to WO-A on the same BOQ item", async () => {
    const woA = await createWoOnBoq(fx.company.id, fx.project.id, boqItemId, "A");
    const woB = await createWoOnBoq(fx.company.id, fx.project.id, boqItemId, "B");
    await approvedMb({ projectId: fx.project.id, boqItemId, companyId: fx.company.id, workOrderId: woA.id, approverId: fx.user.id });

    await expect(createRaBill({
      workOrderId: woB.id, periodFrom: new Date(), periodTo: new Date(), companyId: fx.company.id,
    })).rejects.toThrow(/No approved unbilled MB entries/);

    // But WO-A can bill it.
    const bill = await createRaBill({
      workOrderId: woA.id, periodFrom: new Date(), periodTo: new Date(), companyId: fx.company.id,
    });
    expect(new Decimal(bill.grossAmount).toString()).toBe("1000"); // 10 × ₹100
  });

  it("unattributed entries stay billable by any covering WO", async () => {
    const woB = await createWoOnBoq(fx.company.id, fx.project.id, boqItemId, "B");
    await approvedMb({ projectId: fx.project.id, boqItemId, companyId: fx.company.id, approverId: fx.user.id });
    const bill = await createRaBill({
      workOrderId: woB.id, periodFrom: new Date(), periodTo: new Date(), companyId: fx.company.id,
    });
    expect(new Decimal(bill.grossAmount).toString()).toBe("1000");
  });

  it("WO-B completes despite unbilled entries attributed to WO-A", async () => {
    const woA = await createWoOnBoq(fx.company.id, fx.project.id, boqItemId, "A");
    const woB = await createWoOnBoq(fx.company.id, fx.project.id, boqItemId, "B");
    await approvedMb({ projectId: fx.project.id, boqItemId, companyId: fx.company.id, workOrderId: woA.id, approverId: fx.user.id });
    const completed = await completeWorkOrder(woB.id, fx.user.id);
    expect(completed.status).toBe("COMPLETED");
  });

  it("prevQty counts only this WO's billed history, not a sibling WO's", async () => {
    const woA = await createWoOnBoq(fx.company.id, fx.project.id, boqItemId, "A");
    const woB = await createWoOnBoq(fx.company.id, fx.project.id, boqItemId, "B");
    // WO-A bills its own 10 units.
    await approvedMb({ projectId: fx.project.id, boqItemId, companyId: fx.company.id, workOrderId: woA.id, approverId: fx.user.id });
    await createRaBill({ workOrderId: woA.id, periodFrom: new Date(), periodTo: new Date(), companyId: fx.company.id });
    // WO-B bills its own separate 10 units — its "previous billed" must be 0,
    // not the 10 already billed under WO-A.
    await approvedMb({ projectId: fx.project.id, boqItemId, companyId: fx.company.id, workOrderId: woB.id, approverId: fx.user.id });
    const billB = await createRaBill({ workOrderId: woB.id, periodFrom: new Date(), periodTo: new Date(), companyId: fx.company.id });
    const line = await prisma.raBillLine.findFirstOrThrow({ where: { raBillId: billB.id } });
    expect(new Decimal(line.prevQty).toString()).toBe("0");
    expect(new Decimal(line.totalQty).toString()).toBe("10");
  });

  it("rejects attribution to a WO that does not cover the BOQ item", async () => {
    const otherBoq = await prisma.boqItem.create({
      data: {
        projectId: fx.project.id, type: "LINE_ITEM", serialNo: "A2",
        description: "Unrelated item", unit: "NOS", estimatedQty: new Decimal(10), rate: new Decimal(50),
      },
    });
    const woC = await createWoOnBoq(fx.company.id, fx.project.id, otherBoq.id, "C");
    await expect(createMbEntry({
      projectId: fx.project.id, boqItemId, companyId: fx.company.id,
      measuredQty: 5, description: "misattributed", workOrderId: woC.id,
    })).rejects.toThrow(/does not cover this BOQ item/);
  });
});
