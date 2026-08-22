import { NextRequest } from "next/server";
import { generateMaterialCode, previewMaterialCode } from "@nirman/services";
import { PERM } from "@/lib/roles";
import { apiHandler, json, requirePermission } from "@/lib/server";

/**
 * GET /api/materials/auto-code?categoryName=Steel&grade=Fe500D
 * Returns a preview of the auto-generated material code (without creating it).
 * The UI uses this to show the user what code their material will get before
 * they save.
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.INVENTORY_VIEW);
  const url = new URL(req.url);
  const categoryName = url.searchParams.get("categoryName") ?? "";
  const grade = url.searchParams.get("grade") ?? null;
  if (!categoryName) {
    return json({ error: "categoryName is required" }, { status: 400 });
  }
  const preview = previewMaterialCode(categoryName, grade);
  return json({ preview });
});

/**
 * POST /api/materials/auto-code
 * Body: { categoryName, grade }
 * Generates and returns the actual next unique material code.
 * Used by the material create form to auto-fill the code field.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.INVENTORY_MANAGE);
  const body = await req.json();
  const { categoryName, grade } = body as { categoryName: string; grade?: string | null };
  if (!categoryName) {
    return json({ error: "categoryName is required" }, { status: 400 });
  }
  const code = await generateMaterialCode(categoryName, grade ?? null);
  return json({ code });
});
