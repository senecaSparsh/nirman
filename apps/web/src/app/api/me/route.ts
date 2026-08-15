import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getSession, json } from "@/lib/server";

/**
 * GET /api/me — returns the current user's basic info (id, name, email, role, phone).
 * Used by the AppShell for role-based nav filtering and the mobile profile page.
 */
export const GET = apiHandler(async (_req: NextRequest) => {
  const session = await getSession();
  if (!session?.user) {
    return json({ role: null, id: null, name: null, email: null, phone: null }, { status: 200 });
  }
  const sessionUser = session.user as { id: string; name?: string; email?: string; role?: string };
  // Fetch phone from DB since Better-Auth session may not include it
  const dbUser = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { phone: true },
  });
  const res = json({
    id: sessionUser.id,
    name: sessionUser.name ?? null,
    email: sessionUser.email ?? null,
    role: sessionUser.role ?? null,
    phone: dbUser?.phone ?? null,
  });
  // User role/name changes rarely — cache for 60s, revalidate in background.
  res.headers.set("Cache-Control", "private, max-age=60, stale-while-revalidate=300");
  return res;
});
