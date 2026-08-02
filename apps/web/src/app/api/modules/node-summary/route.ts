import { NextRequest } from "next/server";
import { Prisma } from "@nirman/db";
import { apiHandler, json, requireUser } from "@/lib/server";
import { MODULES, type ModelKey } from "@/lib/modules/registry";
import { findRecord, getField } from "@/lib/modules/resolver";

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

export interface NodeSummary {
  model: ModelKey;
  recordId: string;
  status: string | null;
  metric: { label: string; value: string; type: "currency" | "number" | "text" } | null;
}

/**
 * Derive a lightweight summary (status + one key metric) from a record
 * using the module's column definitions — no per-model code needed.
 *
 * Status: the first column whose field is "status" (or the secondaryField
 * if it's a badge type).
 *
 * Metric: the first currency/number column that isn't the status field.
 */
function summarize(model: ModelKey, record: Record<string, unknown>): NodeSummary {
  const mod = MODULES[model];
  const statusCol =
    mod.columns.find((c) => c.field === "status") ??
    (mod.secondaryField && mod.columns.find((c) => c.field === mod.secondaryField && c.type === "badge")
      ? mod.columns.find((c) => c.field === mod.secondaryField)
      : null);
  const status = statusCol ? String(getField(record, statusCol.field) ?? "") || null : null;

  const metricCol = mod.columns.find(
    (c) => (c.type === "currency" || c.type === "number") && c.field !== statusCol?.field,
  );
  const metric = metricCol
    ? {
        label: metricCol.label,
        value: String(getField(record, metricCol.field) ?? ""),
        type: (metricCol.type ?? "text") as "currency" | "number" | "text",
      }
    : null;

  return { model, recordId: String(record.id), status, metric };
}

/**
 * GET /api/modules/node-summary?model=<ModelKey>&id=<recordId>
 * Returns a single record's lightweight summary (status + key metric)
 * for display on the canvas node. This is the minimal data the node
 * needs to be a "living pointer" instead of a dead label.
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
  const record = await findRecord(model, id);
  if (!record) {
    return json({ error: "Record not found." }, { status: 404 });
  }
  return json(serialize(summarize(model, record)) as NodeSummary);
});

/**
 * POST /api/modules/node-summary
 * Body: { nodes: [{ model: ModelKey, id: string }, ...] }
 * Batch-fetch summaries for multiple linked nodes — used on canvas load
 * to populate all pre-linked nodes in a single round-trip.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  await requireUser();
  const body = await req.json();
  const items: { model: ModelKey; id: string }[] = Array.isArray(body?.nodes) ? body.nodes : [];
  if (items.length === 0) {
    return json({ summaries: [] });
  }
  // Cap at 50 to prevent abuse
  const capped = items.slice(0, 50);
  const results: (NodeSummary | null)[] = await Promise.all(
    capped.map(async ({ model, id }) => {
      if (!MODULES[model]) return null;
      try {
        const record = await findRecord(model, id);
        if (!record) return null;
        return serialize(summarize(model, record)) as NodeSummary;
      } catch {
        return null;
      }
    }),
  );
  const summaries = results.filter((r): r is NodeSummary => r !== null);
  return json({ summaries });
});
