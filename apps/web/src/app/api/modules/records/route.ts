import { NextRequest } from "next/server";
import { Prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requireUser } from "@/lib/server";
import { MODULES, type ModelKey } from "@/lib/modules/registry";
import { listRoot } from "@/lib/modules/resolver";

/** Deep-serialize a record: Prisma.Decimal -> number, Date -> ISO string. */
function serialize(value: unknown): unknown {
  if (value == null) return value;
  if (Prisma.Decimal.isDecimal(value)) return Number(value.toString());
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = serialize(v);
    return out;
  }
  return value;
}

/**
 * GET /api/modules/records?model=<ModelKey>
 * Returns the live root-level records for a given module, plus its column
 * definitions. Used by the playground canvas "click to preview" side panel
 * so the user can see the actual data behind a node without saving a workspace.
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requireUser();
  const sp = req.nextUrl.searchParams;
  const model = sp.get("model") as ModelKey | null;
  if (!model || !MODULES[model]) {
    return json({ error: "Unknown module." }, { status: 400 });
  }
  const mod = MODULES[model];
  const company = await getCompany();
  const rows = await listRoot(model, company.id);
  return json({
    model,
    moduleLabel: mod.label,
    displayField: mod.displayField,
    secondaryField: mod.secondaryField ?? null,
    columns: mod.columns,
    rows: rows.map((r) => ({ ...(serialize(r) as Record<string, unknown>), id: r.id })),
  });
});
