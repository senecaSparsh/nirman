import { NextRequest } from "next/server";
import { getTdsCertificate } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/** GET /api/subcontractors/tds-certificates/[subcontractorId]?fy=2025-26 — full TDS certificate */
export const GET = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ subcontractorId: string }> }) => {
  await requirePermission(PERM.FINANCE_VIEW);
  const company = await getCompany();
  const { subcontractorId } = await params;
  const { searchParams } = new URL(req.url);
  const fy = searchParams.get("fy") || currentFY();
  const cert = await getTdsCertificate(subcontractorId, fy, company.id);
  return json(cert);
});

function currentFY(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const fyStart = month < 3 ? year - 1 : year;
  const fyEnd = (fyStart + 1).toString().slice(2);
  return `${fyStart}-${fyEnd}`;
}
