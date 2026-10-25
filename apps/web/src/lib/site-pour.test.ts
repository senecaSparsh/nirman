import { describe, it, expect } from "vitest";
import { deriveSitePour, forecastFinish, summarizeDemands } from "./site-pour";

const boq = (id: string, qty = 100, amount = 10000) => ({
  id,
  estimatedQty: qty,
  rate: amount / qty,
  estimatedAmount: amount,
});

const wbs = (over: Partial<{ boqItemId: string | null; progressPct: number; type: string }> = {}) => ({
  type: "ACTIVITY",
  boqItemId: null,
  progressPct: 0,
  plannedStart: "2026-01-01",
  plannedEnd: "2026-01-11",
  ...over,
});

const mb = (boqItemId: string, measuredQty: number, status = "APPROVED") => ({
  boqItemId,
  measuredQty,
  status,
});

describe("deriveSitePour", () => {
  it("returns null when nothing has happened", () => {
    expect(
      deriveSitePour({ boqItems: [], wbsNodes: [], mbEntries: [], dprs: [], cementQty: 0 }),
    ).toBeNull();
  });

  it("shows the figure at 0% when data exists but no progress yet", () => {
    const d = deriveSitePour({
      boqItems: [boq("a")], wbsNodes: [wbs()], mbEntries: [], dprs: [], cementQty: 0,
    });
    expect(d).toMatchObject({ progress: 0, source: "wbs" });
  });

  it("blends certified items at certified % with reported elsewhere", () => {
    // Item A: certified 50/100 = 50%. Item B: uncertified, falls to reported 80%.
    const d = deriveSitePour({
      boqItems: [boq("a"), boq("b")],
      wbsNodes: [wbs({ progressPct: 80 })],
      mbEntries: [mb("a", 50)],
      dprs: [],
      cementQty: 0,
    });
    // Equal weights → (50 + 80) / 2 = 65%
    expect(d!.progress).toBeCloseTo(0.65);
    expect(d!.source).toBe("mb");
    expect(d!.certifiedShare).toBeCloseTo(0.5);
  });

  it("uses an item's own linked WBS activity before the project average", () => {
    const d = deriveSitePour({
      boqItems: [boq("a"), boq("b")],
      wbsNodes: [
        wbs({ boqItemId: "b", progressPct: 90 }),
        wbs({ progressPct: 10 }),
      ],
      mbEntries: [],
      dprs: [],
      cementQty: 0,
    });
    // a has no linked activity → project leaf average (90+10)/2 = 50
    // b is linked to the 90% activity → 90. Equal weights → (50 + 90) / 2 = 70%
    expect(d!.progress).toBeCloseTo(0.7);
    expect(d!.source).toBe("wbs");
  });

  it("falls back to the latest DPR when no BOQ/WBS exists", () => {
    const d = deriveSitePour({
      boqItems: [],
      wbsNodes: [],
      mbEntries: [],
      dprs: [
        { date: "2026-10-01", progressPct: 22 },
        { date: "2026-10-20", progressPct: 44 },
      ],
      cementQty: 0,
    });
    expect(d).toMatchObject({ progress: 0.44, source: "dpr" });
  });

  it("only APPROVED measurement is certified — DRAFT and VERIFIED are not billable yet", () => {
    const d = deriveSitePour({
      boqItems: [boq("a")],
      wbsNodes: [wbs({ progressPct: 60 })],
      mbEntries: [mb("a", 90, "DRAFT"), mb("a", 90, "VERIFIED")],
      dprs: [],
      cementQty: 0,
    });
    expect(d!.progress).toBeCloseTo(0.6);
    expect(d!.source).toBe("wbs");
    expect(d!.certifiedShare).toBe(0);
  });

  it("sums successive approved measurements, like the WBS auto-progress does", () => {
    const d = deriveSitePour({
      boqItems: [boq("a")],
      wbsNodes: [],
      mbEntries: [mb("a", 30), mb("a", 25)],
      dprs: [],
      cementQty: 0,
    });
    expect(d!.progress).toBeCloseTo(0.55);
  });

  it("caps a certified item at 100% — over-measurement can't inflate the pour", () => {
    const d = deriveSitePour({
      boqItems: [boq("a")],
      wbsNodes: [],
      mbEntries: [mb("a", 150, "APPROVED")],
      dprs: [],
      cementQty: 0,
    });
    expect(d!.progress).toBe(1);
  });

  it("surfaces even with no progress signals when cement has been issued", () => {
    const d = deriveSitePour({
      boqItems: [], wbsNodes: [], mbEntries: [], dprs: [], cementQty: 42,
    });
    expect(d).toMatchObject({ bagsUsed: 42, progress: 0 });
  });
});

describe("forecastFinish", () => {
  const today = new Date("2026-10-25T00:00:00Z");

  it("projects the finish from the last 30 days' pace and reports days late", () => {
    // 40% → 50% over 20 days = 0.5%/day; 50% left at that pace = 100 days.
    const s = forecastFinish({
      progress: 0.5,
      history: [
        { date: "2026-10-01", progressPct: 40 },
        { date: "2026-10-21", progressPct: 50 },
      ],
      plannedStart: "2026-01-01",
      plannedEnd: "2026-12-31",
      today,
    });
    expect(s.forecastEnd!.slice(0, 10)).toBe("2027-02-02");
    expect(s.daysLate).toBe(33);
  });

  it("gives the plan-by-today line from start and end dates", () => {
    const s = forecastFinish({
      progress: 0.3,
      history: [],
      plannedStart: "2026-10-01",
      plannedEnd: "2026-11-20",
      today,
    });
    expect(s.plannedProgress).toBeCloseTo(24 / 50);
    expect(s.forecastEnd).toBeNull();
  });

  it("does not forecast from a stalled or falling pace", () => {
    const s = forecastFinish({
      progress: 0.4,
      history: [
        { date: "2026-10-01", progressPct: 45 },
        { date: "2026-10-20", progressPct: 40 },
      ],
      plannedStart: null,
      plannedEnd: null,
      today,
    });
    expect(s.forecastEnd).toBeNull();
    expect(s.daysLate).toBeNull();
  });
});

describe("summarizeDemands", () => {
  const item = (over: Partial<Parameters<typeof summarizeDemands>[0][number]>) => ({
    status: "PENDING",
    totalAmount: 100000,
    paidAmount: 0,
    assetSaleId: "s1",
    wbsNodeId: "slab-1",
    milestone: "First slab",
    milestoneProgress: 80,
    ...over,
  });

  it("picks the pending milestone closest to completion and totals its buyers", () => {
    const d = summarizeDemands([
      item({ assetSaleId: "s1" }),
      item({ assetSaleId: "s2" }),
      item({ wbsNodeId: "slab-4", milestone: "Fourth slab", milestoneProgress: 10, assetSaleId: "s1" }),
    ]);
    expect(d.next).toEqual({ milestone: "First slab", progressPct: 80, amount: 200000, buyers: 2 });
  });

  it("totals only the unpaid part of installments already demanded", () => {
    const d = summarizeDemands([
      item({ status: "DUE", assetSaleId: "s1" }),
      item({ status: "PARTIAL", paidAmount: 40000, assetSaleId: "s2" }),
    ]);
    expect(d.awaiting).toEqual({ amount: 160000, buyers: 2 });
    expect(d.next).toBeNull();
  });
});
