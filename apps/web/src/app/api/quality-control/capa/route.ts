import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { createCapa, getCapa } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission, scopeWhere } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

const createSchema = z.object({
  ncrId: z.string().min(1),
  rootCause: z.string().min(1),
  correctiveAction: z.string().min(1),
  correctiveDueDate: z.string().optional().nullable(),
  preventiveAction: z.string().min(1),
  preventiveDueDate: z.string().optional().nullable(),
});

// GET /api/quality-control/capa?ncrId=xxx
export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.QC_VIEW);
  const company = await getCompany();
  const ncrId = req.nextUrl.searchParams.get("ncrId");
  if (!ncrId) return json({ error: "ncrId is required" }, { status: 400 });
  // The CAPA + its NCR must belong to the caller's company and scope —
  // previously getCapa ran by bare ncrId and returned another tenant's
  // CAPA including the linked NCR title and employee names.
  const ncr = await prisma.nonConformanceReport.findFirst({
    where: { id: ncrId, companyId: company.id, ...await scopeWhere("NonConformanceReport", {}) },
    select: { id: true },
  });
  if (!ncr) return json({ error: "NCR not found" }, { status: 404 });
  const capa = await getCapa(ncrId, company.id);
  return json(capa);
});

// POST /api/quality-control/capa
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.QC_MANAGE);
  const company = await getCompany();
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });

  // Ownership + scope check on the parent NCR before creating a CAPA
  // inside the caller's tenant.
  const ncr = await prisma.nonConformanceReport.findFirst({
    where: { id: parsed.data.ncrId, companyId: company.id, ...await scopeWhere("NonConformanceReport", {}) },
    select: { id: true },
  });
  if (!ncr) return json({ error: "NCR not found" }, { status: 404 });

  try {
    const capa = await createCapa({
      ncrId: parsed.data.ncrId,
      rootCause: parsed.data.rootCause,
      correctiveAction: parsed.data.correctiveAction,
      correctiveDueDate: parsed.data.correctiveDueDate ? new Date(parsed.data.correctiveDueDate) : null,
      preventiveAction: parsed.data.preventiveAction,
      preventiveDueDate: parsed.data.preventiveDueDate ? new Date(parsed.data.preventiveDueDate) : null,
      userId: user.id,
      companyId: company.id,
    });
    revalidatePath("/quality-control");
    revalidatePath("/m/quality-control");
    return json(capa, { status: 201 });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
});
