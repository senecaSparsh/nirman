import { NextRequest } from "next/server";
import {
  previewExpenseGl,
  previewProjectCostGl,
  previewPurchaseReceiptGl,
  previewMaterialIssueGl,
  previewAssetSaleGl,
  previewStockAdjustmentGl,
  previewPayrollGl,
  type GlPreviewLine,
} from "@nirman/services";
import { apiHandler, json, requireUser } from "@/lib/server";

/**
 * POST /api/gl/preview
 * Body: { type: "expense" | "projectCost" | "purchaseReceipt" | "materialIssue" | "assetSale" | "stockAdjustment", ... }
 *
 * Returns the journal lines that WOULD be posted for the given mutation,
 * without actually persisting anything. Used by the "Preview GL Impact"
 * button on financial forms.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  await requireUser();
  const body = await req.json();
  const { type } = body as { type: string };

  let lines: GlPreviewLine[];

  switch (type) {
    case "expense":
      lines = previewExpenseGl(Number(body.amount) || 0);
      break;
    case "projectCost":
      lines = previewProjectCostGl(Number(body.amount) || 0);
      break;
    case "purchaseReceipt":
      lines = previewPurchaseReceiptGl(
        Number(body.subtotal) || 0,
        Number(body.gstRate) || 0,
      );
      break;
    case "materialIssue":
      lines = previewMaterialIssueGl(
        (body.lines as { qty: number; unitCost: number }[]) ?? [],
      );
      break;
    case "assetSale":
      lines = previewAssetSaleGl(
        Number(body.subtotal) || 0,
        Number(body.gstRate) || 0,
      );
      break;
    case "stockAdjustment":
      lines = previewStockAdjustmentGl(
        (body.lines as { variance: number; unitCost: number }[]) ?? [],
      );
      break;
    case "payroll":
      lines = previewPayrollGl({
        totalGross: Number(body.totalGross) || 0,
        totalNet: Number(body.totalNet) || 0,
        totalPF: Number(body.totalPF) || 0,
        totalEmployerPf: Number(body.totalEmployerPf) || 0,
        totalESI: Number(body.totalESI) || 0,
        totalProfessionTax: Number(body.totalProfessionTax) || 0,
        totalTDS: Number(body.totalTDS) || 0,
        totalDeductions: Number(body.totalDeductions) || 0,
      });
      break;
    default:
      return json({ error: `Unknown preview type: ${type}` }, { status: 400 });
  }

  return json({ lines });
});
