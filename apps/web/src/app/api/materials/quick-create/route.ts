import { NextRequest } from "next/server";
import { quickCreateMaterial } from "@nirman/services";
import { PERM } from "@/lib/roles";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { z } from "zod";

const quickCreateSchema = z.object({
  name: z.string().min(1, "Material name is required").max(200),
  categoryId: z.string().min(1, "Category is required"),
  unit: z.string().min(1, "Unit is required").default("NOS"),
  grade: z.string().optional().nullable(),
  specification: z.string().optional().nullable(),
  standardCost: z.coerce.number().min(0).optional(),
});

/**
 * POST /api/materials/quick-create
 *
 * Quick-create a material with auto-generated code + auto-picked HSN/GST.
 * Used during goods receipt when a material arrives that's not in the system.
 *
 * The caller provides just: name, category, unit (+ optional grade/spec/cost).
 * The system auto-generates the code (same format as Add Material page) and
 * auto-picks HSN/GST from the government HSN master.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.INVENTORY_MANAGE);
  await getCompany();
  const body = await req.json();
  const parsed = quickCreateSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  try {
    const material = await quickCreateMaterial({
      name: parsed.data.name,
      categoryId: parsed.data.categoryId,
      unit: parsed.data.unit,
      grade: parsed.data.grade ?? null,
      specification: parsed.data.specification ?? null,
      standardCost: parsed.data.standardCost,
      userId: user.id,
      companyId: user.companyId ?? undefined,
    });

    return json(material, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create material";
    const status = message.includes("already exists") ? 409 : 400;
    return json({ error: message }, { status });
  }
});
