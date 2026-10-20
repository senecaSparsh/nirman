import { NextRequest } from "next/server";
import { settleEmployeeExit } from "@nirman/services";
import { prisma } from "@nirman/db";
import { apiHandler, json, requirePermission, getCompany } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

const schema = z.object({
  amount: z.coerce.number().positive("Settlement amount must be positive"),
});

export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.HR_MANAGE);
  const { id } = await params;
  const company = await getCompany();

  const employee = await prisma.employee.findFirst({
    where: { id, companyId: company.id },
    select: { id: true },
  });
  if (!employee) return json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 });
  try {
    const result = await settleEmployeeExit({
      employeeId: id,
      companyId: company.id,
      amount: parsed.data.amount,
      actorUserId: user.id,
    });
    return json(result);
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
});
