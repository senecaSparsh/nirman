import { NextResponse } from "next/server";
import { SUPPLIER_PORTAL_COOKIE_NAME } from "@/lib/supplier-portal-auth";
import { apiHandler } from "@/lib/server";

/** POST /api/supplier-portal/auth/logout — clears the supplier cookie. */
export const POST = apiHandler(async () => {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SUPPLIER_PORTAL_COOKIE_NAME);
  return res;
}, { skipSession: true });
