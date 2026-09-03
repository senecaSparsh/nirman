import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { verifyMbEntry, approveMbEntry, rejectMbEntry } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission, requireUser } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

/** GET /api/mb-entries/[id] — fetch a single measurement book entry by ID */
export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.MB_VIEW);
  const company = await getCompany();
  const { id } = await params;
  const entry = await prisma.measurementBookEntry.findFirst({
    where: { id, project: { companyId: company.id } },
    include: {
      project: { select: { id: true, name: true } },
      phase: { select: { id: true, name: true } },
      boqItem: { select: { id: true, serialNo: true, description: true, unit: true, rate: true } },
      wbsNode: { select: { id: true, code: true, name: true } },
      measuredBy: { select: { id: true, name: true } },
      verifiedBy: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
    },
  });
  if (!entry) return json({ error: "MB entry not found" }, { status: 404 });
  return json(entry);
});

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requireUser();
  const { id } = await params;
  const body = await req.json();
  const action = body?.action;

  try {
    if (action === "verify") {
      const user = await requirePermission(PERM.MB_VERIFY);
      const entry = await verifyMbEntry(id, user.id);
      revalidatePath("/boq");
      revalidatePath("/projects");
      return json(entry);
    }
    if (action === "approve") {
      const user = await requirePermission(PERM.MB_APPROVE);
      const entry = await approveMbEntry(id, user.id);
      revalidatePath("/boq");
      revalidatePath("/projects");
      return json(entry);
    }
    if (action === "reject") {
      const user = await requirePermission(PERM.MB_VERIFY);
      const schema = z.object({ reason: z.string().min(1) });
      const parsed = schema.safeParse({ reason: body.reason });
      if (!parsed.success) return json({ error: "Rejection reason is required" }, { status: 400 });
      const entry = await rejectMbEntry(id, parsed.data.reason, user.id);
      revalidatePath("/boq");
      revalidatePath("/projects");
      return json(entry);
    }
    return json({ error: "Unknown action. Use: verify | approve | reject" }, { status: 400 });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
});

/** DELETE /api/mb-entries/[id] — hard-delete a measurement book entry (only DRAFT) */
export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.MB_APPROVE);
  const company = await getCompany();
  const { id } = await params;

  const entry = await prisma.measurementBookEntry.findFirst({
    where: { id, project: { companyId: company.id } },
    select: { id: true, status: true },
  });
  if (!entry) return json({ error: "MB entry not found" }, { status: 404 });
  if (entry.status !== "DRAFT") {
    return json({ error: "Only DRAFT entries can be deleted" }, { status: 400 });
  }

  await prisma.measurementBookEntry.delete({ where: { id } });
  return json({ ok: true });
});
