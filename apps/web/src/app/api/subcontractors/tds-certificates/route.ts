import { NextRequest } from "next/server";
import { listTdsSubcontractors } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/** GET /api/subcontractors/tds-certificates?fy=2025-26 — list subcontractors with TDS in FY */
export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.FINANCE_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const fy = searchParams.get("fy") || currentFY();
  const list = await listTdsSubcontractors(fy, company.id);
  return json({ financialYear: fy, subcontractors: list });
});

/** Compute current Indian financial year string (YYYY-YY) */
function currentFY(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  // FY starts April 1: Jan-Mar belongs to previous FY
  const fyStart = month < 3 ? year - 1 : year;
  const fyEnd = (fyStart + 1).toString().slice(2);
  return `${fyStart}-${fyEnd}`;
}
