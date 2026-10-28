/**
 * One-fulfilment-per-indent invariant (EGM B2) — exercised against a real DB.
 *
 * The platform has THREE fulfilment paths for an approved indent:
 *   approveQuotation (comparative-quote path → auto-PO)
 *   convertRequisitionToPo (manual PO path)
 *   createDirectPurchase (off-market bill path)
 * Before the fix, each minted independently of the others → a single demand
 * could be procured twice. These tests prove the invariant end-to-end.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@nirman/db";
import { resetDb, createTestFixture, seedTestAccounts } from "./test/setup";
import { createQuotationRequest, addQuoteToRequest, approveQuotation } from "./quotation";
import { convertRequisitionToPo } from "./requisition";
import { createDirectPurchase, cancelDirectPurchase } from "./direct-purchase";

async function seedProcurement() {
  const { company, user, project, stockLocation } = await createTestFixture();
  const category = await prisma.materialCategory.create({
    data: { companyId: company.id, name: "Civil" },
  });
  const material = await prisma.material.create({
    data: { companyId: company.id, categoryId: category.id, code: "CEM-001", name: "Cement OPC 53", unit: "BAG" },
  });
  const supplierA = await prisma.supplier.create({
    data: { companyId: company.id, name: "Supplier A" },
  });
  const supplierB = await prisma.supplier.create({
    data: { companyId: company.id, name: "Supplier B" },
  });
  const approver = await prisma.user.create({
    data: { email: "approver@nirman.in", name: "Approver", role: "OWNER", companyId: company.id },
  });
  const approverUC = await prisma.userCompany.create({
    data: { userId: approver.id, companyId: company.id, role: "OWNER" },
  });
  const submitterUC = await prisma.userCompany.findFirstOrThrow({
    where: { userId: user.id, companyId: company.id },
  });
  return { company, user, project, stockLocation, material, supplierA, supplierB, approver, approverUC, submitterUC };
}

async function makeIndent(fx: Awaited<ReturnType<typeof seedProcurement>>, n: string) {
  return prisma.materialRequisition.create({
    data: {
      reqNumber: n,
      projectId: fx.project.id,
      requestedById: fx.user.id,
      status: "APPROVED",
      approvedById: fx.approver.id,
      approvedAt: new Date(),
      minQuotesRequired: 1,
      lines: { create: [{ materialId: fx.material.id, qtyRequested: 10 }] },
    },
  });
}

beforeEach(resetDb);

describe("one-fulfilment-per-indent invariant", () => {
  it("quotation-approval path claims the indent — a second conversion is refused", async () => {
    const fx = await seedProcurement();
    const req = await makeIndent(fx, "REQ-F1");

    const qr = await createQuotationRequest({
      companyId: fx.company.id,
      projectId: fx.project.id,
      title: "Cement quotes",
      minQuotesRequired: 1,
      requiredByDate: new Date("2030-01-01"),
      destinationLocationId: fx.stockLocation.id,
      submittedById: fx.user.id,
      submittedByUserCompanyId: fx.submitterUC.id,
      requisitionId: req.id,
      lines: [{ materialId: fx.material.id, qtyRequired: 10 }],
    });

    const quote = await addQuoteToRequest({
      quotationRequestId: qr.id,
      supplierId: fx.supplierA.id,
      submittedById: fx.user.id,
      validUntil: new Date("2030-01-15"),
      paymentTerms: "30 days credit",
      deliveryTerms: "Delivered to site",
      deliveryTermsType: "DELIVERED_SITE",
      leadTimeDays: 7,
      quoteSource: "EMAIL",
      sourceNote: "Email quote from Supplier A dated 01-Jan-2030",
      lines: [{ materialId: fx.material.id, qty: 10, unitPrice: 320 }],
    });

    // QR-path quotes must carry the indent link — otherwise the quote gate
    // and winner lookup in convertRequisitionToPo can't see them.
    expect(quote.requisitionId).toBe(req.id);

    const approved = await approveQuotation({
      quotationRequestId: qr.id,
      selectedQuoteId: quote.id,
      approverUserCompanyId: fx.approverUC.id,
      approverUserId: fx.approver.id,
      approverRole: "OWNER",
    });
    expect(approved.convertedPoId).toBeTruthy();

    // The indent is now CONVERTED and points at the auto-created PO —
    // the manual path must refuse to mint a second PO for the same demand.
    const after = await prisma.materialRequisition.findUniqueOrThrow({ where: { id: req.id } });
    expect(after.status).toBe("CONVERTED");
    expect(after.convertedPoId).toBe(approved.convertedPoId);

    await expect(
      convertRequisitionToPo({
        requisitionId: req.id,
        supplierId: fx.supplierA.id,
        destinationLocationId: fx.stockLocation.id,
        lineCosts: { [fx.material.id]: 320 },
        userId: fx.user.id,
      }),
    ).rejects.toThrow(/CONVERTED|already/i);
  });

  it("refuses conversion with a supplier that is not the winning quote's supplier", async () => {
    const fx = await seedProcurement();
    const req = await makeIndent(fx, "REQ-F2");
    await prisma.vendorQuote.create({
      data: {
        requisitionId: req.id,
        supplierId: fx.supplierA.id,
        submittedById: fx.user.id,
        status: "SELECTED",
        landedTotal: 3200,
        subtotal: 3200,
        gstTotal: 0,
        lines: { create: [{ materialId: fx.material.id, qty: 10, unitPrice: 320, hsnCode: "", gstRate: 0, lineTotal: 3200 }] },
      },
    });
    await expect(
      convertRequisitionToPo({
        requisitionId: req.id,
        supplierId: fx.supplierB.id,
        destinationLocationId: fx.stockLocation.id,
        lineCosts: { [fx.material.id]: 300 },
        userId: fx.user.id,
      }),
    ).rejects.toThrow(/Supplier A|re-open the comparison/);
  });

  it("refuses conversion when a direct purchase already fulfilled the indent", async () => {
    const fx = await seedProcurement();
    await seedTestAccounts(fx.company.id);
    const req = await makeIndent(fx, "REQ-F3");
    // Waive the quote gate so the DP-fulfilment guard is what fires.
    await prisma.materialRequisition.update({ where: { id: req.id }, data: { quotesWaived: true } });
    await createDirectPurchase({
      companyId: fx.company.id,
      locationId: fx.stockLocation.id,
      supplierId: fx.supplierA.id,
      supplierName: "Supplier A",
      requisitionId: req.id,
      createdById: fx.user.id,
      lines: [{ materialId: fx.material.id, qty: 10, unitCost: 320 }],
    });

    const after = await prisma.materialRequisition.findUniqueOrThrow({ where: { id: req.id } });
    expect(after.status).toBe("CONVERTED");

    await expect(
      convertRequisitionToPo({
        requisitionId: req.id,
        supplierId: fx.supplierA.id,
        destinationLocationId: fx.stockLocation.id,
        lineCosts: { [fx.material.id]: 320 },
        userId: fx.user.id,
      }),
    ).rejects.toThrow(/CONVERTED|already/i);
  });

  it("a second direct purchase on a claimed indent is refused; cancelling releases the claim", async () => {
    const fx = await seedProcurement();
    await seedTestAccounts(fx.company.id);
    const req = await makeIndent(fx, "REQ-F4");
    const first = await createDirectPurchase({
      companyId: fx.company.id,
      locationId: fx.stockLocation.id,
      supplierId: fx.supplierA.id,
      supplierName: "Supplier A",
      requisitionId: req.id,
      createdById: fx.user.id,
      lines: [{ materialId: fx.material.id, qty: 5, unitCost: 320 }],
    });

    await expect(
      createDirectPurchase({
        companyId: fx.company.id,
        locationId: fx.stockLocation.id,
        supplierId: fx.supplierA.id,
        supplierName: "Supplier A",
        requisitionId: req.id,
        createdById: fx.user.id,
        lines: [{ materialId: fx.material.id, qty: 5, unitCost: 320 }],
      }),
    ).rejects.toThrow(/already fulfilled/);

    await cancelDirectPurchase(first.purchase.id, fx.user.id);
    const after = await prisma.materialRequisition.findUniqueOrThrow({ where: { id: req.id } });
    expect(after.status).toBe("APPROVED");
  });
});
