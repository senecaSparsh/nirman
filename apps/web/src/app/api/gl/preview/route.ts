import { NextRequest } from "next/server";
import {
  previewExpenseGl,
  previewProjectCostGl,
  previewLandCostComponentGl,
  previewPurchaseReceiptGl,
  previewMaterialIssueGl,
  previewAssetSaleGl,
  previewStockAdjustmentGl,
  previewPayrollGl,
  type GlPreviewLine,
} from "@nirman/services";
import { apiHandler, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * POST /api/gl/preview
 * Body: { type: "expense" | "projectCost" | "purchaseReceipt" | "materialIssue" | "assetSale" | "stockAdjustment", ... }
 *
 * Returns the journal lines that WOULD be posted for the given mutation,
 * without actually persisting anything. Used by the "Preview GL Impact"
 * button on financial forms.
 */
/** numeric(14,2) ceiling — same bound the write paths enforce. */
const MAX_MONEY = 999_999_999_999.99;

/**
 * Parse a required money field: must be a finite number in [min, MAX_MONEY].
 * The old `Number(x) || 0` coerced "abc"/null/negative/1e18 into silent
 * zero-or-huge previews — a preview must reflect what the real posting
 * would reject, so bad input is a 400 here too.
 */
function money(
  body: Record<string, unknown>,
  key: string,
  { min = 0 }: { min?: number } = {},
): number | Response {
  const n = Number(body[key]);
  if (body[key] === undefined || body[key] === null || !Number.isFinite(n)) {
    return json({ error: `${key} must be a number` }, { status: 400 });
  }
  if (n < min) return json({ error: `${key} must be >= ${min}` }, { status: 400 });
  if (n > MAX_MONEY) return json({ error: `${key} exceeds the maximum storable value` }, { status: 400 });
  return n;
}

export const POST = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.FINANCE_VIEW);
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const type = typeof body?.type === "string" ? body.type : "";

  let lines: GlPreviewLine[];
  let v: number | Response;
  const bad = (x: number | Response): x is Response => x instanceof Response;

  switch (type) {
    case "expense":
      v = money(body, "amount", { min: 0.01 });
      if (bad(v)) return v;
      lines = previewExpenseGl(v);
      break;
    case "projectCost":
      v = money(body, "amount", { min: 0.01 });
      if (bad(v)) return v;
      lines = previewProjectCostGl(v);
      break;
    case "landCostComponent":
      v = money(body, "amount", { min: 0.01 });
      if (bad(v)) return v;
      lines = previewLandCostComponentGl(v);
      break;
    case "purchaseReceipt": {
      const subtotal = money(body, "subtotal", { min: 0.01 });
      if (bad(subtotal)) return subtotal;
      const gstRate = money(body, "gstRate", { min: 0 });
      if (bad(gstRate)) return gstRate;
      lines = previewPurchaseReceiptGl(subtotal, gstRate);
      break;
    }
    case "materialIssue": {
      if (!Array.isArray(body.lines)) return json({ error: "lines must be an array" }, { status: 400 });
      for (const [i, l] of (body.lines as Record<string, unknown>[]).entries()) {
        const q = money(l ?? {}, "qty", { min: 0.01 });
        if (bad(q)) return json({ error: `lines[${i}].qty: must be a number > 0` }, { status: 400 });
        const c = money(l ?? {}, "unitCost", { min: 0 });
        if (bad(c)) return json({ error: `lines[${i}].unitCost: must be a number >= 0` }, { status: 400 });
      }
      lines = previewMaterialIssueGl(body.lines);
      break;
    }
    case "assetSale": {
      const subtotal = money(body, "subtotal", { min: 0.01 });
      if (bad(subtotal)) return subtotal;
      const gstRate = money(body, "gstRate", { min: 0 });
      if (bad(gstRate)) return gstRate;
      lines = previewAssetSaleGl(subtotal, gstRate);
      break;
    }
    case "stockAdjustment":
      if (!Array.isArray(body.lines)) return json({ error: "lines must be an array" }, { status: 400 });
      lines = previewStockAdjustmentGl(body.lines);
      break;
    case "payroll": {
      const fields = [
        "totalGross", "totalNet", "totalPF", "totalEmployerPf",
        "totalESI", "totalProfessionTax", "totalTDS", "totalDeductions",
      ] as const;
      const parsed: Record<string, number> = {};
      for (const f of fields) {
        const n = money(body, f, { min: 0 });
        if (bad(n)) return n;
        parsed[f] = n;
      }
      lines = previewPayrollGl(parsed as Parameters<typeof previewPayrollGl>[0]);
      break;
    }
    default:
      return json({ error: `Unknown preview type: ${type}` }, { status: 400 });
  }

  return json({ lines });
});
