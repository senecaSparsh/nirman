import { NextRequest } from "next/server";
import { apiHandler, getCompany, json, requirePermission, requireUser } from "@/lib/server";
import { ALL_PERMISSIONS, PERM } from "@/lib/roles";
import { explainPermission } from "@/lib/access-explain";
import { memberAccessSources } from "@/lib/access-load";

export const GET = apiHandler(async (req: NextRequest) => {
  const me = await requireUser();
  const company = await getCompany();
  const params = new URL(req.url).searchParams;
  const permission = params.get("permission") ?? "";
  const userId = params.get("userId") ?? me.id;
  if (!ALL_PERMISSIONS.includes(permission)) return json({ error: "Unknown permission" }, { status: 400 });
  if (userId !== me.id) await requirePermission(PERM.USERS_VIEW);
  const sources = await memberAccessSources(company.id, userId);
  if (!sources) return json({ error: "Not a member of this company" }, { status: 404 });
  return json({ userId, permission, ...explainPermission(permission, sources) });
});
