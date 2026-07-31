import { NextRequest } from "next/server";
import { apiHandler, getSession, json } from "@/lib/server";

/**
 * GET /api/me — returns the current user's basic info (id, name, email, role).
 * Used by the AppShell for role-based nav filtering.
 */
export const GET = apiHandler(async (_req: NextRequest) => {
  const session = await getSession();
  if (!session?.user) {
    return json({ role: "MANAGER", id: null, name: null, email: null }, { status: 200 });
  }
  const user = session.user as { id: string; name?: string; email?: string; role?: string };
  return json({
    id: user.id,
    name: user.name ?? null,
    email: user.email ?? null,
    role: user.role ?? "MANAGER",
  });
});
