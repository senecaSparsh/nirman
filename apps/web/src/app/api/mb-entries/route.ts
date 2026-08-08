import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { createMbEntry } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

const schema = z.object({
  projectId: z.string().min(1),
  phaseId: z.string().optional().nullable(),
  boqItemId: z.string().min(1),
  wbsNodeId: z.string().optional().nullable(),
  measuredQty: z.coerce.number().min(0.001),
  description: z.string().min(1),
  locationRef: z.string().optional().nullable(),
  measureDate: z.string().datetime().optional(),
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.STOCK_ISSUE);
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 });
  try {
    const d = parsed.data;
    const entry = await createMbEntry({
      projectId: d.projectId,
      phaseId: d.phaseId ?? undefined,
      boqItemId: d.boqItemId,
      wbsNodeId: d.wbsNodeId ?? undefined,
      measuredQty: d.measuredQty,
      description: d.description,
      locationRef: d.locationRef ?? undefined,
      measureDate: d.measureDate ? new Date(d.measureDate) : undefined,
      measuredById: user.id,
    });
    return json(entry, { status: 201 });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
});

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.ASSETS_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const boqItemId = searchParams.get("boqItemId");
  const status = searchParams.get("status");

  const entries = await prisma.measurementBookEntry.findMany({
    where: {
      project: { companyId: company.id },
      ...(projectId ? { projectId } : {}),
      ...(boqItemId ? { boqItemId } : {}),
      ...(status ? { status: status as any } : {}),
    },
    orderBy: { measureDate: "desc" },
    include: {
      boqItem: { select: { id: true, serialNo: true, description: true, unit: true, rate: true } },
      wbsNode: { select: { id: true, code: true, name: true } },
      measuredBy: { select: { id: true, name: true } },
      verifiedBy: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
    },
  });
  return json(entries.map((e) => ({
    ...e,
    measureDate: e.measureDate.toISOString(),
    measuredQty: toNum(e.measuredQty),
    cumulativeQty: toNum(e.cumulativeQty),
    boqItem: e.boqItem
      ? { ...e.boqItem, rate: e.boqItem.rate != null ? toNum(e.boqItem.rate) : null }
      : null,
  })));
});
