/**
 * Statutory identity validation + ghost-worker dedupe.
 *
 * - Bad PAN/Aadhaar/UAN formats must not save (they corrupt filings).
 * - The same PAN/Aadhaar/etc. on two active employees in one company is
 *   blocked — it's either a data error or a ghost-worker fraud attempt.
 * - Values normalize before save (PAN uppercase, Aadhaar stripped of spaces).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { resetDb, createTestFixture } from "./setup";

describe("gov ID validation + dedupe", () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function mkEmployee(companyId: string, phone: string, extra: Record<string, unknown> = {}) {
    return prisma.employee.create({
      data: {
        name: "Worker " + phone.slice(-4),
        phone,
        companyId,
        wageType: "DAILY",
        dailyRate: new Decimal(500),
        active: true,
        ...extra,
      },
    });
  }

  it("rejects a malformed PAN on dossier update", async () => {
    const { company, user } = await createTestFixture();
    const emp = await mkEmployee(company.id, "9000000001");
    const { updateEmployeeDossier } = await import("../employee-dossier");
    await expect(
      updateEmployeeDossier(emp.id, company.id, user.id, { panNumber: "NOTAPAN" }),
    ).rejects.toThrow(/PAN must be 10/);
    const after = await prisma.employee.findUnique({ where: { id: emp.id } });
    expect(after!.panNumber).toBeNull();
  });

  it("rejects a malformed Aadhaar and normalizes a valid one", async () => {
    const { company, user } = await createTestFixture();
    const emp = await mkEmployee(company.id, "9000000002");
    const { updateEmployeeDossier } = await import("../employee-dossier");
    await expect(
      updateEmployeeDossier(emp.id, company.id, user.id, { aadhaarNumber: "12345" }),
    ).rejects.toThrow(/12 digits/);
    await updateEmployeeDossier(emp.id, company.id, user.id, { aadhaarNumber: "1234 5678 9012" });
    const after = await prisma.employee.findUnique({ where: { id: emp.id } });
    expect(after!.aadhaarNumber).toBe("123456789012");
  });

  it("rejects a duplicate PAN on a second employee (ghost-worker guard)", async () => {
    const { company, user } = await createTestFixture();
    const a = await mkEmployee(company.id, "9000000003", { panNumber: "ABCDE1234F" });
    const b = await mkEmployee(company.id, "9000000004");
    const { updateEmployeeDossier } = await import("../employee-dossier");
    await expect(
      updateEmployeeDossier(b.id, company.id, user.id, { panNumber: "abcde1234f" }), // lowercase normalizes to the dup
    ).rejects.toThrow(/already on/);
    const afterB = await prisma.employee.findUnique({ where: { id: b.id } });
    expect(afterB!.panNumber).toBeNull();
    void a;
  });

  it("duplicate check also applies at create-time", async () => {
    const { company, user } = await createTestFixture();
    await mkEmployee(company.id, "9000000005", { aadhaarNumber: "123456789012" });
    const { createEmployee } = await import("../hr");
    await expect(
      createEmployee({
        companyId: company.id,
        name: "Ghost Worker",
        phone: "9000000006",
        wageType: "DAILY",
        dailyRate: 500,
        userId: user.id,
        aadhaarNumber: "1234-5678-9012", // same 12 digits, masked format
      }),
    ).rejects.toThrow(/already on/);
  });

  it("an employee can keep their own PAN on update (self-exclusion)", async () => {
    const { company, user } = await createTestFixture();
    const emp = await mkEmployee(company.id, "9000000007", { panNumber: "ABCDE1234F" });
    const { updateEmployeeDossier } = await import("../employee-dossier");
    // Same value on the same record — must not trip the dedupe.
    await updateEmployeeDossier(emp.id, company.id, user.id, { panNumber: "ABCDE1234F" });
    const after = await prisma.employee.findUnique({ where: { id: emp.id } });
    expect(after!.panNumber).toBe("ABCDE1234F");
  });
});
