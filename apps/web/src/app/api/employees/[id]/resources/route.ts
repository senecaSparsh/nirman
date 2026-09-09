import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission, assertCanManageEmployee, scopeWhere } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

/**
 * GET /api/employees/[id]/resources — list resources issued to an employee.
 * Returns both active (returnedAt = null) and returned resources.
 * Requires HR_VIEW.
 */
export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.HR_VIEW);
  const company = await getCompany();
  const { id } = await params;

  const resources = await prisma.employeeResource.findMany({
    where: { employeeId: id, companyId: company.id, ...await scopeWhere("Employee") },
    orderBy: [{ returnedAt: "desc" }, { issuedAt: "desc" }],
    include: {
      issuedByUser: { select: { id: true, name: true } },
      returnedToUser: { select: { id: true, name: true } },
    },
  });

  return json(resources);
});

const issueSchema = z.object({
  name: z.string().min(1, "Resource name is required"),
  category: z.enum(["ELECTRONICS", "VEHICLE", "TOOL", "UNIFORM", "ACCESS", "DOCUMENT", "SIM_CARD", "OTHER"]),
  assetTag: z.string().optional().nullable(),
  serialNumber: z.string().optional().nullable(),
  quantity: z.coerce.number().int().min(1).default(1),
  expectedReturnAt: z.string().optional().nullable(),
  conditionAtIssue: z.enum(["NEW", "GOOD", "FAIR", "DAMAGED"]).optional().nullable(),
  depositAmount: z.coerce.number().min(0).optional().nullable(),
  notes: z.string().optional().nullable(),
});

/**
 * POST /api/employees/[id]/resources — issue a new resource to an employee.
 * Requires HR_MANAGE + hierarchy check.
 */
export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.HR_MANAGE);
  const company = await getCompany();
  const { id } = await params;

  // Hierarchy check
  try {
    await assertCanManageEmployee(id, company.id);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Hierarchy violation" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = issueSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  // Verify employee exists in this company
  const employee = await prisma.employee.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!employee) return json({ error: "Employee not found" }, { status: 404 });

  const resource = await prisma.employeeResource.create({
    data: {
      employeeId: id,
      companyId: company.id,
      name: parsed.data.name,
      category: parsed.data.category,
      assetTag: parsed.data.assetTag || null,
      serialNumber: parsed.data.serialNumber || null,
      quantity: parsed.data.quantity,
      expectedReturnAt: parsed.data.expectedReturnAt ? new Date(parsed.data.expectedReturnAt) : null,
      conditionAtIssue: parsed.data.conditionAtIssue || null,
      depositAmount: parsed.data.depositAmount ?? null,
      notes: parsed.data.notes || null,
      issuedBy: user.id,
    },
    include: {
      issuedByUser: { select: { id: true, name: true } },
    },
  });

  revalidatePath(`/hr/employees/${id}`);
  revalidatePath(`/m/hr/employees/${id}`);

  return json(resource, { status: 201 });
});
