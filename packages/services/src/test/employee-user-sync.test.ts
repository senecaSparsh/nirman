import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { resetDb, createTestFixture } from "./setup";

describe("syncEmployeeUser — auth fields must not clobber contact fields", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("preserves employee phone/email when the login uses a different number + placeholder email", async () => {
    const { company } = await createTestFixture();

    // Employee hired with a personal contact phone — no email.
    const emp = await prisma.employee.create({
      data: {
        name: "Field Worker",
        phone: "9876500011",
        companyId: company.id,
        wageType: "DAILY",
        dailyRate: new Decimal(900),
        active: true,
      },
    });

    // Account created on a company pool phone → user holds auth credentials.
    const user = await prisma.user.create({
      data: {
        email: "phone+919096134512@nirman.internal",
        name: "Field Worker",
        phone: "+91 90961 34512",
        role: "SITE_ENGINEER",
        active: true,
      },
    });
    await prisma.userCompany.create({
      data: { userId: user.id, companyId: company.id, role: "SITE_ENGINEER", active: true },
    });
    await prisma.employee.update({ where: { id: emp.id }, data: { userId: user.id } });

    const { syncEmployeeUser } = await import("../employee-account");
    await syncEmployeeUser(emp.id, company.id);

    const after = await prisma.employee.findUniqueOrThrow({
      where: { id: emp.id },
      select: { phone: true, email: true },
    });
    expect(after.phone).toBe("9876500011"); // real contact survives
    expect(after.email).toBeNull(); // internal placeholder never lands
  });

  it("fills gaps only: empty employee email picks up a real user email, still skips the placeholder", async () => {
    const { company } = await createTestFixture();

    const emp = await prisma.employee.create({
      data: {
        name: "Office Staff",
        phone: null,
        email: null,
        companyId: company.id,
        wageType: "MONTHLY",
        monthlySalary: new Decimal(40000),
        active: true,
      },
    });
    const user = await prisma.user.create({
      data: {
        email: "staff@realco.com",
        name: "Office Staff",
        phone: "+91 98220 00001",
        role: "ACCOUNTANT",
        active: true,
      },
    });
    await prisma.userCompany.create({
      data: { userId: user.id, companyId: company.id, role: "ACCOUNTANT", active: true },
    });
    await prisma.employee.update({ where: { id: emp.id }, data: { userId: user.id } });

    const { syncEmployeeUser } = await import("../employee-account");
    await syncEmployeeUser(emp.id, company.id);

    const after = await prisma.employee.findUniqueOrThrow({
      where: { id: emp.id },
      select: { phone: true, email: true },
    });
    expect(after.phone).toBe("+91 98220 00001"); // gap filled from user
    expect(after.email).toBe("staff@realco.com"); // real email fills the gap
  });
});
