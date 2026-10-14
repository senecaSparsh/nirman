import { NextRequest } from "next/server";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { ALL_PERMISSIONS, PERM } from "@/lib/roles";
import { permissionHolders } from "@/lib/access-load";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.USERS_VIEW);
  const company = await getCompany();
  const permission = new URL(req.url).searchParams.get("permission") ?? "";
  if (!ALL_PERMISSIONS.includes(permission)) return json({ error: "Unknown permission" }, { status: 400 });
  return json({ permission, holders: await permissionHolders(company.id, permission) });
});
