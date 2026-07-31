import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getSession, json, userRoleSchema } from "@/lib/server";
import { canManageUsers } from "@/lib/roles";

/**
 * PATCH /api/users/[id] — update a user's role or active status.
 * Only OWNER / ADMIN can manage users.
 */
export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const session = await getSession();
  const role = (session?.user as { role?: string })?.role ?? "MANAGER";
  if (!canManageUsers(role)) {
    return json({ error: "Forbidden — only owners and admins can manage users" }, { status: 403 });
  }

  const { id: userId } = await params;
  const body = await req.json();
  const parsed = userRoleSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) {
    return json({ error: "User not found" }, { status: 404 });
  }

  // Prevent the last OWNER from demoting themselves
  if (existing.role === "OWNER" && parsed.data.role !== "OWNER") {
    const ownerCount = await prisma.user.count({ where: { role: "OWNER", active: true } });
    if (ownerCount <= 1) {
      return json({ error: "Cannot demote the last remaining owner" }, { status: 400 });
    }
  }

  const update: Record<string, unknown> = {};
  if (body.role !== undefined) update.role = body.role;
  if (body.active !== undefined) update.active = body.active;

  const updated = await prisma.user.update({
    where: { id: userId },
    data: update,
    select: { id: true, email: true, name: true, role: true, active: true },
  });

  return json({ ok: true, user: updated });
});
