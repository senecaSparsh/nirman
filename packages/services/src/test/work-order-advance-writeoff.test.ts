/**
 * completeWorkOrder — unrecovered advance guard.
 *
 * An outstanding subcontractor advance can only be recovered by an RA bill,
 * and no bill can run after the WO completes. Completing with an advance
 * still unrecovered would strand the receivable with no recovery path. The
 * completion must therefore block unless the caller explicitly forgives the
 * advance (which posts the write-off to GL).
 *
 * These run against the real dev DB (see ./setup.ts).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { resetDb, createTestFixture, seedTestAccounts } from "./setup";
import { completeWorkOrder } from "../subcontractor";

async function createWoWithAdvance(
  companyId: string,
  projectId: string,
  advanceAmount: number,
) {
  const sub = await prisma.subcontractor.create({
    data: {
      companyId,
      name: `Sub-${Math.random().toString(36).slice(2, 8)}`,
    },
  });
  return prisma.subcontractorWorkOrder.create({
    data: {
      companyId,
      projectId,
      subcontractorId: sub.id,
      workOrderNumber: `WO-${Math.random().toString(36).slice(2, 10)}`,
      workTitle: "Test electrical work",
      status: "ACTIVE",
      advanceAmount: new Decimal(advanceAmount),
      advanceRecoveryPct: new Decimal(20),
    },
  });
}

describe("completeWorkOrder — unrecovered advance guard", () => {
  let company: Awaited<ReturnType<typeof createTestFixture>>["company"];
  let project: Awaited<ReturnType<typeof createTestFixture>>["project"];
  let user: Awaited<ReturnType<typeof createTestFixture>>["user"];

  beforeEach(async () => {
    await resetDb();
    const fixture = await createTestFixture();
    company = fixture.company;
    project = fixture.project;
    user = fixture.user;
    await seedTestAccounts(company.id);
  });

  it("blocks completion while an advance is unrecovered", async () => {
    const wo = await createWoWithAdvance(company.id, project.id, 150000);
    await expect(completeWorkOrder(wo.id, user.id)).rejects.toThrow(/unrecovered/);
    const after = await prisma.subcontractorWorkOrder.findUnique({ where: { id: wo.id } });
    expect(after?.status).toBe("ACTIVE");
  });

  it("completes and posts the write-off when forgiven with a reason", async () => {
    const wo = await createWoWithAdvance(company.id, project.id, 150000);
    const completed = await completeWorkOrder(wo.id, user.id, { reason: "Contractor terminated" });
    expect(completed.status).toBe("COMPLETED");

    const after = await prisma.subcontractorWorkOrder.findUnique({ where: { id: wo.id } });
    expect(new Decimal(after!.advanceWrittenOff).toString()).toBe("150000");

    const je = await prisma.journalEntry.findFirst({
      where: { sourceType: "ADVANCE_WRITE_OFF", sourceId: wo.id },
      include: { lines: true },
    });
    expect(je).not.toBeNull();
    const debits = je!.lines.reduce((s, l) => s.plus(l.debit), new Decimal(0));
    expect(debits.toString()).toBe("150000");
  });

  it("completes a WO with no advance normally", async () => {
    const wo = await createWoWithAdvance(company.id, project.id, 0);
    const completed = await completeWorkOrder(wo.id, user.id);
    expect(completed.status).toBe("COMPLETED");
    expect(new Decimal(completed.advanceWrittenOff).toString()).toBe("0");
  });

  it("blocks completion while an approved MB entry is unbilled", async () => {
    const wo = await createWoWithAdvance(company.id, project.id, 0);
    const boqItem = await prisma.boqItem.create({
      data: { projectId: project.id, serialNo: "1", description: "Conduit laying" },
    });
    await prisma.subcontractorWorkOrderLine.create({
      data: {
        workOrderId: wo.id,
        boqItemId: boqItem.id,
        agreedRate: new Decimal(100),
      },
    });
    await prisma.measurementBookEntry.create({
      data: {
        projectId: project.id,
        boqItemId: boqItem.id,
        mbNumber: `MB-${Math.random().toString(36).slice(2, 10)}`,
        measuredQty: new Decimal(10),
        cumulativeQty: new Decimal(10),
        description: "Measured run",
        status: "APPROVED",
        raBillLineId: null,
      },
    });
    await expect(completeWorkOrder(wo.id, user.id)).rejects.toThrow(/never billed/);
    const after = await prisma.subcontractorWorkOrder.findUnique({ where: { id: wo.id } });
    expect(after?.status).toBe("ACTIVE");
  });
});
