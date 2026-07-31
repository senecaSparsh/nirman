import { NextRequest } from "next/server";
import { Prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requireUser } from "@/lib/server";
import { MODULES, type ModelKey, type RelationDef } from "@/lib/modules/registry";
import { findRecord, listChildrenCapped, getField } from "@/lib/modules/resolver";

/** Deep-serialize: Prisma.Decimal → number, Date → ISO string. */
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

export interface RecordField {
  label: string;
  value: string;
  type?: "currency" | "number" | "date" | "badge" | "text";
}

export interface RelatedGroup {
  relation: RelationDef;
  count: number;
  /** Sample child records (capped at 25) for the Related tab. */
  children: { id: string; label: string; secondary: string | null }[];
}

export interface RecordDetail {
  model: ModelKey;
  moduleLabel: string;
  recordId: string;
  displayLabel: string;
  secondaryLabel: string | null;
  fields: RecordField[];
  related: RelatedGroup[];
}

/**
 * GET /api/modules/record?model=<ModelKey>&id=<recordId>
 * Returns a single linked record's display fields + its relation children
 * (grouped by registry relation, capped at 25 per group). Used by the
 * playground popup's Overview (linked) + Related tabs.
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requireUser();
  const sp = req.nextUrl.searchParams;
  const model = sp.get("model") as ModelKey | null;
  const id = sp.get("id");
  if (!model || !MODULES[model]) {
    return json({ error: "Unknown module." }, { status: 400 });
  }
  if (!id) {
    return json({ error: "Missing record id." }, { status: 400 });
  }
  const company = await getCompany();
  const detail = await fetchRecordDetail(model, id, company.id);
  if (!detail) {
    return json({ error: "Record not found." }, { status: 404 });
  }
  return json(serialize(detail));
});

async function fetchRecordDetail(
  model: ModelKey,
  id: string,
  _companyId: string,
): Promise<RecordDetail | null> {
  const mod = MODULES[model];
  const record = await findRecord(model, id);
  if (!record) return null;

  // Build display fields from the module's column definitions
  const fields: RecordField[] = mod.columns.map((col) => {
    const raw = getField(record, col.field);
    let value: string;
    if (raw == null || raw === "") value = "—";
    else if (col.type === "date") value = raw instanceof Date ? raw.toISOString() : String(raw);
    else value = String(raw);
    return { label: col.label, value, type: col.type ?? "text" };
  });

  const displayLabel = String(getField(record, mod.displayField) ?? "—");
  const secondaryLabel = mod.secondaryField
    ? String(getField(record, mod.secondaryField) ?? "")
    : null;

  // Fetch children for each relation (capped at 25 per group)
  const related: RelatedGroup[] = [];
  for (const rel of mod.relations) {
    try {
      const children = await listChildrenCapped(model, id, rel.hops, rel.toModel, 25);
      related.push({
        relation: rel,
        count: children.length,
        children: children.map((child) => ({
          id: String(child.id),
          label: String(getField(child, MODULES[rel.toModel]?.displayField ?? "id") ?? "—"),
          secondary: MODULES[rel.toModel]?.secondaryField
            ? String(getField(child, MODULES[rel.toModel]!.secondaryField!) ?? "")
            : null,
        })),
      });
    } catch {
      // Skip relations that fail (e.g. complex multi-hop through missing models)
      related.push({ relation: rel, count: 0, children: [] });
    }
  }

  return {
    model,
    moduleLabel: mod.label,
    recordId: id,
    displayLabel,
    secondaryLabel,
    fields,
    related,
  };
}

