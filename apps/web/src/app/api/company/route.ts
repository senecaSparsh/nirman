import { NextRequest } from "next/server";
import { apiHandler, getCompany, json, requireUser } from "@/lib/server";

/** Returns the current company info (single-company mode). */
export const GET = apiHandler(async (_req: NextRequest) => {
  await requireUser();
  const company = await getCompany();
  return json({
    id: company.id,
    name: company.name,
    currency: company.currency,
    gstin: company.gstin,
    pan: company.pan,
    address: company.address,
  });
});
