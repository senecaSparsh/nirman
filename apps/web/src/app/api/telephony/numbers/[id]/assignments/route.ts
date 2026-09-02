import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * GET /api/telephony/numbers/[id]/assignments — assignment history for a number.
 * Requires TELEPHONY_VIEW.
 */
export const GET = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.TELEPHONY_VIEW);
  const company = await getCompany();
  const { id } = await params;

  // Validate the number belongs to this company
  const phone = await prisma.companyPhone.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
  });
  if (!phone) return json({ error: "Phone number not found" }, { status: 404 });

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10) || 50));

  const [assignments, total] = await Promise.all([
    prisma.phoneAssignment.findMany({
      where: { companyPhoneId: id },
      orderBy: { assignedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        user: { select: { id: true, name: true, email: true } },
        assignedBy: { select: { id: true, name: true } },
      },
    }),
    prisma.phoneAssignment.count({ where: { companyPhoneId: id } }),
  ]);

  return json({ data: assignments, total, page, limit });
});
