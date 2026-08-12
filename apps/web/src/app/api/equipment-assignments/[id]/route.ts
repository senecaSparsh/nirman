import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { returnEquipment } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.ASSETS_MANAGE);
  const company = await getCompany();
  const { id } = await params;
  const body = await req.json();
  const action = body?.action as string;

  if (action === "return") {
    // Validate the assignment belongs to the user's company
    const assignment = await prisma.equipmentAssignment.findFirst({
      where: { id, equipment: { companyId: company.id } },
    });
    if (!assignment) return json({ error: "Assignment not found in your company" }, { status: 404 });
    try {
      await returnEquipment(id, user.id);
      return json({ ok: true });
    } catch (err: unknown) {
      return json({ error: (err instanceof Error ? err.message : "Return failed") }, { status: 400 });
    }
  }

  return json({ error: "Invalid action. Use return." }, { status: 400 });
});
