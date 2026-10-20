import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { logAction } from "./audit";
import { ServiceError } from "./errors";
import { postSupplierInvoice, reverseJournalEntry, ACCT } from "./gl-posting";
import { withSerializableTransaction } from "./transaction";
import { canAutoApprove } from "./rbac";
import { emitNotificationEvent, NotificationEventType } from "./notification-event-bus";

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
  quantity: number | Decimal | string;
  unitPrice: number | Decimal | string;
  gstRate?: number | Decimal | string;
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
  headerSubtotal?: Decimal | string | number,
): ThreeWayMatchResult {
  const variances: MatchVariance[] = [];
  const headerSub = headerSubtotal ? new Decimal(headerSubtotal) : null;

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
    const _invLineTotal = invQty.mul(invPrice);

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

    // ── Amount match: header subtotal vs sum of line totals ──
    // The invoice carries a header subtotal that should equal Σ(qty × price).
    // If they disagree, the supplier may have applied a discount, surcharge,
    // or rounded — flag it so the approver can review before paying.
  });

  // Header-level amount check: sum of line totals vs invoice subtotal.
  // This catches cases where the printed invoice total doesn't match the
  // line items (discounts, rounding, manual adjustments, data entry errors).
  if (invoiceLines.length > 0) {
    const lineTotalSum = invoiceLines.reduce(
      (sum, inv) => sum.plus(new Decimal(inv.quantity).mul(new Decimal(inv.unitPrice))),
      new Decimal(0),
    );
    // We compare against the header subtotal passed separately.
    // The caller is responsible for passing headerSubtotal.
    if (headerSub && !lineTotalSum.equals(headerSub)) {
      variances.push({
        line: 0, // line 0 = header-level variance
        field: "lineTotal",
        expected: headerSub.toString(),
        actual: lineTotalSum.toString(),
        variance: lineTotalSum.minus(headerSub).toString(),
      });
    }
  }

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
  subtotal: number | Decimal | string;
  gstAmount?: number | Decimal | string;
  totalAmount: number | Decimal | string;
  hsnCode?: string;
  invoiceDocumentUrl?: string;
  invoiceDocumentName?: string;
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

  // Arithmetic invariants — the GL posts off totalAmount while the three-way
  // match checks the lines; a mismatch means the books and the bill disagree.
  // ₹1 tolerance for rounding.
  if (totalAmount.minus(subtotal).minus(gstAmount).abs().gt(1)) {
    throw new ServiceError(
      `Invoice arithmetic doesn't add up: total ₹${totalAmount} ≠ subtotal ₹${subtotal} + GST ₹${gstAmount}`,
      400,
    );
  }
  if (input.lines && input.lines.length > 0) {
    const linesSum = input.lines.reduce(
      (s, l) => s.plus(new Decimal(l.quantity).times(new Decimal(l.unitPrice))),
      new Decimal(0),
    );
    if (linesSum.minus(subtotal).abs().gt(1)) {
      throw new ServiceError(
        `Line items total ₹${linesSum} but the invoice subtotal says ₹${subtotal} — fix the lines or the subtotal`,
        400,
      );
    }
  }

  // M2: Material invoices (with line items) must be linked to a Purchase Order
  // so the three-way match can run. Services invoices (no lines) may skip the PO.
  if (input.lines && input.lines.length > 0 && !input.purchaseOrderId) {
    throw new ServiceError(
      "Supplier invoices for materials must be linked to a Purchase Order for three-way matching. " +
      "For services invoices (no material lines), omit the lines array.",
    );
  }

  const result = await withSerializableTransaction(async (tx) => {
    // 1. Validate supplier
    const supplier = await tx.supplier.findFirst({
      where: { id: input.supplierId, companyId: input.companyId, deletedAt: null },
    });
    if (!supplier) throw new ServiceError("Supplier not found or deleted", 404);

    // 1b. Duplicate-invoice guard — a supplier's invoice number is unique per
    // their billing. Recording the same bill twice pays it twice.
    const dupe = await tx.supplierInvoice.findFirst({
      where: {
        companyId: input.companyId,
        supplierId: input.supplierId,
        invoiceNumber: input.invoiceNumber.trim(),
      },
      select: { id: true, status: true },
    });
    if (dupe) {
      throw new ServiceError(
        `Invoice ${input.invoiceNumber.trim()} is already recorded for this supplier (${dupe.status}). Check the invoice number — the same bill cannot be booked twice.`,
        409,
      );
    }

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
              lines: { select: { materialId: true, qtyReceived: true, inspectionStatus: true } },
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

      // QC gate — an invoice for goods that failed inspection must not be
      // booked. PENDING is allowed (QC can run after receipt); REJECTED is
      // not — paying for rejected goods is the fraud vector this prevents.
      const rejectedLines = po.goodsReceipts.flatMap((gr) =>
        gr.lines.filter((gl) => gl.inspectionStatus === "REJECTED"),
      );
      if (rejectedLines.length > 0) {
        throw new ServiceError(
          `Cannot book an invoice for this PO — ${rejectedLines.length} received line(s) failed quality inspection. Reject the goods or re-inspect before invoicing.`,
          422,
        );
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
        const result = threeWayMatch(input.lines, poLines, grnLines, DEFAULT_PRICE_TOLERANCE, subtotal);
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
        hsnCode: input.hsnCode ?? null,
        invoiceDocumentUrl: input.invoiceDocumentUrl ?? null,
        invoiceDocumentName: input.invoiceDocumentName ?? null,
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
      companyId: input.companyId,
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

  // Outside the tx — a bill that matched (or was keyed in manually) needs a
  // finance review; notify the approvers it landed. Fire-and-forget.
  void emitNotificationEvent({
    eventType: NotificationEventType.SUPPLIER_INVOICE_SUBMITTED,
    companyId: input.companyId,
    entityType: "SupplierInvoice",
    entityId: result.id,
    excludeIds: [input.userId ?? null],
    variables: {
      invoiceId: result.id,
      invoiceNumber: result.invoiceNumber,
      supplierName: result.supplier?.name ?? "",
      totalAmount: result.totalAmount?.toString() ?? "",
    },
    timestamp: new Date(),
  });

  return result;
}

// ── Approve Supplier Invoice ───────────────────────────────────────

export async function approveSupplierInvoice(input: {
  invoiceId: string;
  companyId: string;
  userId: string;
  action: "approve" | "reject";
  notes?: string;
  /** The actor's role — tier-1 roles may approve an invoice they received. */
  actorRole?: string;
}) {
  return withSerializableTransaction(async (tx) => {
    const existing = await tx.supplierInvoice.findFirst({
      where: { id: input.invoiceId, companyId: input.companyId },
    });
    if (!existing) throw new ServiceError("Supplier invoice not found", 404);

    // Status guard — approving an already-APPROVED/PAID invoice used to run
    // the whole posting path again: duplicate journal entries, double-counted
    // Supplier.balanceOwed, and a PAID invoice silently regressing to
    // APPROVED. PENDING, MATCHED (three-way match succeeded — awaiting the
    // human approve), and DISPUTED-after-resolve may transition.
    if (input.action === "approve" && existing.status !== "PENDING" && existing.status !== "MATCHED" && existing.status !== "DISPUTED") {
      throw new ServiceError(`Invoice is already ${existing.status.toLowerCase()} — cannot approve again`, 409);
    }
    if (input.action === "reject" && existing.status !== "PENDING") {
      throw new ServiceError(`Invoice is already ${existing.status.toLowerCase()} — cannot reject`, 409);
    }

    // Prevent self-approval — the receiver cannot approve an invoice they
    // recorded — unless a tier-1 role (OWNER/ADMIN), where no higher approver exists.
    if (
      input.action === "approve" &&
      existing.receivedById &&
      existing.receivedById === input.userId &&
      !canAutoApprove(input.actorRole)
    ) {
      throw new ServiceError("You cannot approve an invoice you received. Ask another approver to review it.", 403);
    }

    if (input.action === "approve") {
      // Determine if this is a services invoice (no GRN) or goods invoice.
      // For services: post the full invoice to GL (Dr Expense / Dr Input GST / Cr AP)
      // and increment Supplier.balanceOwed.
      // For goods: AP was already booked at GRN time; only post the variance.
      let isServicesInvoice = true;
      let varianceTotal = new Decimal(0);
      let varianceSubtotal = new Decimal(0);
      let varianceGst = new Decimal(0);

      if (existing.purchaseOrderId) {
        const po = await tx.purchaseOrder.findUnique({
          where: { id: existing.purchaseOrderId },
          include: {
            goodsReceipts: { select: { id: true } },
          },
        });
        if (po && po.goodsReceipts.length > 0) {
          isServicesInvoice = false;
          // Compute variance: invoice subtotal − GRN subtotal (sum of qtyReceived × unitCost)
          const grnLines = await tx.goodsReceiptLine.findMany({
            where: { goodsReceipt: { purchaseOrderId: po.id } },
            select: { qtyReceived: true, unitCost: true },
          });
          const grnSubtotal = grnLines.reduce(
            (sum, l) => sum.plus(new Decimal(l.qtyReceived).times(new Decimal(l.unitCost))),
            new Decimal(0),
          );
          // Baseline is the UN-INVOICED remainder of the GRN, not the whole
          // GRN — prior approved invoices already consumed their share. A
          // second invoice covering the same receipt would otherwise compute
          // variance = 0, post nothing to AP, and still settle its full
          // totalAmount in cash: a silent double-payment. With the residual
          // baseline, a duplicate/over-scope invoice lands its excess on PPV
          // where the books show it.
          const priorBilled = await tx.supplierInvoice.aggregate({
            where: {
              purchaseOrderId: po.id,
              id: { not: existing.id },
              status: { in: ["APPROVED", "PAID", "MATCHED"] },
            },
            _sum: { subtotal: true },
          });
          const uninvoicedGrn = grnSubtotal.minus(priorBilled._sum.subtotal ?? 0);
          const invoiceSubtotal = new Decimal(existing.subtotal);
          const invoiceGst = new Decimal(existing.gstAmount);
          // Variance = invoice subtotal − un-invoiced GRN remainder
          varianceSubtotal = invoiceSubtotal.minus(uninvoicedGrn);
          // GST variance: use invoice GST as the GST variance if subtotal variance > 0
          varianceGst = varianceSubtotal.gt(0) ? invoiceGst : new Decimal(0);
          varianceTotal = varianceSubtotal.plus(varianceGst);
        }
      }

      const updated = await tx.supplierInvoice.update({
        where: { id: input.invoiceId },
        data: {
          status: "APPROVED",
          approvedById: input.userId,
          approvedAt: new Date(),
          matchNotes: input.notes ?? existing.matchNotes,
        },
        include: {
          supplier: { select: { id: true, name: true, balanceOwed: true } },
          purchaseOrder: { select: { id: true, poNumber: true } },
          approvedBy: { select: { id: true, name: true } },
        },
      });

      // Post GL for the invoice approval
      const glAmount = isServicesInvoice ? new Decimal(existing.totalAmount) : varianceTotal;
      if (glAmount.gt(0) || !isServicesInvoice) {
        await postSupplierInvoice(tx, {
          companyId: input.companyId,
          supplierInvoiceId: input.invoiceId,
          subtotal: new Decimal(existing.subtotal),
          gstAmount: new Decimal(existing.gstAmount),
          totalAmount: new Decimal(existing.totalAmount),
          isServicesInvoice,
          varianceTotal,
          varianceSubtotal,
          varianceGst,
          postedById: input.userId,
        });

        // Move Supplier.balanceOwed by the signed AP impact. Goods invoices
        // only post the variance leg — a negative variance DEBITS AP (the
        // supplier billed less than the GRN), so it must decrement the owed
        // balance too, or the card keeps showing the pre-invoice amount and
        // invites overpayment.
        const apIncrement = isServicesInvoice ? new Decimal(existing.totalAmount) : varianceTotal;
        if (!apIncrement.isZero()) {
          const newBalance = new Decimal(updated.supplier.balanceOwed).plus(apIncrement);
          await tx.supplier.update({
            where: { id: existing.supplierId },
            data: { balanceOwed: newBalance },
          });
        }
      }

      await logAction(tx, {
        userId: input.userId,
        companyId: input.companyId,
        action: "SUPPLIER_INVOICE_APPROVE",
        entityType: "SupplierInvoice",
        entityId: input.invoiceId,
        before: { status: existing.status },
        after: { status: "APPROVED", notes: input.notes ?? null, glPosted: true, isServicesInvoice },
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
        companyId: input.companyId,
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
    matchDetails = threeWayMatch(invoiceLineProxy, poLines, grnLines, DEFAULT_PRICE_TOLERANCE, new Decimal(invoice.subtotal));
  }

  return { ...invoice, matchDetails };
}

// ───────────────────────────────────────────────────────────
//  checkDueSupplierInvoices — cron sweep: supplier bills whose
//  dueDate has passed without being PAID. Emits
//  SUPPLIER_PAYMENT_DUE to finance roles, deduped per invoice
//  within 7 days (the cron runs every 15 min).
// ───────────────────────────────────────────────────────────

export async function checkDueSupplierInvoices(): Promise<{
  checked: number;
  due: number;
  notified: number;
}> {
  const now = new Date();
  const dedupeSince = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const invoices = await prisma.supplierInvoice.findMany({
    where: {
      dueDate: { lt: now },
      status: { in: ["PENDING", "MATCHED", "DISPUTED", "APPROVED"] },
    },
    select: {
      id: true,
      companyId: true,
      invoiceNumber: true,
      dueDate: true,
      totalAmount: true,
      supplier: { select: { name: true } },
    },
  });

  let notified = 0;
  for (const inv of invoices) {
    const recent = await prisma.inAppNotification.findFirst({
      where: {
        companyId: inv.companyId,
        eventType: NotificationEventType.SUPPLIER_PAYMENT_DUE,
        createdAt: { gte: dedupeSince },
        metadata: { path: ["supplierInvoiceId"], equals: inv.id },
      },
      select: { id: true },
    });
    if (recent) continue;

    void emitNotificationEvent({
      eventType: NotificationEventType.SUPPLIER_PAYMENT_DUE,
      companyId: inv.companyId,
      entityType: "SupplierInvoice",
      entityId: inv.id,
      variables: {
        supplierInvoiceId: inv.id,
        supplierName: inv.supplier.name,
        amount: inv.totalAmount.toString(),
        invoiceNumber: inv.invoiceNumber,
        dueDate: inv.dueDate!.toLocaleDateString("en-IN"),
      },
      timestamp: new Date(),
    });
    notified++;
  }

  // Section 43B(h) cliff — an MSME supplier unpaid 45 days past invoice date
  // turns the expense non-deductible this FY. Warn a week out so finance can
  // pay before the deduction is lost; the overdue sweep only fires after the
  // invoice's own dueDate, which may already be past the statutory window.
  const cliffStart = new Date(now.getTime() + 38 * 24 * 60 * 60 * 1000);
  const msmeApproaching = await prisma.supplierInvoice.findMany({
    where: {
      status: { in: ["PENDING", "MATCHED", "DISPUTED", "APPROVED"] },
      invoiceDate: { gte: new Date(cliffStart.getTime() - 45 * 24 * 60 * 60 * 1000 * 2), lte: now },
      supplier: { isMsme: true },
    },
    select: { id: true, companyId: true, invoiceNumber: true, invoiceDate: true, totalAmount: true, supplier: { select: { name: true } } },
  });
  for (const inv of msmeApproaching) {
    const ageDays = Math.floor((now.getTime() - inv.invoiceDate.getTime()) / 86400000);
    if (ageDays < 38 || ageDays > 60) continue;
    const daysLeft = 45 - ageDays;
    const recent = await prisma.inAppNotification.findFirst({
      where: {
        companyId: inv.companyId,
        eventType: NotificationEventType.MSME_CLIFF_WARNING,
        createdAt: { gte: dedupeSince },
        metadata: { path: ["supplierInvoiceId"], equals: inv.id },
      },
      select: { id: true },
    });
    if (recent) continue;
    void emitNotificationEvent({
      eventType: NotificationEventType.MSME_CLIFF_WARNING,
      companyId: inv.companyId,
      entityType: "SupplierInvoice",
      entityId: inv.id,
      variables: {
        supplierInvoiceId: inv.id,
        supplierName: inv.supplier.name,
        amount: inv.totalAmount.toString(),
        invoiceNumber: inv.invoiceNumber,
        daysLeft: String(Math.max(0, daysLeft)),
        message: daysLeft > 0
          ? `MSME invoice ${inv.invoiceNumber} (${inv.supplier.name}) is ${ageDays} days old — pay within ${daysLeft} day(s) or the expense becomes non-deductible under Sec 43B(h).`
          : `MSME invoice ${inv.invoiceNumber} (${inv.supplier.name}) has crossed 45 days — the expense is now non-deductible under Sec 43B(h) for this FY.`,
      },
      timestamp: new Date(),
    });
  }

  return { checked: invoices.length, due: invoices.length, notified };
}

/**
 * Void a wrongly-entered supplier invoice — never deleted (audit trail).
 *
 * Only allowed when no money has moved: any non-VOID supplier payment linked
 * to the invoice refuses the void. On APPROVED invoices the JE is reversed
 * (SUPPLIER_INVOICE_REVERSAL — AP, ITC, PPV, expense all unwind) and
 * Supplier.balanceOwed decrements by the same signed AP impact the approval
 * added (services: full totalAmount; goods: the invoice-vs-GRN variance —
 * AP was booked at GRN, so only the variance leg unwinds). PENDING/MATCHED/
 * DISPUTED invoices post no GL — voiding them just withdraws the entry.
 */
export async function voidSupplierInvoice(input: {
  invoiceId: string;
  companyId: string;
  userId?: string;
  reason?: string;
}) {
  return withSerializableTransaction(async (tx) => {
    const inv = await tx.supplierInvoice.findFirst({
      where: { id: input.invoiceId, companyId: input.companyId },
      include: { supplier: { select: { id: true, balanceOwed: true } } },
    });
    if (!inv) throw new ServiceError("Supplier invoice not found", 404);
    if (inv.status === "VOID") throw new ServiceError("Invoice is already voided", 409);
    if (inv.status === "PAID") {
      throw new ServiceError("Cannot void a PAID invoice — void its payments first", 409);
    }
    const paidCount = await tx.supplierPayment.count({
      where: { invoiceId: inv.id, status: { not: "VOID" } },
    });
    if (paidCount > 0) {
      throw new ServiceError(`Cannot void — ${paidCount} payment(s) reference this invoice. Void them first.`, 409);
    }

    const wasApproved = inv.status === "APPROVED";
    await tx.supplierInvoice.update({
      where: { id: inv.id },
      data: { status: "VOID" },
    });

    if (wasApproved) {
      // Derive the AP impact from the journal entry being reversed, not by
      // re-running the approve-time variance math — the un-invoiced-remainder
      // baseline shifts as other invoices approve, so a recompute can unwind
      // a different amount than approval posted and drift balanceOwed from
      // the GL. The JE's AP leg IS the impact: credit = owed +, debit = −.
      const je = await tx.journalEntry.findFirst({
        where: { sourceType: "SUPPLIER_INVOICE", sourceId: inv.id, status: "POSTED" },
        include: { lines: { include: { account: { select: { code: true } } } } },
      });
      if (je) {
        const signedImpact = je.lines
          .filter((l) => l.account.code === ACCT.AP)
          .reduce((s, l) => s.plus(new Decimal(l.credit)).minus(new Decimal(l.debit)), new Decimal(0));
        if (!signedImpact.isZero()) {
          await tx.supplier.update({
            where: { id: inv.supplierId },
            data: { balanceOwed: new Decimal(inv.supplier.balanceOwed).minus(signedImpact) },
          });
        }
        await reverseJournalEntry(tx, je.id, {
          postedById: input.userId,
          memo: `Supplier invoice voided${input.reason ? `: ${input.reason}` : ""}`,
        });
      }
    }

    await logAction(tx, {
      userId: input.userId,
      companyId: input.companyId,
      action: "SUPPLIER_INVOICE_VOID",
      entityType: "SupplierInvoice",
      entityId: inv.id,
      before: { status: inv.status },
      after: { status: "VOID", reason: input.reason ?? null },
    });
    return { status: "VOID" };
  });
}
