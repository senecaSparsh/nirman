import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { cancelSupplierReturn, completeSupplierReturn, submitSupplierReturn } from "@nirman/services";
import { PERM } from "@/lib/roles";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.PROCUREMENT_MANAGE);
  const company = await getCompany();
  const { id } = await params;
  const body = await req.json();
  const action = body?.action as string;

  // Validate the return belongs to the user's company
  const existing = await prisma.supplierReturn.findFirst({
    where: { id, companyId: company.id },
    select: { id: true },
  });
  if (!existing) return json({ error: "Supplier return not found" }, { status: 404 });

  try {
    if (action === "submit") {
      await submitSupplierReturn(id, user.id);
      return json({ ok: true });
    }
    if (action === "complete") {
      await completeSupplierReturn({
        returnId: id,
        creditNoteNo: body?.creditNoteNo ?? undefined,
        userId: user.id,
      });
      return json({ ok: true });
    }
    if (action === "cancel") {
      await cancelSupplierReturn(id, user.id);
      return json({ ok: true });
    }
    return json({ error: "Invalid action. Use submit, complete, or cancel." }, { status: 400 });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Action failed") }, { status: 400 });
  }
});
