import { describe, it, expect } from "vitest";
import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { projectPnl, projectPnlBatch, projectTotalCost, projectRevenue } from "../valuation";

const num = (x: unknown) => Number(x);

describe("projectPnlBatch + raw-SQL cost functions", () => {
  it("batch matches projectPnl per project", async () => {
    const projs = await prisma.project.findMany({ take: 3, select: { id: true } });
    const ids = projs.map((p) => p.id);
    if (ids.length === 0) return;

    const batch = await projectPnlBatch(ids);
    for (const id of ids) {
      const single = await projectPnl(id);
      const b = batch.get(id);
      expect(b, `batch missing project ${id}`).toBeTruthy();
      for (const k of ["revenue", "total", "profit", "margin", "materials", "labour", "land", "costRecovery"] as const) {
        expect(num(b![k]), `${id} ${k}`).toBeCloseTo(num(single[k]), 6);
      }
    }
  });

  it("projectTotalCost + projectRevenue raw SQL matches row-by-row computation", async () => {
    const proj = await prisma.project.findFirst({ select: { id: true } });
    if (!proj) return;

    const [raw, rawRev] = await Promise.all([
      projectTotalCost(proj.id),
      projectRevenue(proj.id),
    ]);

    // Independent baseline: hydrate the rows and reduce in JS (the pre-raw impl)
    const [il, pc, lp, sgl, sales] = await Promise.all([
      prisma.materialIssueLine.findMany({
        where: { materialIssue: { projectId: proj.id } },
        select: { qty: true, unitCost: true },
      }),
      prisma.projectCost.findMany({ where: { projectId: proj.id }, select: { amount: true } }),
      prisma.landPurchase.findMany({ where: { projectId: proj.id, deletedAt: null }, select: { totalCost: true } }),
      prisma.scrapGenerationLine.findMany({
        where: { scrapGeneration: { projectId: proj.id } },
        select: { qty: true, unitCost: true },
      }),
      prisma.assetSale.findMany({ where: { projectId: proj.id }, select: { salePrice: true } }),
    ]);
    const mul = (a: unknown, b: unknown) => new Decimal(num(a)).times(new Decimal(num(b)));
    const manual = {
      materials: il.reduce((s, l) => s.plus(mul(l.qty, l.unitCost)), new Decimal(0)),
      labour: pc.reduce((s, c) => s.plus(new Decimal(num(c.amount))), new Decimal(0)),
      land: lp.reduce((s, p) => s.plus(new Decimal(num(p.totalCost))), new Decimal(0)),
      costRecovery: sgl.reduce((s, l) => s.plus(mul(l.qty, l.unitCost)), new Decimal(0)),
      revenue: sales.reduce((s, x) => s.plus(new Decimal(num(x.salePrice))), new Decimal(0)),
    };

    expect(num(raw.materials)).toBeCloseTo(manual.materials.toNumber(), 6);
    expect(num(raw.labour)).toBeCloseTo(manual.labour.toNumber(), 6);
    expect(num(raw.land)).toBeCloseTo(manual.land.toNumber(), 6);
    expect(num(raw.costRecovery)).toBeCloseTo(manual.costRecovery.toNumber(), 6);
    expect(num(raw.total)).toBeCloseTo(
      manual.materials.plus(manual.labour).plus(manual.land).minus(manual.costRecovery).toNumber(), 6);
    expect(num(rawRev)).toBeCloseTo(manual.revenue.toNumber(), 6);
  });
});
