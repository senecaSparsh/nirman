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
