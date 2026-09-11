import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * GET /api/companies/[id]/backups — recent automated backup records for a
 * company. The `data` blob is intentionally omitted (it can be large); only
 * metadata is returned for the Activity & Audit tab.
 */
export const GET = apiHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.AUDIT_VIEW);
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const take = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200);

  const backups = await prisma.backupRecord.findMany({
    where: { companyId: id },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, sizeBytes: true, createdAt: true },
  });

  return json(
    backups.map((b) => ({
      id: b.id,
      sizeBytes: b.sizeBytes,
      createdAt: b.createdAt.toISOString(),
    })),
  );
});
