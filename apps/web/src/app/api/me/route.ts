import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getSession, getUserPermissions, json } from "@/lib/server";

/**
 * GET /api/me — the current user's identity + EFFECTIVE permissions.
 *
 * `permissions` is the same merged set the server authorises against
 * (role matrix + RolePermission overrides + per-user UserPermission grants).
 * The client previously received only `role`, so it evaluated access against
 * the role matrix alone — which meant a permission granted to one individual
 * was enforced by the API but invisible in the UI: no nav entry, no button,
 * no way to reach it short of typing the URL. Navigation now gates on this
 * field, so bespoke permission sets produce a matching bespoke UI.
 */
export const GET = apiHandler(async (_req: NextRequest) => {
  const session = await getSession();
  if (!session?.user) {
    return json(
      { role: null, id: null, name: null, email: null, phone: null, permissions: [] },
      { status: 200 },
    );
  }
  const sessionUser = session.user as { id: string; name?: string; email?: string; role?: string };
  // Fetch phone + effective permissions in parallel (permissions hit
  // RolePermission + UserCompany.userPermissions).
  const [dbUser, permissions] = await Promise.all([
    prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: {
        phone: true,
        mustChangePassword: true,
        image: true,
        active: true,
        employeeCode: true,
        designation: true,
        department: true,
        joiningDate: true,
        lastLoginAt: true,
      },
    }),
    getUserPermissions().catch(() => [] as string[]),
  ]);
  const res = json({
    id: sessionUser.id,
    name: sessionUser.name ?? null,
    email: sessionUser.email ?? null,
    role: sessionUser.role ?? null,
    phone: dbUser?.phone ?? null,
    image: dbUser?.image ?? null,
    active: dbUser?.active ?? true,
    employeeCode: dbUser?.employeeCode ?? null,
    designation: dbUser?.designation ?? null,
    department: dbUser?.department ?? null,
    joiningDate: dbUser?.joiningDate?.toISOString() ?? null,
    lastLoginAt: dbUser?.lastLoginAt?.toISOString() ?? null,
    mustChangePassword: dbUser?.mustChangePassword ?? false,
    permissions,
  });
  // User role/name changes rarely — cache for 60s, revalidate in background.
  res.headers.set("Cache-Control", "private, max-age=60, stale-while-revalidate=300");
  return res;
});
