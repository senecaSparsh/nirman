import { NextRequest, NextResponse } from "next/server";
import { getPortalSupplier } from "@/lib/supplier-portal-auth";
import { apiHandler } from "@/lib/server";

/** GET /api/supplier-portal/me — the authenticated supplier, or 401. */
export const GET = apiHandler(async (_req: NextRequest) => {
  const supplier = await getPortalSupplier();
  if (!supplier) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  return NextResponse.json({ supplier });
}, { skipSession: true });
