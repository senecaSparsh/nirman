/**
 * Material delete guard — a material referenced by BOQs, POs, requisitions,
 * issues, or receipts cannot be soft-deleted even with zero stock, because
 * those ledgers render the material name.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { resetDb, createTestFixture } from "./setup";

describe("material delete guard", () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function makeMaterial(fixture: Awaited<ReturnType<typeof createTestFixture>>) {
    const category = await prisma.materialCategory.create({
      data: { companyId: fixture.company.id, name: "Test Category", unit: "KG" },
    });
    return prisma.material.create({
      data: {
        companyId: fixture.company.id,
        code: "TST-001",
        name: "Test Material",
        unit: "KG",
        categoryId: category.id,
      },
    });
  }

  it("blocks deletion when a BOQ item references the material", async () => {
    const fixture = await createTestFixture();
    const material = await makeMaterial(fixture);
    await prisma.boqItem.create({
      data: {
        projectId: fixture.project.id,
        serialNo: "1",
        description: "Earthwork",
        materialId: material.id,
        unit: "CUM",
        estimatedQty: new Decimal(10),
      },
    });

    const { softDelete } = await import("../soft-delete");
    await expect(softDelete("Material", material.id)).rejects.toThrow("appears in BOQs");

    const after = await prisma.material.findUnique({ where: { id: material.id } });
    expect(after!.deletedAt).toBeNull();
  });

  it("allows deletion of an unreferenced material", async () => {
    const fixture = await createTestFixture();
    const material = await makeMaterial(fixture);

    const { softDelete } = await import("../soft-delete");
    await softDelete("Material", material.id);

    const after = await prisma.material.findUnique({ where: { id: material.id } });
    expect(after!.deletedAt).not.toBeNull();
  });
});
