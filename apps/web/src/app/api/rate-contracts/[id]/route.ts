import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { cancelRateContract } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/** GET /api/rate-contracts/[id] — fetch a single rate contract by ID */
export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.PROCUREMENT_VIEW);
  const company = await getCompany();
  const { id } = await params;
  const contract = await prisma.rateContract.findFirst({
    where: { id, companyId: company.id },
    include: {
      supplier: { select: { id: true, name: true, phone: true } },
      material: { select: { id: true, code: true, name: true, unit: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });
  if (!contract) return json({ error: "Rate contract not found" }, { status: 404 });
  return json(contract);
});

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.PROCUREMENT_MANAGE);
  const { id } = await params;
  const body = await req.json();
  if (body?.action === "cancel") {
    try {
      const contract = await cancelRateContract(id, user.id);
      return json(contract);
    } catch (err: unknown) {
      return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
    }
  }
  return json({ error: "Unknown action. Use: cancel" }, { status: 400 });
});
