import { NextRequest, NextResponse } from "next/server";
import { getPortalCustomer } from "@/lib/portal-auth";
import { apiHandler } from "@/lib/server";

/**
 * GET /api/portal/me — returns the authenticated customer, or 401.
 */
export const GET = apiHandler(async (_req: NextRequest) => {
    const customer = await getPortalCustomer();
    if (!customer) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }
    return NextResponse.json({ customer });
}, { skipSession: true });
