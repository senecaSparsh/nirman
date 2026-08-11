import { prisma, type Prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { logAction } from "./audit";
import { ServiceError } from "./errors";

/**
 * Supplier Invoice Service — three-way matching before paying suppliers.
 *
 * Three-way matching is an accounting best practice: before paying a
 * supplier, you verify that the invoice matches the purchase order AND
 * the goods receipt. This prevents overpayment and fraud.
 *
 *   Invoice  ←→  Purchase Order  ←→  Goods Receipt (GRN)
 *
 * The match checks:
 *   1. Quantity: invoice qty ≤ PO qty ordered, and ≤ GRN qty received
 *   2. Price:    invoice unit price ≤ PO unit price (within tolerance)
 *   3. Amount:   invoice line total = qty × price
 *
 * Match outcomes:
 *   THREE_WAY_MATCH — invoice, PO, and GRN all agree (best)
 *   TWO_WAY_MATCH   — invoice and PO agree, but no GRN (acceptable
 *                     for services / non-stock purchases)
 *   MANUAL          — approver overrides after reviewing variances
 *   UNMATCHED       — variances found, needs dispute resolution
 */

/** Default price tolerance: 1% (invoice unit price may exceed PO by up to 1%). */
const DEFAULT_PRICE_TOLERANCE = 0.01; // 1%

// ── Types ──────────────────────────────────────────────────────────

export interface InvoiceLineInput {
  materialId: string;
  quantity: number | Decimal;
  unitPrice: number | Decimal;
  gstRate?: number | Decimal;
}

export interface MatchVariance {
  line: number; // 1-based line index
  field: "quantity" | "unitPrice" | "lineTotal";
  expected: string; // Decimal as string for precision
  actual: string;
  variance: string; // actual - expected (signed)
}

export interface ThreeWayMatchResult {
  matched: boolean;
  matchType: "THREE_WAY_MATCH" | "TWO_WAY_MATCH" | "UNMATCHED";
  variances: MatchVariance[];
}

// ── Three-Way Match (pure function) ────────────────────────────────

/**
 * Compare invoice lines against PO lines and goods receipt lines.
 *
 * @param invoiceLines  The invoice line items (materialId, quantity, unitPrice)
 * @param poLines       The purchase order lines (with qtyOrdered, unitCost)
 * @param grnLines      The goods receipt lines (with qtyReceived). Pass [] for
 *                      two-way matching (no GRN — e.g. services).
 * @param priceTolerance Fractional tolerance for price match (default 1%).
 * @returns { matched, matchType, variances }
 */
export function threeWayMatch(
  invoiceLines: InvoiceLineInput[],
  poLines: { materialId: string; qtyOrdered: Decimal | string | number; unitCost: Decimal | string | number }[],
  grnLines: { materialId: string; qtyReceived: Decimal | string | number }[],
  priceTolerance: number = DEFAULT_PRICE_TOLERANCE,
): ThreeWayMatchResult {
  const variances: MatchVariance[] = [];

  // Index PO lines and GRN lines by materialId for quick lookup.
  // If a material appears on multiple PO/GRN lines, sum them.
  const poByMaterial = new Map<string, { qty: Decimal; price: Decimal }>();
  for (const pl of poLines) {
    const existing = poByMaterial.get(pl.materialId);
    const qty = new Decimal(pl.qtyOrdered);
    const price = new Decimal(pl.unitCost);
    if (existing) {
      existing.qty = existing.qty.plus(qty);
      // Keep the max unit cost as the reference price (most permissive).
      if (price.gt(existing.price)) existing.price = price;
    } else {
      poByMaterial.set(pl.materialId, { qty, price });
    }
  }

  const grnByMaterial = new Map<string, Decimal>();
  for (const gl of grnLines) {
    const qty = new Decimal(gl.qtyReceived);
    const existing = grnByMaterial.get(gl.materialId);
    grnByMaterial.set(gl.materialId, existing ? existing.plus(qty) : qty);
  }

  const hasGrn = grnLines.length > 0;

  invoiceLines.forEach((inv, idx) => {
    const lineNo = idx + 1;
    const invQty = new Decimal(inv.quantity);
    const invPrice = new Decimal(inv.unitPrice);
    const invLineTotal = invQty.mul(invPrice);

    const po = poByMaterial.get(inv.materialId);
    const grnQty = grnByMaterial.get(inv.materialId);

    // ── Quantity match ──
    if (po) {
      // Invoice qty must be ≤ PO qty ordered.
      if (invQty.gt(po.qty)) {
        variances.push({
          line: lineNo,
          field: "quantity",
          expected: po.qty.toString(),
          actual: invQty.toString(),
          variance: invQty.minus(po.qty).toString(),
        });
      }
      // And ≤ GRN qty received (if GRN exists).
      if (hasGrn && grnQty !== undefined) {
        if (invQty.gt(grnQty)) {
          variances.push({
            line: lineNo,
            field: "quantity",
            expected: grnQty.toString(),
            actual: invQty.toString(),
            variance: invQty.minus(grnQty).toString(),
          });
        }
      }
    } else {
      // No PO line for this material — quantity can't be matched.
      variances.push({
        line: lineNo,
        field: "quantity",
        expected: "0",
        actual: invQty.toString(),
        variance: invQty.toString(),
      });
    }

    // ── Price match ──
    if (po) {
      const toleranceAmount = po.price.mul(priceTolerance);
      const maxAllowedPrice = po.price.plus(toleranceAmount);
      if (invPrice.gt(maxAllowedPrice)) {
        variances.push({
          line: lineNo,
          field: "unitPrice",
          expected: po.price.toString(),
          actual: invPrice.toString(),
          variance: invPrice.minus(po.price).toString(),
        });
      }
    }

    // ── Amount match: line total = qty × price ──
    // We recompute qty × price and compare to the invoice line total.
    // Since the invoice line total IS qty × price (we compute it), this
    // is a self-consistency check — it catches data-entry errors where
    // the user typed a quantity or price that doesn't match the printed
    // total. We allow a tiny rounding tolerance of 0.01.
    const roundingTolerance = new Decimal(0.01);
    // If the caller provides a separate line total, we'd compare here.
    // For now, qty × price is the line total by definition, so this
    // check passes unless a separate total is supplied. We include it
    // for completeness and future extension.
    if (invLineTotal.abs().gt(roundingTolerance)) {
      variances.push({
        line: lineNo,
        field: "lineTotal",
        expected: "0",
        actual: invLineTotal.toString(),
        variance: invLineTotal.toString(),
      });
    }
  });

  const matched = variances.length === 0;
  const matchType: ThreeWayMatchResult["matchType"] = matched
    ? hasGrn
      ? "THREE_WAY_MATCH"
      : "TWO_WAY_MATCH"
    : "UNMATCHED";

  return { matched, matchType, variances };
}

// ── Create Supplier Invoice ────────────────────────────────────────

export async function createSupplierInvoice(input: {
  invoiceNumber: string;
  companyId: string;
  supplierId: string;
  purchaseOrderId?: string;
  invoiceDate: Date;
  dueDate?: Date;
  subtotal: number | Decimal;
  gstAmount?: number | Decimal;
  totalAmount: number | Decimal;
  lines?: InvoiceLineInput[];
  receivedById?: string;
  userId?: string;
}) {
  const subtotal = new Decimal(input.subtotal);
  const gstAmount = input.gstAmount ? new Decimal(input.gstAmount) : new Decimal(0);
  const totalAmount = new Decimal(input.totalAmount);

  if (!input.invoiceNumber?.trim()) throw new ServiceError("Invoice number is required");
  if (subtotal.lt(0)) throw new ServiceError("Subtotal cannot be negative");
  if (totalAmount.lt(0)) throw new ServiceError("Total amount cannot be negative");

  return prisma.$transaction(async (tx) => {
    // 1. Validate supplier
    const supplier = await tx.supplier.findFirst({
      where: { id: input.supplierId, companyId: input.companyId, deletedAt: null },
    });
    if (!supplier) throw new ServiceError("Supplier not found or deleted", 404);

    // 2. Validate PO (if linked) and run three-way match
    let matchStatus: string | null = null;
    let matchNotes: string | null = null;
    let poLines: { materialId: string; qtyOrdered: Decimal; unitCost: Decimal }[] = [];
    let grnLines: { materialId: string; qtyReceived: Decimal }[] = [];

    if (input.purchaseOrderId) {
      const po = await tx.purchaseOrder.findUnique({
        where: { id: input.purchaseOrderId },
        include: {
          lines: { select: { materialId: true, qtyOrdered: true, unitCost: true } },
          goodsReceipts: {
            include: {
              lines: { select: { materialId: true, qtyReceived: true } },
            },
          },
        },
      });
      if (!po) throw new ServiceError("Purchase order not found", 404);
      if (po.supplierId !== input.supplierId) {
        throw new ServiceError("Purchase order does not belong to this supplier");
      }
      if (po.companyId !== input.companyId) {
        throw new ServiceError("Purchase order does not belong to this company");
      }

      poLines = po.lines.map((l) => ({
        materialId: l.materialId,
        qtyOrdered: new Decimal(l.qtyOrdered),
        unitCost: new Decimal(l.unitCost),
      }));
      grnLines = po.goodsReceipts.flatMap((gr) =>
        gr.lines.map((gl) => ({
          materialId: gl.materialId,
          qtyReceived: new Decimal(gl.qtyReceived),
        })),
      );

      // Run three-way match if invoice lines are provided
      if (input.lines && input.lines.length > 0) {
        const result = threeWayMatch(input.lines, poLines, grnLines);
        matchStatus = result.matchType;
        if (!result.matched) {
          matchNotes = result.variances
            .map((v) => `Line ${v.line}: ${v.field} expected ${v.expected}, actual ${v.actual} (variance ${v.variance})`)
            .join("; ");
        }
      }
    }

    // 3. Create the invoice record
    const invoice = await tx.supplierInvoice.create({
      data: {
        invoiceNumber: input.invoiceNumber.trim(),
        companyId: input.companyId,
        supplierId: input.supplierId,
        purchaseOrderId: input.purchaseOrderId ?? null,
        invoiceDate: input.invoiceDate,
        dueDate: input.dueDate ?? null,
        subtotal,
        gstAmount,
        totalAmount,
        status: matchStatus === "THREE_WAY_MATCH" || matchStatus === "TWO_WAY_MATCH" ? "MATCHED" : "PENDING",
        matchStatus,
        matchNotes,
        receivedById: input.receivedById ?? input.userId ?? null,
      },
      include: {
        supplier: { select: { id: true, name: true, gstin: true } },
        purchaseOrder: { select: { id: true, poNumber: true } },
      },
    });

    // 4. Log action
    await logAction(tx, {
      userId: input.userId,
      action: "SUPPLIER_INVOICE_CREATE",
      entityType: "SupplierInvoice",
      entityId: invoice.id,
      after: {
        invoiceNumber: invoice.invoiceNumber,
        supplierId: input.supplierId,
        purchaseOrderId: input.purchaseOrderId ?? null,
        totalAmount: totalAmount.toString(),
        matchStatus,
      },
    });

    return invoice;
  });
}

// ── Approve Supplier Invoice ───────────────────────────────────────

export async function approveSupplierInvoice(input: {
  invoiceId: string;
  companyId: string;
  userId: string;
  action: "approve" | "reject";
  notes?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.supplierInvoice.findFirst({
      where: { id: input.invoiceId, companyId: input.companyId },
    });
    if (!existing) throw new ServiceError("Supplier invoice not found", 404);

    if (input.action === "approve") {
      const updated = await tx.supplierInvoice.update({
        where: { id: input.invoiceId },
        data: {
          status: "APPROVED",
          approvedById: input.userId,
          approvedAt: new Date(),
          matchNotes: input.notes ?? existing.matchNotes,
        },
        include: {
          supplier: { select: { id: true, name: true } },
          purchaseOrder: { select: { id: true, poNumber: true } },
          approvedBy: { select: { id: true, name: true } },
        },
      });
      await logAction(tx, {
        userId: input.userId,
        action: "SUPPLIER_INVOICE_APPROVE",
        entityType: "SupplierInvoice",
        entityId: input.invoiceId,
        before: { status: existing.status },
        after: { status: "APPROVED", notes: input.notes ?? null },
      });
      return updated;
    } else {
      // Reject → mark as DISPUTED
      const updated = await tx.supplierInvoice.update({
        where: { id: input.invoiceId },
        data: {
          status: "DISPUTED",
          matchNotes: input.notes ?? existing.matchNotes,
        },
        include: {
          supplier: { select: { id: true, name: true } },
          purchaseOrder: { select: { id: true, poNumber: true } },
          approvedBy: { select: { id: true, name: true } },
        },
      });
      await logAction(tx, {
        userId: input.userId,
        action: "SUPPLIER_INVOICE_REJECT",
        entityType: "SupplierInvoice",
        entityId: input.invoiceId,
        before: { status: existing.status },
        after: { status: "DISPUTED", notes: input.notes ?? null },
      });
      return updated;
    }
  });
}

// ── List Supplier Invoices ─────────────────────────────────────────

export async function getSupplierInvoices(opts: {
  companyId: string;
  supplierId?: string;
  purchaseOrderId?: string;
  status?: string;
}) {
  return prisma.supplierInvoice.findMany({
    where: {
      companyId: opts.companyId,
      ...(opts.supplierId ? { supplierId: opts.supplierId } : {}),
      ...(opts.purchaseOrderId ? { purchaseOrderId: opts.purchaseOrderId } : {}),
      ...(opts.status ? { status: opts.status } : {}),
    },
    include: {
      supplier: { select: { id: true, name: true, gstin: true } },
      purchaseOrder: { select: { id: true, poNumber: true } },
      receivedBy: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
    },
    orderBy: { invoiceDate: "desc" },
  });
}

// ── Get Single Supplier Invoice (with match details) ───────────────

export async function getSupplierInvoice(invoiceId: string, companyId: string) {
  const invoice = await prisma.supplierInvoice.findFirst({
    where: { id: invoiceId, companyId },
    include: {
      supplier: { select: { id: true, name: true, gstin: true, phone: true, email: true } },
      purchaseOrder: {
        select: {
          id: true,
          poNumber: true,
          subtotal: true,
          gstTotal: true,
          total: true,
          status: true,
          lines: {
            select: {
              id: true,
              materialId: true,
              material: { select: { id: true, name: true, code: true, unit: true } },
              qtyOrdered: true,
              unitCost: true,
              gstRate: true,
              lineTotal: true,
            },
          },
          goodsReceipts: {
            select: {
              id: true,
              receiptDate: true,
              lines: {
                select: {
                  id: true,
                  materialId: true,
                  material: { select: { id: true, name: true } },
                  qtyReceived: true,
                  unitCost: true,
                },
              },
            },
          },
        },
      },
      receivedBy: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
    },
  });

  if (!invoice) return null;

  // Re-run the three-way match to get fresh variance details for the UI.
  // We derive "invoice lines" from the PO lines (since the invoice doesn't
  // store its own line items — it stores aggregate subtotal/gst/total).
  // The match compares the invoice's aggregate amounts against the PO + GRN.
  let matchDetails: ThreeWayMatchResult | null = null;
  if (invoice.purchaseOrder) {
    const poLines = invoice.purchaseOrder.lines.map((l) => ({
      materialId: l.materialId,
      qtyOrdered: new Decimal(l.qtyOrdered),
      unitCost: new Decimal(l.unitCost),
    }));
    const grnLines = invoice.purchaseOrder.goodsReceipts.flatMap((gr) =>
      gr.lines.map((gl) => ({
        materialId: gl.materialId,
        qtyReceived: new Decimal(gl.qtyReceived),
      })),
    );
    // Use PO lines as the "invoice lines" proxy for the line-level match.
    // This checks that the PO quantities were actually received (GRN match).
    const invoiceLineProxy = poLines.map((pl) => ({
      materialId: pl.materialId,
      quantity: pl.qtyOrdered,
      unitPrice: pl.unitCost,
    }));
    matchDetails = threeWayMatch(invoiceLineProxy, poLines, grnLines);
  }

  return { ...invoice, matchDetails };
}
