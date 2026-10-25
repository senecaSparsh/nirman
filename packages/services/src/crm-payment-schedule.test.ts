import { describe, it, expect, vi, beforeEach } from "vitest";
import Decimal from "decimal.js";

vi.mock("@nirman/db", () => ({
  prisma: { assetSale: { findUnique: vi.fn() } },
}));
vi.mock("./sale", () => ({
  createSalePaymentSchedule: vi.fn().mockResolvedValue({ ok: true }),
  syncPaymentScheduleFromPayments: vi.fn(),
}));
vi.mock("./transaction", () => ({ withSerializableTransaction: vi.fn() }));
vi.mock("./audit", () => ({ logAction: vi.fn() }));
vi.mock("./gl-posting", () => ({}));
vi.mock("./notifications", () => ({ sendNotification: vi.fn() }));

import { prisma } from "@nirman/db";
import { createSalePaymentSchedule } from "./sale";
import { generatePaymentSchedule } from "./crm";

const sale = (over: Partial<{ salePrice: number; gstAmount: number; tdsAmount: number | null; status: string }>) =>
  vi.mocked(prisma.assetSale.findUnique).mockResolvedValue({
    salePrice: new Decimal(5_000_000),
    gstAmount: new Decimal(0),
    tdsAmount: new Decimal(50_000),
    projectId: "p1",
    status: "ACTIVE",
    saleStage: "PENDING",
    ...over,
  } as never);

describe("generatePaymentSchedule — amounts the buyer actually owes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("splits price + GST less the 194-IA TDS the buyer withholds", async () => {
    sale({});
    await generatePaymentSchedule({
      assetSaleId: "s1",
      type: "CLP",
      milestones: [
        { wbsNodeId: "slab-1", percentage: 40, description: "First slab" },
        { percentage: 60, description: "Completion" },
      ],
    });
    const [, payload] = vi.mocked(createSalePaymentSchedule).mock.calls[0]!;
    const items = (payload as { items: { amount: Decimal; wbsNodeId: string | null }[] }).items;
    expect(items.map((i) => i.amount.toNumber())).toEqual([1_980_000, 2_970_000]);
    expect(items.reduce((s, i) => s + i.amount.toNumber(), 0)).toBe(4_950_000);
    expect(items[0]!.wbsNodeId).toBe("slab-1");
  });

  it("includes GST and nets TDS on a GST-bearing sale", async () => {
    sale({ gstAmount: 100_000, tdsAmount: 50_000 });
    await generatePaymentSchedule({
      assetSaleId: "s1",
      type: "TLP",
      milestones: [{ percentage: 100, description: "Full" }],
    });
    const [, payload] = vi.mocked(createSalePaymentSchedule).mock.calls[0]!;
    const items = (payload as { items: { amount: Decimal }[] }).items;
    expect(items[0]!.amount.toNumber()).toBe(5_050_000);
  });

  it("falls back to price + GST when no TDS has been recorded yet", async () => {
    sale({ tdsAmount: null });
    await generatePaymentSchedule({
      assetSaleId: "s1",
      type: "TLP",
      milestones: [{ percentage: 100, description: "Full" }],
    });
    const [, payload] = vi.mocked(createSalePaymentSchedule).mock.calls[0]!;
    const items = (payload as { items: { amount: Decimal }[] }).items;
    expect(items[0]!.amount.toNumber()).toBe(5_000_000);
  });
});
