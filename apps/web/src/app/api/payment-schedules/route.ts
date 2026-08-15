import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { generatePaymentSchedule } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

const schema = z.object({
  assetSaleId: z.string().min(1),
  type: z.enum(["CLP", "TLP", "DPP"]),
  milestones: z.array(z.object({
    wbsNodeId: z.string().optional().nullable(),
    dueDate: z.string().datetime().optional().nullable(),
    percentage: z.coerce.number().min(0).max(100),
    description: z.string().min(1),
  })).min(1),
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.SALE_CREATE);
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 });
  try {
    const d = parsed.data;
    const schedule = await generatePaymentSchedule({
      assetSaleId: d.assetSaleId,
      type: d.type,
      milestones: d.milestones.map((m) => ({
        wbsNodeId: m.wbsNodeId ?? undefined,
        dueDate: m.dueDate ? new Date(m.dueDate) : undefined,
        percentage: m.percentage,
        description: m.description,
      })),
      userId: user.id,
    });
    return json(schedule, { status: 201 });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
});

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.SALES_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const assetSaleId = searchParams.get("assetSaleId");
  if (!assetSaleId) return json({ error: "assetSaleId is required" }, { status: 400 });

  // Verify the sale belongs to the user's company before returning schedule
  const sale = await prisma.assetSale.findFirst({
    where: { id: assetSaleId, companyId: company.id },
    select: { id: true },
  });
  if (!sale) return json({ error: "No payment schedule found" }, { status: 404 });

  const schedule = await prisma.paymentSchedule.findUnique({
    where: { assetSaleId },
    include: {
      items: {
        orderBy: { installmentNo: "asc" },
        include: { wbsNode: { select: { id: true, code: true, name: true, progressPct: true } } },
      },
    },
  });
  if (!schedule) return json({ error: "No payment schedule found" }, { status: 404 });
  return json({
    ...schedule,
    totalAmount: toNum(schedule.totalAmount),
    gstAmount: toNum(schedule.gstAmount),
    grandTotal: toNum(schedule.grandTotal),
    items: schedule.items.map((i) => ({
      ...i,
      percentage: toNum(i.percentage),
      gstPercentage: toNum(i.gstPercentage),
      gstAmount: toNum(i.gstAmount),
      amount: toNum(i.amount),
      totalAmount: toNum(i.totalAmount),
      paidAmount: toNum(i.paidAmount),
    })),
  });
});
