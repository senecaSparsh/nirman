import { NextRequest, NextResponse } from "next/server";
import { PORTAL_COOKIE_NAME } from "@/lib/portal-auth";

/**
 * POST /api/portal/auth/logout — clear the portal session cookie.
 */
export const POST = (_req: NextRequest) => {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(PORTAL_COOKIE_NAME);
  return res;
};
