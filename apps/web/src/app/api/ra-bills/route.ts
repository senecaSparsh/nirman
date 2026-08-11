import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { createRaBill } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

const schema = z.object({
  workOrderId: z.string().min(1),
  periodFrom: z.string().datetime(),
  periodTo: z.string().datetime(),
  mbEntryIds: z.array(z.string()).optional(),
  otherDeductions: z.coerce.number().optional(),
  notes: z.string().optional().nullable(),
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.ASSETS_MANAGE);
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 });
  try {
    const d = parsed.data;
    const bill = await createRaBill({
      workOrderId: d.workOrderId,
      periodFrom: new Date(d.periodFrom),
      periodTo: new Date(d.periodTo),
      mbEntryIds: d.mbEntryIds,
      otherDeductions: d.otherDeductions,
      notes: d.notes ?? undefined,
      userId: user.id,
    });
    return json(bill, { status: 201 });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
});

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.ASSETS_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const workOrderId = searchParams.get("workOrderId");
  const status = searchParams.get("status");
  const preview = searchParams.get("preview");

  // Preview mode: return available unbilled MB entries for a work order
  if (preview === "unbilled" && workOrderId) {
    const wo = await prisma.subcontractorWorkOrder.findFirst({
      where: { id: workOrderId, companyId: company.id },
      include: {
        lines: {
          include: {
            boqItem: { select: { id: true, serialNo: true, description: true, unit: true, estimatedQty: true } },
          },
        },
        raBills: {
          where: { status: { in: ["DRAFT", "SUBMITTED", "APPROVED", "PAID"] } },
          select: { id: true, grossAmount: true, netPayable: true, status: true, raBillNumber: true },
          orderBy: { billDate: "desc" },
        },
      },
    }) as any;
    if (!wo) return json({ error: "Work order not found" }, { status: 404 });

    // Fetch unbilled approved MB entries for all BOQ items in this WO
    const boqItemIds = wo.lines.map((l: any) => l.boqItem.id);
    const unbilledEntries = await prisma.measurementBookEntry.findMany({
      where: {
        boqItemId: { in: boqItemIds },
        status: "APPROVED",
        raBillLineId: null,
      },
      orderBy: { measureDate: "asc" },
      select: { id: true, mbNumber: true, measuredQty: true, measureDate: true, description: true, boqItemId: true },
    });

    // Group by BOQ item
    const entriesByBoq = new Map<string, typeof unbilledEntries>();
    for (const e of unbilledEntries) {
      const arr = entriesByBoq.get(e.boqItemId) ?? [];
      arr.push(e);
      entriesByBoq.set(e.boqItemId, arr);
    }

    const linesWithEntries = wo.lines.map((l: any) => ({
      boqItemId: l.boqItem.id,
      serialNo: l.boqItem.serialNo,
      description: l.boqItem.description,
      unit: l.boqItem.unit,
      estimatedQty: toNum(l.boqItem.estimatedQty),
      agreedRate: toNum(l.agreedRate),
      cumulativeQty: toNum(l.cumulativeQty),
      unbilledEntries: (entriesByBoq.get(l.boqItem.id) ?? []).map((e: any) => ({
        id: e.id,
        mbNumber: e.mbNumber,
        measuredQty: toNum(e.measuredQty),
        measureDate: e.measureDate.toISOString(),
        description: e.description,
      })),
    }));

    const totalUnbilledQty = linesWithEntries.reduce(
      (sum: number, l: any) => sum + l.unbilledEntries.reduce((s: number, e: any) => s + e.measuredQty, 0),
      0,
    );
    const estimatedGross = linesWithEntries.reduce(
      (sum: number, l: any) => sum + l.unbilledEntries.reduce((s: number, e: any) => s + e.measuredQty * l.agreedRate, 0),
      0,
    );

    return json({
      workOrderNumber: wo.workOrderNumber,
      retentionPct: toNum(wo.retentionPct),
      tdsPct: toNum(wo.tdsPct),
      advanceAmount: toNum(wo.advanceAmount),
      advanceRecoveryPct: toNum(wo.advanceRecoveryPct),
      totalPaid: toNum(wo.totalPaid),
      lines: linesWithEntries,
      previousBills: wo.raBills.map((b: any) => ({
        id: b.id,
        raBillNumber: b.raBillNumber,
        grossAmount: toNum(b.grossAmount),
        netPayable: toNum(b.netPayable),
        status: b.status,
      })),
      summary: {
        totalUnbilledQty,
        estimatedGross,
        estimatedRetention: estimatedGross * toNum(wo.retentionPct) / 100,
        estimatedTds: estimatedGross * toNum(wo.tdsPct) / 100,
        estimatedAdvanceRecovery: wo.advanceAmount.gt(0)
          ? Math.min(estimatedGross * toNum(wo.advanceRecoveryPct) / 100, Math.max(toNum(wo.advanceAmount) - toNum(wo.totalPaid), 0))
          : 0,
      },
    });
  }

  const bills = await prisma.raBill.findMany({
    where: {
      companyId: company.id,
      ...(workOrderId ? { workOrderId } : {}),
      ...(status ? { status: status as any } : {}),
    },
    orderBy: { billDate: "desc" },
    include: {
      workOrder: { select: { id: true, workOrderNumber: true, workTitle: true, subcontractorId: true, subcontractor: { select: { name: true } } } },
      project: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
      _count: { select: { lines: true } },
    },
  });
  return json(bills.map((b) => ({
    ...b,
    grossAmount: toNum(b.grossAmount),
    cumulativeGross: toNum(b.cumulativeGross),
    retentionAmount: toNum(b.retentionAmount),
    tdsAmount: toNum(b.tdsAmount),
    advanceRecovery: toNum(b.advanceRecovery),
    otherDeductions: toNum(b.otherDeductions),
    netPayable: toNum(b.netPayable),
  })));
});
