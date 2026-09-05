import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { logAction } from "./audit";
import { ServiceError } from "./errors";
import { withSerializableTransaction } from "./transaction";
import { getStateCodeFromGstin, isIntraState, splitGst } from "./gst-reports";

/**
 * e-Invoicing — NIC e-Invoice API integration for B2B invoices.
 *
 * Indian businesses with turnover ≥ ₹5 crore (threshold varies by notification)
 * must register B2B invoices on the NIC (National Informatics Centre) e-Invoice
 * portal to obtain an IRN (Invoice Reference Number) before reporting them in
 * GSTR-1. The IRN is a 64-character hash of the invoice's key fields.
 *
 * This service:
 *   1. Builds the e-invoice JSON payload (per NIC schema v1.03)
 *   2. Calls a pluggable EInvoiceProvider (stub logs; real provider calls NIC API)
 *   3. Stores the IRN, acknowledgment number, and QR code on the invoice
 *
 * The provider pattern mirrors the Tally/WhatsApp integrations — a stub is
 * used in development, and a real provider is wired in production with NIC
 * credentials (client ID, client secret, public key for auth).
 */

// ── Types ──────────────────────────────────────────────────────────

export interface EInvoicePayload {
  Version: string;              // "1.03"
  TranDtls: {
    TaxSch: string;             // "GST"
    SupTyp: string;             // "B2B" | "B2C" | "CWGS" | "EXPWOP"
    RegRev: string;             // "Y" if reverse charge, "N" otherwise
    EcmGstin: string | null;    // e-commerce operator GSTIN (if applicable)
  };
  DocDtls: {
    Typ: string;                // "INV" | "CRN" | "DBN" (invoice / credit note / debit note)
    No: string;                 // invoice number (≤16 chars)
    Dt: string;                 // dd/mm/yyyy
  };
  SellerDtls: {
    Gstin: string;
    LglNm: string;
    Addr1: string;
    Loc: string;
    Pin: number;
    Stcd: string;
  };
  BuyerDtls: {
    Gstin: string;
    LglNm: string;
    Addr1: string;
    Loc: string;
    Pin: number;
    Stcd: string;
    Pos: string;                // place of supply state code
  };
  ValDtls: {
    AssVal: number;             // assessable value (taxable)
    CgstVal: number;
    SgstVal: number;
    IgstVal: number;
    TotInvVal: number;          // total invoice value (incl. GST)
  };
  ItemList: Array<{
    SlNo: string;
    PrdDesc: string;
    HsnCd: string;
    Qty: number;
    Unit: string;
    UnitPrice: number;
    TotAmt: number;             // qty × unitPrice
    AssAmt: number;             // taxable amount (after discount, if any)
    GstRt: number;
    CgstAmt: number;
    SgstAmt: number;
    IgstAmt: number;
    TotItemVal: number;         // AssAmt + GST
  }>;
}

export interface EInvoiceResult {
  irn: string;
  ackNo: string;
  ackDt: string;                // ISO date
  qrCode: string;               // base64 QR code image
  signedInvoice: string;        // signed JSON from NIC
  status: "GENERATED";
}

export interface EInvoiceCancelResult {
  irn: string;
  status: "CANCELLED";
  cancelDate: string;
}

export interface EInvoiceProvider {
  generate(payload: EInvoicePayload): Promise<EInvoiceResult>;
  cancel(irn: string, reason: string): Promise<EInvoiceCancelResult>;
}

// ── Stub Provider (development) ────────────────────────────────────

class StubEInvoiceProvider implements EInvoiceProvider {
  async generate(payload: EInvoicePayload): Promise<EInvoiceResult> {
    // Generate a fake 64-char IRN hash for development
    const hashInput = `${payload.DocDtls.No}|${payload.SellerDtls.Gstin}|${payload.BuyerDtls.Gstin}|${payload.DocDtls.Dt}`;
    const irn = Array.from({ length: 64 }, (_, i) =>
      hashInput.charCodeAt(i % hashInput.length).toString(16).padStart(2, "0").slice(-1)
    ).join("");
    return {
      irn,
      ackNo: `ACK-${Date.now()}`,
      ackDt: new Date().toISOString(),
      qrCode: `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==`,
      signedInvoice: JSON.stringify(payload),
      status: "GENERATED",
    };
  }

  async cancel(irn: string, _reason: string): Promise<EInvoiceCancelResult> {
    return {
      irn,
      status: "CANCELLED",
      cancelDate: new Date().toISOString(),
    };
  }
}

let provider: EInvoiceProvider = new StubEInvoiceProvider();
let providerIsStub = true;

export function setEInvoiceProvider(p: EInvoiceProvider) {
  provider = p;
  providerIsStub = false;
}

/** Returns true if the e-invoice provider is the default stub (no real NIC integration). */
export function isEInvoiceConfigured(): boolean {
  return !providerIsStub;
}

// ── Payload Builder ────────────────────────────────────────────────

/**
 * Build the e-invoice payload for a MaterialSale (B2B).
 * Returns null if the sale is not eligible for e-invoicing (e.g. B2C, no GSTIN).
 */
export async function buildMaterialSaleEInvoicePayload(
  saleId: string,
  companyId: string,
): Promise<EInvoicePayload | null> {
  const sale = await prisma.materialSale.findFirst({
    where: { id: saleId, companyId },
    include: {
      customer: true,
      company: true,
      lines: { include: { material: { select: { name: true, hsnCode: true, unit: true } } } },
    },
  });
  if (!sale) throw new ServiceError("Sale not found", 404);

  // e-Invoicing requires both parties to have GSTIN (B2B)
  if (!sale.company.gstin || !sale.customer.gstin) return null;

  const intraState = isIntraState(sale.company.gstin, sale.customer.gstin);
  const sellerState = getStateCodeFromGstin(sale.company.gstin)!;
  const buyerState = getStateCodeFromGstin(sale.customer.gstin)!;

  const itemList: EInvoicePayload["ItemList"] = sale.lines.map((line, idx) => {
    const qty = new Decimal(line.qty).toNumber();
    const unitPrice = new Decimal(line.unitPrice).toNumber();
    const totAmt = qty * unitPrice;
    const gstRate = new Decimal(line.gstRate).toNumber();
    const gstAmt = new Decimal(line.gstAmount).toNumber();
    const split = splitGst(new Decimal(line.gstAmount), sale.company.gstin, sale.customer.gstin);
    return {
      SlNo: String(idx + 1),
      PrdDesc: line.material.name,
      HsnCd: line.material.hsnCode ?? "999999",      // fallback HSN
      Qty: qty,
      Unit: line.material.unit ?? "NOS",
      UnitPrice: unitPrice,
      TotAmt: totAmt,
      AssAmt: totAmt,
      GstRt: gstRate,
      CgstAmt: split.cgst.toNumber(),
      SgstAmt: split.sgst.toNumber(),
      IgstAmt: split.igst.toNumber(),
      TotItemVal: totAmt + gstAmt,
    };
  });

  const subtotal = new Decimal(sale.subtotal).toNumber();
  const gstTotal = new Decimal(sale.gstTotal).toNumber();
  const totalAmount = new Decimal(sale.totalAmount).toNumber();
  const split = splitGst(new Decimal(sale.gstTotal), sale.company.gstin, sale.customer.gstin);

  return {
    Version: "1.03",
    TranDtls: {
      TaxSch: "GST",
      SupTyp: "B2B",
      RegRev: "N",
      EcmGstin: null,
    },
    DocDtls: {
      Typ: "INV",
      No: sale.saleNumber.slice(0, 16),
      Dt: formatDateForNic(sale.saleDate),
    },
    SellerDtls: {
      Gstin: sale.company.gstin,
      LglNm: sale.company.name,
      Addr1: sale.company.address ?? "—",
      Loc: "—",
      Pin: 0,                                     // would need a Pin field
      Stcd: sellerState,
    },
    BuyerDtls: {
      Gstin: sale.customer.gstin,
      LglNm: sale.customer.name,
      Addr1: sale.customer.address ?? "—",
      Loc: "—",
      Pin: 0,
      Stcd: buyerState,
      Pos: intraState ? sellerState : buyerState,     // place of supply
    },
    ValDtls: {
      AssVal: subtotal,
      CgstVal: split.cgst.toNumber(),
      SgstVal: split.sgst.toNumber(),
      IgstVal: split.igst.toNumber(),
      TotInvVal: totalAmount,
    },
    ItemList: itemList,
  };
}

/**
 * Build the e-invoice payload for an AssetSale (B2B real estate).
 * Returns null if not eligible.
 */
export async function buildAssetSaleEInvoicePayload(
  saleId: string,
  companyId: string,
): Promise<EInvoicePayload | null> {
  const sale = await prisma.assetSale.findFirst({
    where: { id: saleId, companyId },
    include: {
      customer: true,
      company: true,
    },
  });
  if (!sale) throw new ServiceError("Sale not found", 404);

  // e-Invoicing requires both parties to have GSTIN (B2B)
  if (!sale.company.gstin || !sale.customer.gstin) return null;

  const sellerState = getStateCodeFromGstin(sale.company.gstin)!;
  const buyerState = getStateCodeFromGstin(sale.customer.gstin)!;
  const intraState = isIntraState(sale.company.gstin, sale.customer.gstin);

  const salePrice = new Decimal(sale.salePrice);
  const gstAmount = new Decimal(sale.gstAmount);
  const total = salePrice.plus(gstAmount);
  const split = splitGst(gstAmount, sale.company.gstin, sale.customer.gstin);

  return {
    Version: "1.03",
    TranDtls: {
      TaxSch: "GST",
      SupTyp: "B2B",
      RegRev: "N",
      EcmGstin: null,
    },
    DocDtls: {
      Typ: "INV",
      No: sale.saleNumber.slice(0, 16),
      Dt: formatDateForNic(sale.saleDate),
    },
    SellerDtls: {
      Gstin: sale.company.gstin,
      LglNm: sale.company.name,
      Addr1: sale.company.address ?? "—",
      Loc: "—",
      Pin: 0,
      Stcd: sellerState,
    },
    BuyerDtls: {
      Gstin: sale.customer.gstin,
      LglNm: sale.customer.name,
      Addr1: sale.customer.address ?? "—",
      Loc: "—",
      Pin: 0,
      Stcd: buyerState,
      Pos: intraState ? sellerState : buyerState,
    },
    ValDtls: {
      AssVal: salePrice.toNumber(),
      CgstVal: split.cgst.toNumber(),
      SgstVal: split.sgst.toNumber(),
      IgstVal: split.igst.toNumber(),
      TotInvVal: total.toNumber(),
    },
    ItemList: [{
      SlNo: "1",
      PrdDesc: sale.assetType === "LAND" ? "Land/Plot" : "Built Unit",
      HsnCd: "997237",                                  // real estate HSN
      Qty: 1,
      Unit: "NOS",
      UnitPrice: salePrice.toNumber(),
      TotAmt: salePrice.toNumber(),
      AssAmt: salePrice.toNumber(),
      GstRt: new Decimal(sale.gstRate).toNumber(),
      CgstAmt: split.cgst.toNumber(),
      SgstAmt: split.sgst.toNumber(),
      IgstAmt: split.igst.toNumber(),
      TotItemVal: total.toNumber(),
    }],
  };
}

// ── Generate IRN ───────────────────────────────────────────────────

export async function generateMaterialSaleIrn(
  saleId: string,
  companyId: string,
  userId?: string,
): Promise<{ irn: string; ackNo: string; status: string }> {
  return withSerializableTransaction(async (tx) => {
    const payload = await buildMaterialSaleEInvoicePayload(saleId, companyId);
    if (!payload) {
      throw new ServiceError(
        "e-Invoice not eligible: both company and customer must have GSTIN (B2B only)",
        400,
      );
    }

    // Check if IRN already exists
    const existing = await tx.materialSale.findUnique({
      where: { id: saleId },
      select: { irn: true, irnStatus: true },
    });
    if (existing?.irn && existing.irnStatus === "GENERATED") {
      throw new ServiceError("IRN already generated for this invoice", 409);
    }

    let result: EInvoiceResult;
    try {
      result = await provider.generate(payload);
    } catch (err) {
      // Record the failure
      await tx.materialSale.update({
        where: { id: saleId },
        data: {
          irnStatus: "FAILED",
          irnError: err instanceof Error ? err.message : "Unknown error",
        },
      });
      throw new ServiceError(
        `e-Invoice generation failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        502,
      );
    }

    const updated = await tx.materialSale.update({
      where: { id: saleId },
      data: {
        irn: result.irn,
        irnAckNo: result.ackNo,
        irnAckDate: new Date(result.ackDt),
        irnQrCode: result.qrCode,
        irnStatus: "GENERATED",
        irnError: null,
        irnGeneratedAt: new Date(),
      },
    });

    await logAction(tx, {
      action: "E_INVOICE_GENERATED",
      companyId,
      userId,
      entityType: "MaterialSale",
      entityId: saleId,
      before: { irn: null },
      after: { irn: result.irn, ackNo: result.ackNo },
    });

    return { irn: updated.irn!, ackNo: updated.irnAckNo!, status: "GENERATED" };
  });
}

export async function generateAssetSaleIrn(
  saleId: string,
  companyId: string,
  userId?: string,
): Promise<{ irn: string; ackNo: string; status: string }> {
  return withSerializableTransaction(async (tx) => {
    const payload = await buildAssetSaleEInvoicePayload(saleId, companyId);
    if (!payload) {
      throw new ServiceError(
        "e-Invoice not eligible: both company and customer must have GSTIN (B2B only)",
        400,
      );
    }

    const existing = await tx.assetSale.findUnique({
      where: { id: saleId },
      select: { irn: true, irnStatus: true },
    });
    if (existing?.irn && existing.irnStatus === "GENERATED") {
      throw new ServiceError("IRN already generated for this invoice", 409);
    }

    let result: EInvoiceResult;
    try {
      result = await provider.generate(payload);
    } catch (err) {
      await tx.assetSale.update({
        where: { id: saleId },
        data: {
          irnStatus: "FAILED",
          irnError: err instanceof Error ? err.message : "Unknown error",
        },
      });
      throw new ServiceError(
        `e-Invoice generation failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        502,
      );
    }

    const updated = await tx.assetSale.update({
      where: { id: saleId },
      data: {
        irn: result.irn,
        irnAckNo: result.ackNo,
        irnAckDate: new Date(result.ackDt),
        irnQrCode: result.qrCode,
        irnStatus: "GENERATED",
        irnError: null,
        irnGeneratedAt: new Date(),
      },
    });

    await logAction(tx, {
      action: "E_INVOICE_GENERATED",
      companyId,
      userId,
      entityType: "AssetSale",
      entityId: saleId,
      before: { irn: null },
      after: { irn: result.irn, ackNo: result.ackNo },
    });

    return { irn: updated.irn!, ackNo: updated.irnAckNo!, status: "GENERATED" };
  });
}

// ── Cancel IRN ─────────────────────────────────────────────────────

export async function cancelMaterialSaleIrn(
  saleId: string,
  companyId: string,
  reason: string,
  userId?: string,
): Promise<{ status: string }> {
  return withSerializableTransaction(async (tx) => {
    const sale = await tx.materialSale.findFirst({
      where: { id: saleId, companyId },
      select: { irn: true, irnStatus: true },
    });
    if (!sale) throw new ServiceError("Sale not found", 404);
    if (!sale.irn || sale.irnStatus !== "GENERATED") {
      throw new ServiceError("No active IRN to cancel", 400);
    }

    const result = await provider.cancel(sale.irn, reason);

    await tx.materialSale.update({
      where: { id: saleId },
      data: {
        irnStatus: "CANCELLED",
        irnCancelledAt: new Date(result.cancelDate),
        irnError: null,
      },
    });

    await logAction(tx, {
      action: "E_INVOICE_CANCELLED",
      companyId,
      userId,
      entityType: "MaterialSale",
      entityId: saleId,
      before: { irn: sale.irn, status: "GENERATED" },
      after: { irn: sale.irn, status: "CANCELLED", reason },
    });

    return { status: "CANCELLED" };
  });
}

export async function cancelAssetSaleIrn(
  saleId: string,
  companyId: string,
  reason: string,
  userId?: string,
): Promise<{ status: string }> {
  return withSerializableTransaction(async (tx) => {
    const sale = await tx.assetSale.findFirst({
      where: { id: saleId, companyId },
      select: { irn: true, irnStatus: true },
    });
    if (!sale) throw new ServiceError("Sale not found", 404);
    if (!sale.irn || sale.irnStatus !== "GENERATED") {
      throw new ServiceError("No active IRN to cancel", 400);
    }

    const result = await provider.cancel(sale.irn, reason);

    await tx.assetSale.update({
      where: { id: saleId },
      data: {
        irnStatus: "CANCELLED",
        irnCancelledAt: new Date(result.cancelDate),
        irnError: null,
      },
    });

    await logAction(tx, {
      action: "E_INVOICE_CANCELLED",
      companyId,
      userId,
      entityType: "AssetSale",
      entityId: saleId,
      before: { irn: sale.irn, status: "GENERATED" },
      after: { irn: sale.irn, status: "CANCELLED", reason },
    });

    return { status: "CANCELLED" };
  });
}

// ── Helpers ────────────────────────────────────────────────────────

export function formatDateForNic(date: Date): string {
  const d = new Date(date);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}
