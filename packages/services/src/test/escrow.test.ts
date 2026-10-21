/**
 * RERA escrow (S.4(2)(l)(D)) — receipts on a designated project land in
 * 1060, certified withdrawals move it to 1000, and the ledger guard
 * refuses a withdrawal bigger than the balance.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { resetDb, createTestFixture, seedTestAccounts } from "./setup";
import { recordEscrowWithdrawal, voidEscrowWithdrawal, projectEscrowLedgerBalance } from "../escrow";
import { postDepositReceived, ACCT } from "../gl-posting";

describe("Escrow — designated-account ledgering + certified withdrawals", () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function setup(escrow: boolean) {
    const fixture = await createTestFixture();
    await seedTestAccounts(fixture.company.id);
    const project = await prisma.project.update({
      where: { id: fixture.project.id },
      data: escrow ? { escrowAccountNo: "ESCROW123456" } : {},
    });
    const customer = await prisma.customer.create({
      data: { companyId: fixture.company.id, name: "Test Buyer", phone: "9999999999" },
    });
    const sale = await prisma.assetSale.create({
      data: {
        companyId: fixture.company.id,
        customerId: customer.id,
        assetType: "BUILT_UNIT",
        projectId: project.id,
        saleNumber: `SAL-TEST-${escrow ? "E" : "N"}`,
        salePrice: new Decimal(100000),
        gstAmount: new Decimal(0),
        tdsAmount: new Decimal(0),
        costBasis: new Decimal(50000),
        status: "ACTIVE",
        saleStage: "PENDING",
      },
    });
    return { fixture, project, sale };
  }

  it("routes a deposit to 1060 when the project has a designated escrow account", async () => {
    const { fixture, sale } = await setup(true);
    await prisma.$transaction(async (tx) => {
      await postDepositReceived(tx, { companyId: fixture.company.id, assetSaleId: sale.id, amount: new Decimal(40000) });
    });
    const lines = await prisma.journalLine.findMany({ include: { account: { select: { code: true } } } });
    const cash = lines.find((l) => l.debit.gt(0))!;
    expect(cash.account.code).toBe("1060");
    // and the project-scoped ledger reads it back
    const bal = await prisma.$transaction((tx) => projectEscrowLedgerBalance(tx, fixture.company.id, fixture.project.id));
    expect(bal.toNumber()).toBe(40000);
  });

  it("uses 1000 when the project has no designated account", async () => {
    const { fixture, sale } = await setup(false);
    await prisma.$transaction(async (tx) => {
      await postDepositReceived(tx, { companyId: fixture.company.id, assetSaleId: sale.id, amount: new Decimal(40000) });
    });
    const lines = await prisma.journalLine.findMany({ include: { account: { select: { code: true } } } });
    expect(lines.find((l) => l.debit.gt(0))!.account.code).toBe("1000");
  });

  it("posts a certified withdrawal Dr 1000 / Cr 1060 and drops the ledger balance", async () => {
    const { fixture, sale } = await setup(true);
    await prisma.$transaction(async (tx) => {
      await postDepositReceived(tx, { companyId: fixture.company.id, assetSaleId: sale.id, amount: new Decimal(40000) });
    });
    const w = await recordEscrowWithdrawal({
      companyId: fixture.company.id,
      projectId: fixture.project.id, amount: 25000,
      purpose: "certified cost", engineerName: "E", architectName: "A", caName: "C",
    });
    expect(w.withdrawalNo).toBe(1);
    const lines = await prisma.journalLine.findMany({ where: { entityId: w.id }, include: { account: { select: { code: true } } } });
    expect(lines.find((l) => l.debit.gt(0))!.account.code).toBe("1000");
    expect(lines.find((l) => l.credit.gt(0))!.account.code).toBe("1060");
    const bal = await prisma.$transaction((tx) => projectEscrowLedgerBalance(tx, fixture.company.id, fixture.project.id));
    expect(bal.toNumber()).toBe(15000);
  });

  it("refuses a withdrawal bigger than the ledgered escrow", async () => {
    const { fixture, sale } = await setup(true);
    await prisma.$transaction(async (tx) => {
      await postDepositReceived(tx, { companyId: fixture.company.id, assetSaleId: sale.id, amount: new Decimal(10000) });
    });
    await expect(recordEscrowWithdrawal({
      companyId: fixture.company.id,
      projectId: fixture.project.id, amount: 10001,
      purpose: "x", engineerName: "E", architectName: "A", caName: "C",
    })).rejects.toThrow("exceeds");
  });

  it("refuses a withdrawal when no escrow account is designated", async () => {
    const { fixture } = await setup(false);
    await expect(recordEscrowWithdrawal({
      companyId: fixture.company.id,
      projectId: fixture.project.id, amount: 1000,
      purpose: "x", engineerName: "E", architectName: "A", caName: "C",
    })).rejects.toThrow("designated escrow");
  });

  it("voiding a withdrawal restores the escrow balance", async () => {
    const { fixture, sale } = await setup(true);
    await prisma.$transaction(async (tx) => {
      await postDepositReceived(tx, { companyId: fixture.company.id, assetSaleId: sale.id, amount: new Decimal(40000) });
    });
    const w = await recordEscrowWithdrawal({
      companyId: fixture.company.id,
      projectId: fixture.project.id, amount: 40000,
      purpose: "certified cost", engineerName: "E", architectName: "A", caName: "C",
    });
    await voidEscrowWithdrawal({ withdrawalId: w.id, voidReason: "entered twice", companyId: fixture.company.id });
    const bal = await prisma.$transaction((tx) => projectEscrowLedgerBalance(tx, fixture.company.id, fixture.project.id));
    expect(bal.toNumber()).toBe(40000);
  });

  it("rejects a withdrawal attempted with a different companyId (tenant guard)", async () => {
    const { fixture, sale } = await setup(true);
    await prisma.$transaction(async (tx) => {
      await postDepositReceived(tx, { companyId: fixture.company.id, assetSaleId: sale.id, amount: new Decimal(40000) });
    });
    const other = await prisma.company.create({ data: { name: `Other-${Date.now()}` } });
    await expect(recordEscrowWithdrawal({
      companyId: other.id,
      projectId: fixture.project.id, amount: 1000,
      purpose: "x", engineerName: "E", architectName: "A", caName: "C",
    })).rejects.toThrow("not found");
  });
});
